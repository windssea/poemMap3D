import { clamp, hash2i, hashString, lerp, smoothstep } from '../../utils/math'
import { createSimplex2D, fbm } from '../../utils/noise'
import { segmentDistance } from '../../utils/geometry2d'
import { B } from '../block/Blocks'
import { S, packState } from '../block/BlockState'
import { buildBuilding, BuildingRegistry } from '../building/BuildingRegistry'
import { getProjection } from '../coordinate/GeoProjection'
import { Occupancy, OccupancyMap } from '../structure/OccupancyMap'
import { PlaceMode, type PreparedPlacement, preparePlacement } from '../structure/StructurePlacer'
import { VoxelStructure } from '../structure/VoxelStructure'
import type { TerrainManager } from '../terrain/TerrainManager'
import { type TerrainColumn, type TerrainModifier, WaterKind } from '../terrain/TerrainSample'
import type { TreeInstance, VegetationProfile } from '../vegetation/TreePlacementSystem'
import { TREE_SCALE_HEIGHT, TREES, TreeCache } from '../vegetation/TreeRegistry'
import { rotateXZ } from '../block/Direction'
import { LANDMARK_CATALOG } from './LandmarkCatalog'
import type { CameraPreset, LandmarkDefinition, PlaceAnchor, TerrainOp } from './LandmarkDefinition'
import { planSettlements } from './SettlementPlanner'

export interface ResolvedLandmark {
  index: number
  def: LandmarkDefinition
  x: number
  z: number
  /** 基准地面（方块 Y，顶层实心方块） */
  level: number
  camera: CameraPreset
  placements: PreparedPlacement[]
  trees: TreeInstance[]
  waterfall: { x: number; z: number; bottom: number; top: number; width: number } | null
}

const BUCKET = 64
const bkey = (i: number, j: number) => ((i + 1024) << 11) | (j + 1024)

/**
 * 地标注册表：把地标定义解析成世界坐标下的地形修改器、结构放置、占用图、显式种植与取景。
 *
 * 两阶段：
 *  1. 用不含地标的基础地形求每处的基准地面，生成地形修改器；
 *  2. 用含修改器的最终地形确定每座建筑的落地高度，登记占用、入口与视线通道。
 */
export class LandmarkRegistry {
  readonly landmarks: ResolvedLandmark[] = []
  readonly occupancy = new OccupancyMap()
  readonly modifiers: TerrainModifier[] = []
  private readonly byPlace = new Map<string, ResolvedLandmark>()
  private readonly placeBuckets = new Map<number, PreparedPlacement[]>()
  private readonly treeBuckets = new Map<number, TreeInstance[]>()

  constructor(anchors: readonly PlaceAnchor[], baseTerrain: TerrainManager) {
    const P = getProjection()
    const defs = [...LANDMARK_CATALOG, ...planSettlements(anchors, LANDMARK_CATALOG, (lng, lat) => P.project(lng, lat))]
    defs.forEach((def, index) => {
      const c = P.project(def.coordinate.lng, def.coordinate.lat)
      const [x, z] = this.clearOfCities(def, ...this.clearOfRivers(def, Math.round(c.x + (def.offset?.[0] ?? 0)), Math.round(c.z + (def.offset?.[1] ?? 0)), baseTerrain))
      const level = this.baseLevel(baseTerrain, x, z, !def.terrainModifier?.some((o) => o.t === 'hill')) + (def.levelDy ?? 0)
      const lm: ResolvedLandmark = {
        index,
        def,
        x,
        z,
        level,
        camera: def.cameraPreset ?? { yaw: 0.5, pitch: 0.55, distance: 80 },
        placements: [],
        trees: [],
        waterfall: null,
      }
      this.landmarks.push(lm)
      this.byPlace.set(def.poetryPlaceId, lm)
      this.modifiers.push(this.makeModifier(lm))
    })
  }

  /**
   * 小地标不落进大城：城池让河挪了位后，附近的别业、驿馆可能正好压在城里，
   * 那就沿最短方向推到城外（城墙外留一圈 + 自身半径）。
   */
  private clearOfCities(def: LandmarkDefinition, x: number, z: number): [number, number] {
    if (def.walls?.length) return [x, z]
    const r = Math.min(def.radius, 18)
    for (const o of this.landmarks) {
      const w = o.def.walls?.[0]
      if (!w) continue
      const hw = w.hw + Math.abs(w.x) + 6 + r
      const hd = w.hd + Math.abs(w.z) + 6 + r
      const dx = x - o.x
      const dz = z - o.z
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue
      if (hw - Math.abs(dx) < hd - Math.abs(dz)) x = o.x + (dx < 0 ? -hw : hw)
      else z = o.z + (dz < 0 ? -hd : hd)
    }
    return [x, z]
  }

  /**
   * 城池不压江河：城墙（或整片营造区）若盖住河湖水面，就在附近螺旋搜索一处不压水的位置，
   * 让城稍稍让开，河道照旧流过。
   */
  private clearOfRivers(def: LandmarkDefinition, x: number, z: number, t: TerrainManager): [number, number] {
    const w = def.walls?.[0]
    if (!w) return [x, z]
    const hw = w.hw + Math.abs(w.x) + 4
    const hd = w.hd + Math.abs(w.z) + 4
    const wet = (cx: number, cz: number) => {
      let n = 0
      for (let dz = -hd; dz <= hd; dz += 6)
        for (let dx = -hw; dx <= hw; dx += 6) {
          const c = t.column(cx + dx, cz + dz)
          if (c.waterY > c.height) n++
        }
      return n
    }
    const h0 = t.column(x, z).height
    /* 代价：压水最要紧，其次地势要与原址相近（不往山上搬），再次挪得越近越好 */
    const cost = (cx: number, cz: number) => wet(cx, cz) * 1000 + Math.abs(t.column(cx, cz).height - h0) * 25 + Math.hypot(cx - x, cz - z) * 4
    let best: [number, number] = [x, z]
    let bestCost = cost(x, z)
    if (bestCost < 1) return best
    // 细步螺旋（3 格一圈、24 个方向）：只挪到刚好不压水；挪动代价已超过当前最优就不必再往外找
    for (let r = 3; r <= 96 && r * 4 < bestCost; r += 3)
      for (let a = 0; a < 24; a++) {
        const cx = Math.round(x + Math.cos((a / 24) * Math.PI * 2) * r)
        const cz = Math.round(z + Math.sin((a / 24) * Math.PI * 2) * r)
        const c = cost(cx, cz)
        if (c < bestCost) {
          bestCost = c
          best = [cx, cz]
        }
      }
    return best
  }

  private baseLevel(t: TerrainManager, x: number, z: number, nearMacro: boolean): number {
    const hs: number[] = []
    for (let a = 0; a < 12; a++)
      for (const r of [0, 4, 8]) {
        const c = t.column(Math.round(x + Math.cos(a) * r), Math.round(z + Math.sin(a) * r))
        if (c.waterY < 0 || c.height >= c.waterY) hs.push(c.height)
      }
    if (!hs.length) return Math.floor(t.column(x, z).waterY + 1)
    hs.sort((a, b) => a - b)
    // 城址不偏离宏观海拔太多：山脚下的城不被细节噪声拉进沟里（自带山形的样板地标以山脚为准）
    const m = t.macro.height(x, z)
    return Math.floor(nearMacro ? clamp(hs[hs.length >> 1], m - 4, m + 4) : hs[hs.length >> 1])
  }

  private makeModifier(lm: ResolvedLandmark): TerrainModifier {
    const { def, x: cx, z: cz, level, index } = lm
    const ops: readonly TerrainOp[] = def.terrainModifier ?? [{ t: 'flatten', x: 0, z: 0, r: Math.max(6, def.radius * 0.4), blend: 8 }]
    const R = def.radius + 16
    const bo = def.biomeOverride
    const n = createSimplex2D(hashString(def.id))
    return {
      landmark: index,
      minX: cx - R,
      maxX: cx + R,
      minZ: cz - R,
      maxZ: cz + R,
      apply(col: TerrainColumn) {
        const dx = col.x - cx
        const dz = col.z - cz
        const d = Math.hypot(dx, dz)
        if (d <= def.radius) {
          col.landmark = index
          if (bo && d < bo.radius) col.biomeOverride = bo.biome
        }
        const wet = () => col.waterY >= 0 && col.height < col.waterY
        for (const op of ops) {
          switch (op.t) {
            case 'flatten': {
              const ox = dx - op.x
              const oz = dz - op.z
              const dist = op.square ? op.r + Math.max(Math.abs(ox) - op.r, Math.abs(oz) - (op.rz ?? op.r)) : Math.hypot(ox, oz)
              const blend = op.blend ?? 8
              if (dist >= op.r + blend) break
              if (wet() && !op.overWater) break
              const target = level + (op.dy ?? 0)
              if (dist < op.r) {
                col.height = target
                if (op.overWater && col.waterKind !== WaterKind.Sea) {
                  col.waterY = -1
                  col.waterDist = Math.max(col.waterDist, 4)
                }
                if (op.pave) col.paved = true
              } else if (col.height - target < 14) col.height = lerp(target, col.height, smoothstep(op.r, op.r + blend, dist))
              // 过渡带上高出甚多的是山：留着，不削平城外名山
              break
            }
            case 'lake': {
              const c = Math.cos(op.rot ?? 0)
              const s = Math.sin(op.rot ?? 0)
              const ox = dx - op.x
              const oz = dz - op.z
              const u = (ox * c + oz * s) / op.rx
              const v = (-ox * s + oz * c) / op.rz
              const rr = Math.hypot(u, v)
              if (rr < 1) {
                col.waterY = level
                col.height = Math.min(col.height, level - 1 - Math.round((op.depth ?? 3) * Math.sqrt(1 - rr)))
                col.waterKind = WaterKind.Lake
                col.waterDist = 0
              } else if (rr < 1.8) {
                // 湖岸缓坡：不留峭壁
                col.height = Math.min(col.height, lerp(level + 0.5, col.height, smoothstep(1, 1.8, rr)))
                const dist = (rr - 1) * Math.min(op.rx, op.rz)
                if (dist < col.waterDist) {
                  col.waterDist = dist
                  col.waterKind = WaterKind.Lake
                }
              }
              break
            }
            case 'hill': {
              const dist = Math.hypot(dx - op.x, dz - op.z)
              if (dist >= op.r || wet()) break
              // 山形：噪声扭曲半径并调制高度，避免规整的锥形与台阶金字塔
              const warp = 1 + 0.28 * fbm(n, col.x / 17, col.z / 17, 2)
              const dd = Math.min(1, (dist / op.r) * warp)
              const f = op.sharp ? Math.pow(1 - dd, 1.35) : 0.5 + 0.5 * Math.cos(Math.PI * dd)
              // 临水处山势压低，不在湖岸江边起峭壁
              const shore = col.waterDist < 1e8 ? smoothstep(0, 10, col.waterDist) : 1
              // 山形是“至少这么高”：原地已是校准过的真山时不再叠高
              const hh = op.h * f * shore * (0.78 + 0.35 * (0.5 + 0.5 * fbm(n, col.x / 11 + 40, col.z / 11, 3)))
              col.height = Math.max(col.height, level + hh, col.height + hh * 0.25)
              break
            }
            case 'causeway':
            case 'canal': {
              let best = Infinity
              for (let i = 1; i < op.pts.length; i++) best = Math.min(best, segmentDistance(dx, dz, op.pts[i - 1][0], op.pts[i - 1][1], op.pts[i][0], op.pts[i][1]).dist)
              if (op.t === 'causeway') {
                if (best < op.w) {
                  col.height = level + (op.dy ?? 0)
                  col.waterY = -1
                  col.waterDist = Math.max(1, op.w - best)
                  col.waterKind = WaterKind.Lake
                }
              } else if (best < op.w) {
                col.waterY = level
                col.height = Math.min(col.height, level - 2)
                col.waterKind = WaterKind.River
                col.waterDist = 0
                col.paved = false
              } else if (best < op.w + 3 && best - op.w < col.waterDist) {
                col.waterDist = best - op.w
                col.waterKind = WaterKind.River
              }
              break
            }
            case 'island': {
              const dist = Math.hypot(dx - op.x, dz - op.z)
              if (dist < op.r) {
                col.height = level + (op.dy ?? 0)
                col.waterY = -1
                col.waterDist = Math.max(1, op.r - dist)
              }
              break
            }
            case 'pave':
              if (dx >= op.x0 && dx <= op.x1 && dz >= op.z0 && dz <= op.z1 && !wet()) col.paved = true
              break
          }
        }
      },
    }
  }

  /** 第二阶段：在最终地形上落位建筑、城墙、瀑布与显式种植，并登记占用 */
  resolve(terrain: TerrainManager): void {
    for (const lm of this.landmarks) {
      const { def, x: cx, z: cz, level, index } = lm
      let order = index * 4096
      const add = (id: string, s: VoxelStructure, x: number, y: number, z: number, opts: { foundation?: boolean; clear?: number; entrance?: 'front' | 'both' | 'none'; rot?: number } = {}) => {
        const p = preparePlacement({
          id,
          structure: s,
          x,
          y,
          z,
          mode: PlaceMode.Replace,
          foundation: opts.foundation === false ? 0 : S(B.STONE_BRICK),
          clearHeight: opts.clear ?? 0,
          order: order++,
        })
        lm.placements.push(p)
        this.markStructure(p, opts.entrance ?? 'none', opts.rot ?? 0)
      }
      const isWet = (x: number, z: number) => {
        const c = terrain.column(x, z)
        return c.waterY >= 0 && c.height < c.waterY
      }

      /* 城墙与城门 */
      for (const w of def.walls ?? []) {
        const h = w.height ?? 7
        const wx = cx + w.x
        const wz = cz + w.z
        const y = level + 1
        const gateHalf = 7
        const run = (ax: number, az: number, len: number, alongZ: boolean, gateAt: number | null) => {
          let s = 0
          while (s < len) {
            if (gateAt !== null && s >= gateAt - gateHalf && s < gateAt + gateHalf) {
              s++
              continue
            }
            let e = s
            while (e < len && !(gateAt !== null && e >= gateAt - gateHalf && e < gateAt + gateHalf)) e++
            const seg = buildBuilding('wall', { length: e - s, height: h })
            add(`wall-${index}`, alongZ ? seg.rotate(1) : seg, alongZ ? ax : ax + s, y, alongZ ? az + s : az, { clear: h + 2 })
            s = e
          }
        }
        const L = w.hw * 2 + 1
        const D = w.hd * 2 + 1
        run(wx - w.hw, wz - w.hd, L, false, w.gates.includes('n') ? w.hw : null)
        run(wx - w.hw, wz + w.hd, L, false, w.gates.includes('s') ? w.hw : null)
        run(wx - w.hw, wz - w.hd, D, true, w.gates.includes('w') ? w.hd : null)
        run(wx + w.hw, wz - w.hd, D, true, w.gates.includes('e') ? w.hd : null)
        const gate = buildBuilding('gate', { width: 13, depth: 7, height: h, lanterns: true })
        const gates: Record<string, [number, number, number]> = { n: [wx, wz - w.hd, 2], s: [wx, wz + w.hd, 0], w: [wx - w.hw, wz, 1], e: [wx + w.hw, wz, 3] }
        for (const g of w.gates) {
          const [gx, gz, rot] = gates[g]
          add(`gate-${index}-${g}`, gate.rotate(rot), gx, y, gz, { clear: h + 10, entrance: 'both', rot })
        }
        const corner = buildBuilding('pavilion', { width: 5 })
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          add(`corner-${index}`, corner, wx + sx * w.hw, y + h, wz + sz * w.hd)
      }

      /* 建筑 */
      def.structures.forEach((spec, i) => {
        const x = Math.round(cx + spec.x)
        const z = Math.round(cz + spec.z)
        const isBridge = spec.b === 'bridge'
        if (!isBridge && isWet(x, z)) return
        const s = buildBuilding(spec.b, spec.p ?? {}).rotate(spec.rot ?? 0)
        const y = (spec.atLevel ? level + 1 : terrain.surfaceHeightAt(x, z) + 1) + (spec.dy ?? 0)
        const bd = BuildingRegistry.get(spec.b)!
        add(`${def.id}-${spec.b}-${i}`, s, x, y, z, { foundation: bd.foundation === 'stone', clear: isBridge ? 0 : 10, entrance: bd.entrance, rot: spec.rot ?? 0 })
      })

      /* 瀑布：从崖顶直落潭中 */
      if (def.waterfall) {
        const wf = def.waterfall
        const fx = cx + wf.x
        const fz = cz + wf.z
        let top = Infinity
        const half = Math.floor(wf.width / 2)
        for (let k = -half; k <= half; k++) top = Math.min(top, terrain.surfaceHeightAt(fx + k, fz - 1))
        const bottom = level
        if (top > bottom + 3) {
          const s = new VoxelStructure('waterfall')
          for (let k = -half; k <= half; k++) {
            for (let y = 0; y <= top - bottom; y++) s.set(k, y, 0, packState({ id: B.WATERFALL, variant: 1 }))
            s.set(k, top - bottom, -1, S(B.WATER))
          }
          lm.waterfall = { x: fx, z: fz, bottom, top, width: wf.width }
          add(`waterfall-${index}`, s, fx, bottom, fz, { foundation: false })
        }
      }

      /* 显式种植（苏堤杨柳、朱雀大街行道树……） */
      for (const t of def.trees ?? []) {
        const n = t.n ?? t.pts.length
        const pts = samplePolyline(t.pts, n)
        pts.forEach(([px, pz], k) => {
          const x = Math.round(cx + px)
          const z = Math.round(cz + pz)
          if (isWet(x, z)) return
          const h = hash2i(x, z, hashString(def.id))
          const variant = t.variant ?? h % TREES[t.type].variants
          const scale = TREES[t.type].variantInfo[variant].scale
          const [lo, hi] = t.type === 'bamboo' ? [8, 11] : TREE_SCALE_HEIGHT[scale]
          const inst: TreeInstance = {
            type: t.type,
            variant,
            height: lo + (h % (hi - lo + 1)),
            slot: (h >>> 8) % TreeCache.SEED_SLOTS,
            rotation: (h >>> 12) & 3,
            x,
            y: terrain.surfaceHeightAt(x, z) + 1,
            z,
            order: index * 4096 + 2048 + k,
          }
          lm.trees.push(inst)
          const b = this.treeBuckets.get(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)))
          if (b) b.push(inst)
          else this.treeBuckets.set(bkey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)), [inst])
          this.occupancy.markCircle(x, z, 3, Occupancy.Buffer)
        })
      }

      /* 视线通道：从地标中心朝取景方向张开的扇形，不栽成熟乔木 */
      const cam = lm.camera
      this.occupancy.markFan(cx, cz, Math.atan2(Math.cos(cam.yaw), Math.sin(cam.yaw)), 0.32, def.radius * 0.95, Occupancy.Sightline)
      this.occupancy.markCircle(cx, cz, def.radius, Occupancy.Landmark)

      for (const p of lm.placements) {
        for (let i = Math.floor(p.world.minX / BUCKET); i <= Math.floor(p.world.maxX / BUCKET); i++)
          for (let j = Math.floor(p.world.minZ / BUCKET); j <= Math.floor(p.world.maxZ / BUCKET); j++) {
            const k = bkey(i, j)
            const b = this.placeBuckets.get(k)
            if (b) b.push(p)
            else this.placeBuckets.set(k, [p])
          }
      }
    }
  }

  /** 占用登记：建筑轮廓、外圈缓冲、入口通道 */
  private markStructure(p: PreparedPlacement, entrance: 'front' | 'both' | 'none', rot: number): void {
    const cols = new Set<number>()
    for (const b of p.blocks) cols.add(((p.x + b.x + 32768) << 16) | (p.z + b.z + 32768))
    for (const k of cols) {
      const x = (k >>> 16) - 32768
      const z = (k & 0xffff) - 32768
      this.occupancy.mark(x, z, Occupancy.Building)
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) this.occupancy.mark(x + dx, z + dz, Occupancy.Buffer)
    }
    if (entrance === 'none') return
    const b = p.structure.bounds()
    const fronts = entrance === 'both' ? [0, 2] : [0]
    for (const f of fronts) {
      const [fx, fz] = rotateXZ(0, 1, rot + f)
      const reach = fx ? (fx > 0 ? b.maxX : -b.minX) : fz > 0 ? b.maxZ : -b.minZ
      for (let s = 1; s <= 9; s++)
        for (let w = -1; w <= 1; w++) {
          const x = p.x + fx * (reach + s) + (fz ? w : 0)
          const z = p.z + fz * (reach + s) + (fx ? w : 0)
          this.occupancy.mark(x, z, Occupancy.Entrance)
        }
    }
  }

  placementsNear(x0: number, z0: number, x1: number, z1: number): PreparedPlacement[] {
    const out = new Set<PreparedPlacement>()
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
        for (const p of this.placeBuckets.get(bkey(i, j)) ?? []) if (p.world.maxX >= x0 && p.world.minX <= x1 && p.world.maxZ >= z0 && p.world.minZ <= z1) out.add(p)
    return [...out].sort((a, b) => a.order - b.order)
  }

  treesNear(x0: number, z0: number, x1: number, z1: number): TreeInstance[] {
    const out: TreeInstance[] = []
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
        for (const t of this.treeBuckets.get(bkey(i, j)) ?? []) if (t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1) out.push(t)
    return out
  }

  profileOf(index: number): VegetationProfile | null {
    return this.landmarks[index]?.def.vegetationProfile ?? null
  }

  byPlaceId(id: string): ResolvedLandmark | undefined {
    return this.byPlace.get(id)
  }
}

function samplePolyline(pts: readonly (readonly [number, number])[], n: number): [number, number][] {
  if (pts.length === 1 || n <= 1) return [[pts[0][0], pts[0][1]]]
  const L = [0]
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const out: [number, number][] = []
  for (let k = 0; k < n; k++) {
    const d = (L[L.length - 1] * k) / (n - 1)
    let i = 1
    while (i < L.length - 1 && L[i] < d) i++
    const t = clamp((d - L[i - 1]) / (L[i] - L[i - 1] || 1), 0, 1)
    out.push([lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)])
  }
  return out
}
