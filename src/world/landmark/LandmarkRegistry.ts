import { clamp, hash2i, hashString, lerp, smoothstep } from '../../utils/math'
import { metersToY } from '../WorldConfig'
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
import { heroFrontYaw, heroIndex, heroIsLandmark } from './LandmarkHero'
import type { CameraPreset, LandmarkDefinition, PlaceAnchor, StructureSpec, TerrainOp } from './LandmarkDefinition'
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

/** 一座建筑的底座（落地那一层的 xz，相对锚点，每 2 格取一格），按构件与参数缓存 */
const footprintCache = new Map<string, readonly (readonly [number, number])[]>()
function footprintOf(b: StructureSpec['b'], p: StructureSpec['p'], rot: number): readonly (readonly [number, number])[] {
  const key = `${b}|${rot}|${JSON.stringify(p ?? {})}`
  let f = footprintCache.get(key)
  if (!f) {
    const T0 = performance.now(); (globalThis as any).__fpN = ((globalThis as any).__fpN ?? 0) + 1
    const st = buildBuilding(b, p ?? {}).rotate(rot)
    const minY = st.bounds().minY
    const set = new Map<number, readonly [number, number]>()
    for (const bl of st.blocks) if (bl.y <= minY + 1 && ((bl.x & 1) === 0 && (bl.z & 1) === 0)) set.set(((bl.x + 512) << 10) | (bl.z + 512), [bl.x, bl.z])
    f = [...set.values()]
    footprintCache.set(key, f); (globalThis as any).__fpT = ((globalThis as any).__fpT ?? 0) + performance.now() - T0
  }
  return f
}
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
      let [x, z] = this.clearOfCities(def, ...this.clearOfWater(def, ...this.clearOfRivers(def, Math.round(c.x + (def.offset?.[0] ?? 0)), Math.round(c.z + (def.offset?.[1] ?? 0)), baseTerrain), baseTerrain))
      if (def.levelMode === 'summit') [x, z] = this.findSummit(baseTerrain, x, z)
      const level =
        (def.levelMeters !== undefined
          ? Math.floor(metersToY(def.levelMeters))
          : def.levelMode === 'summit'
            ? this.summitLevel(baseTerrain, x, z)
            : this.baseLevel(baseTerrain, x, z, !def.terrainModifier?.some((o) => o.t === 'hill' || o.t === 'ridge'))) + (def.levelDy ?? 0)
      const lm: ResolvedLandmark = {
        index,
        def,
        x,
        z,
        level,
        camera: def.shots?.[0] ?? def.cameraPreset ?? { yaw: 0.5, pitch: 0.55, distance: 80 },
        placements: [],
        trees: [],
        waterfall: null,
      }
      this.landmarks.push(lm)
      this.byPlace.set(def.poetryPlaceId, lm)
      this.modifiers.push(this.makeModifier(lm, baseTerrain))
    })
    /* 太近而没有另建聚落的地点：借用最近的地标（点它也能飞过去、读到诗） */
    for (const a of anchors) {
      if (this.byPlace.has(a.id)) continue
      const p = P.project(a.lng, a.lat)
      let best: ResolvedLandmark | null = null
      let bd = Infinity
      for (const lm of this.landmarks) {
        const d = Math.hypot(lm.x - p.x, lm.z - p.z) - lm.def.radius
        if (d < bd) {
          bd = d
          best = lm
        }
      }
      if (best && bd < 60) this.byPlace.set(a.id, best)
    }
  }

  /**
   * 不带城墙的地标（名楼、亭台、村落）：建筑若落在江河湖水里（坐标正好在江心，如黄鹤楼），
   * 就在附近找一处建筑都在岸上的地方——挪得越少越好，地势别差太多。
   */
  private clearOfWater(def: LandmarkDefinition, x: number, z: number, t: TerrainManager): [number, number] {
    // 手工名胜按下面的规则挪；自动聚落见下（破山寺：坐标在常熟城北的江面上，整组建筑都被跳过）
    if (def.walls?.length || !def.structures.length) return [x, z]
    const specs = def.structures.filter((s) => s.b !== 'bridge' && !s.overWater && s.b !== 'lamp')
    if (!specs.length) return [x, z]
    // 预检：营造范围内（每 6 格取一点）一格水都没有，就不必求底座（求底座要真把建筑造一遍，代价大）
    {
      let any = false
      const R = def.radius
      for (let dz = -R; dz <= R && !any; dz += 6)
        for (let dx = -R; dx <= R && !any; dx += 6) {
          const c = t.column(x + dx, z + dz)
          if (c.waterY >= 0 && c.height < c.waterY) any = true
        }
      if (!any) return [x, z]
    }
    // 判落水按每座建筑的实际底座数湿格（此前只看中心与十字五点，大楼底座一半在河里也照放：滕王阁、鹳雀楼、快阁……）
    // 临水设计的名胜（岳阳楼、杭州、庐山）沿用中心与十字五点：底座近水是设计，不让它把整组挪到别处
    const cells = def.waterfront
      ? specs.flatMap((s) => ([[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]] as const).map(([ox, oz]) => [s.x + ox, s.z + oz] as const))
      : specs.flatMap((s) => footprintOf(s.b, s.p, s.rot ?? 0).map(([fx, fz]) => [s.x + fx, s.z + fz] as const))
    const pts = specs.map((s) => [s.x, s.z] as const)
    // 地形列查询很贵：按格缓存是否落水；挪位搜索时底座再隔一取一
    const memo = new Map<number, boolean>()
    const wetCell = (px: number, pz: number) => {
      const k = ((px + 32768) << 16) | (pz + 32768)
      let v = memo.get(k)
      if (v === undefined) {
        const c = t.column(px, pz)
        v = c.waterY >= 0 && c.height < c.waterY
        memo.set(k, v)
      }
      return v
    }
    const wetAt = (cx: number, cz: number, step = 1) => {
      let n = 0
      for (let i = 0; i < cells.length; i += step) if (wetCell(Math.round(cx + cells[i][0]), Math.round(cz + cells[i][1]))) n += step
      return n
    }
    const c0 = t.column(x, z)
    const centerWet = c0.waterY >= 0 && c0.height < c0.waterY
    const wet0 = wetAt(x, z)
    // 自动聚落：整组几乎都在水里，或底座湿了一成半以上才挪；手工名胜：湿了 4% 以上就挪
    if (def.id.startsWith('place-')) {
      const allSunk = pts.every(([sx, sz]) => {
        const c = t.column(Math.round(x + sx), Math.round(z + sz))
        return c.waterY >= 0 && c.height < c.waterY
      })
      if (!allSunk && wet0 < cells.length * 0.15) return [x, z]
    } else {
      // 手工名胜：临水的园林、湖景是设计好的，只看主楼——主楼底座湿了 3% 以上（滕王阁、鹳雀楼）或中心落水才整组挪
      if (def.waterfront && !centerWet) return [x, z]
      const hi = def.waterfront ? -1 : heroIndex(def)
      if (hi < 0 && !centerWet) return [x, z]
      if (hi >= 0) {
        const h = def.structures[hi]
        const hc = footprintOf(h.b, h.p, h.rot ?? 0)
        const hw = hc.reduce((n, [fx, fz]) => {
          const c = t.column(Math.round(x + h.x + fx), Math.round(z + h.z + fz))
          return n + (c.waterY >= 0 && c.height < c.waterY ? 1 : 0)
        }, 0)
        if (!centerWet && hw < hc.length * 0.03) return [x, z]
      }
    }
    const h0 = c0.height
    const fine = !def.id.startsWith('place-')
    // 底座下地面的起伏也计入：只求不压水会挪到崖边，地基垫成一根高石柱（秭归）
    const spread = (cx: number, cz: number) => {
      let lo = Infinity
      let hi = -Infinity
      for (let i = 0; i < cells.length; i += 3) {
        const h = t.column(Math.round(cx + cells[i][0]), Math.round(cz + cells[i][1])).height
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      return Math.max(0, hi - lo - 4)
    }
    const cost = (cx: number, cz: number) => wetAt(cx, cz, cells.length > 60 ? 2 : 1) * 1000 + Math.hypot(cx - x, cz - z) * 4 + Math.abs(t.column(cx, cz).height - h0) * 20 + (fine ? 0 : spread(cx, cz) * 40)
    let best: [number, number] = [x, z]
    let bestCost = cost(x, z)
    // 手工名胜细搜（3 格一圈、24 方向，落点与码头、机位的设计一致）；自动聚落粗搜（4 格、16 方向），省启动时间
    const step = fine ? 3 : 4
    const dirs = fine ? 24 : 16
    for (let r = step; r <= Math.min(fine ? 72 : 60, def.radius + 18) && r * 4 < bestCost; r += step)
      for (let a = 0; a < dirs; a++) {
        const cx = Math.round(x + Math.cos((a / dirs) * Math.PI * 2) * r)
        const cz = Math.round(z + Math.sin((a / dirs) * Math.PI * 2) * r)
        const c = cost(cx, cz)
        if (c < bestCost) {
          bestCost = c
          best = [cx, cz]
        }
      }
    return best
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
    const allow = new Set(def.allowRivers ?? [])
    // 采样点对齐世界网格（不随候选点偏移），相邻候选共用同一批格子，按格缓存是否压水
    const memo = new Map<number, boolean>()
    const wetCell = (px: number, pz: number) => {
      const k = ((px + 32768) << 16) | (pz + 32768)
      let v = memo.get(k)
      if (v === undefined) {
        const c = t.column(px, pz)
        v = c.waterY > c.height
        if (v && allow.size) {
          const rv = t.rivers.query(px, pz)
          if (rv && allow.has(t.rivers.rivers[rv.river].def.id)) v = false
        }
        memo.set(k, v)
      }
      return v
    }
    const wet = (cx: number, cz: number, step: number) => {
      let n = 0
      const x0 = Math.ceil((cx - hw) / step) * step
      const z0 = Math.ceil((cz - hd) / step) * step
      for (let pz = z0; pz <= cz + hd; pz += step) for (let px = x0; px <= cx + hw; px += step) if (wetCell(px, pz)) n++
      return n
    }
    const h0 = t.column(x, z).height
    /* 代价：压水最要紧，其次地势要与原址相近（不往山上搬），再次挪得越近越好 */
    const rest = (cx: number, cz: number) => Math.abs(t.column(cx, cz).height - h0) * 25 + Math.hypot(cx - x, cz - z) * 4
    // 城墙以内（不含外扩）细查一格水都没有，就不挪
    {
      let inner = 0
      for (let dz = -w.hd; dz <= w.hd && !inner; dz += 3)
        for (let dx = -w.hw; dx <= w.hw && !inner; dx += 3) {
          const c = t.column(x + w.x + dx, z + w.z + dz)
          if (c.waterY > c.height) {
            const rv = allow.size ? t.rivers.query(x + w.x + dx, z + w.z + dz) : null
            if (!(rv && allow.has(t.rivers.rivers[rv.river].def.id))) inner++
          }
        }
      if (!inner && wet(x, z, 6) === 0) return [x, z]
    }
    // 细步螺旋（3 格一圈、24 个方向）粗采样（每 6 格）排序，再从代价最低的几个里用细采样（每 3 格，城墙间一条窄河也不漏）挑第一个不压水的
    const cands: { c: number; p: [number, number] }[] = []
    let bestCoarse = wet(x, z, 6) * 1000 + rest(x, z)
    for (let r = 3; r <= 96 && r * 4 < bestCoarse + 60; r += 3)
      for (let a = 0; a < 24; a++) {
        const cx = Math.round(x + Math.cos((a / 24) * Math.PI * 2) * r)
        const cz = Math.round(z + Math.sin((a / 24) * Math.PI * 2) * r)
        const c = wet(cx, cz, 6) * 1000 + rest(cx, cz)
        cands.push({ c, p: [cx, cz] })
        bestCoarse = Math.min(bestCoarse, c)
      }
    cands.sort((u, v) => u.c - v.c)
    for (const k of cands.slice(0, 40)) if (wet(k.p[0], k.p[1], 3) === 0) return k.p
    return cands[0]?.p ?? [x, z]
  }

  /**
   * 山巅：以山为名的地点（荆门山、天门山……）坐标常落在两山夹江的江心；在附近 28 格内找最高的干地，
   * 亭子就立在那座山头上
   */
  private findSummit(t: TerrainManager, x: number, z: number): [number, number] {
    const dry = (cx: number, cz: number) => {
      const c = t.column(cx, cz)
      return (c.waterY < 0 || c.height >= c.waterY) && c.waterDist > 2
    }
    const c0 = t.column(x, z)
    if (dry(x, z) && c0.waterDist > 6) return [x, z]
    let best: [number, number] = [x, z]
    let bh = -Infinity
    for (let dz = -28; dz <= 28; dz += 2)
      for (let dx = -28; dx <= 28; dx += 2) {
        if (dx * dx + dz * dz > 28 * 28 || !dry(x + dx, z + dz)) continue
        const h = t.column(x + dx, z + dz).height - Math.hypot(dx, dz) * 0.05
        if (h > bh) {
          bh = h
          best = [x + dx, z + dz]
        }
      }
    return best
  }

  /** 山巅：中心 3 格内的最高地表 */
  private summitLevel(t: TerrainManager, x: number, z: number): number {
    let h = -Infinity
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) h = Math.max(h, t.column(x + dx, z + dz).height)
    return Math.floor(h)
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

  /**
   * 临水名胜的湖（西湖）与穿过它的天然江河连成一片：湖面原取台面水位 41，钱塘江、江南运河 40，
   * 湖把穿过的那段河也刷成 41，河中间立起一级水墙。湖面改取所触江河的水位（只差一两格时；差得多是山中潭，不动）
   */
  private lakeLevel(t: TerrainManager, def: LandmarkDefinition, cx: number, cz: number, level: number, op: Extract<TerrainOp, { t: 'lake' }>): number {
    if (!def.waterfront) return level
    const c = Math.cos(op.rot ?? 0)
    const s = Math.sin(op.rot ?? 0)
    let y = level
    for (let v = -1; v <= 1; v += 0.05)
      for (let u = -1; u <= 1; u += 0.05) {
        if (u * u + v * v >= 1) continue
        const x = cx + op.x + op.rx * u * c - op.rz * v * s
        const z = cz + op.z + op.rx * u * s + op.rz * v * c
        const q = t.rivers.query(x, z)
        if (q && q.dist <= q.halfWidth + 1 && q.level < y && q.level >= level - 2) y = q.level
      }
    return y
  }

  private makeModifier(lm: ResolvedLandmark, base: TerrainManager): TerrainModifier {
    const { def, x: cx, z: cz, level, index } = lm
    const ops: readonly TerrainOp[] = def.terrainModifier ?? [{ t: 'flatten', x: 0, z: 0, r: Math.max(6, def.radius * 0.4), blend: 8 }]
    const lakeY = ops.map((op) => (op.t === 'lake' ? this.lakeLevel(base, def, cx, cz, level, op) : level))
    // 修改器范围：营造半径外再留足缓坡（高台、削山的过渡带随高差放宽）
    const R = def.radius + 40
    const bo = def.biomeOverride
    const n = createSimplex2D(hashString(def.id))
    return {
      landmark: index,
      minX: cx - R,
      maxX: cx + R,
      minZ: cz - R,
      maxZ: cz + R,
      apply(col: TerrainColumn) {
        // 别的地标的平台核心（先注册的）不动：城池贴得近时，后一处的平整、山丘会把前一处的台地削平、垫高（金陵削了多景楼的北固山，终南山麓台地把长安城南抬成坡）
        if (col.coreOf >= 0 && col.coreOf !== index) return
        const dx = col.x - cx
        const dz = col.z - cz
        const d = Math.hypot(dx, dz)
        if (d <= def.radius) {
          col.landmark = index
          if (bo && d < bo.radius) col.biomeOverride = bo.biome
        }
        const wet = () => col.waterY >= 0 && col.height < col.waterY
        const h0 = col.height
        const wd0 = col.waterDist
        const wet0 = wet()
        /** 落在某个平整台面核心（建筑落脚处）里：临水退让不削它 */
        let core = false
        /** 潭沿：此列地面至少这么高 */
        let rimFloor = -Infinity
        for (let oi = 0; oi < ops.length; oi++) {
          const op = ops[oi]
          switch (op.t) {
            case 'flatten': {
              const ox = dx - op.x
              const oz = dz - op.z
              const dist = op.square ? op.r + Math.max(Math.abs(ox) - op.r, Math.abs(oz) - (op.rz ?? op.r)) : Math.hypot(ox, oz)
              const target = level + (op.dy ?? 0)
              /* 过渡带宽度随高差放宽（至多 20 格）：垫高、削低都成缓坡，不再立起一圈直上直下的墙 */
              const diff = target - col.height
              const blend = Math.min(20, Math.max(op.blend ?? 8, diff > 0 ? diff * 1.4 : -diff * 1.2))
              if (dist >= op.r + blend) break
              if (wet() && !op.overWater) break
              if (dist < op.r) {
                core = true
                if (!op.soft) col.coreOf = index
                // 平台不凭空垫起一根高柱：比原地高出 20 格以上的（夹在峡壁间的窄缝、崖下）不垫，留给自然地形
                if (diff > 20 && !op.overWater && lm.def.id.startsWith('place-')) break
                col.height = target
                if (op.overWater && col.waterKind !== WaterKind.Sea) {
                  col.waterY = -1
                  col.waterDist = Math.max(col.waterDist, 4)
                }
                if (op.pave) col.paved = true
              } else {
                const k = smoothstep(op.r, op.r + blend, dist)
                const flat = lerp(target, col.height, k)
                // 过渡带上高出甚多的是山：削得越来越少（连续渐变，不在某个高差处一刀切出一面墙）
                // 远低于台面的（崖下、谷底）也不去填：那是天然的崖，不是要垫的缓坡
                const keep = diff < 0 ? (op.shave ? 0 : smoothstep(8, 30, -diff)) : smoothstep(14, 28, diff)
                col.height = lerp(flat, col.height, keep)
              }
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
              // 园中湖贴着天然江河（扬州：园湖水位 42、东边大运河 41）：两种水位并排，岸边立起一道水墙。
              // 非临水名胜（临水的西湖、洞庭本就该与江河连成一片）：天然水面不改；离天然水两格半内留一道堤，不开湖
              if (rr < 1 && !def.waterfront) {
                const natural = col.waterKind === WaterKind.River || col.waterKind === WaterKind.Lake || col.waterKind === WaterKind.Sea
                if (natural && wet() && col.waterY !== level) break
                if (natural && !wet() && col.waterDist <= 2.5) {
                  col.height = Math.max(col.height, level + 0.5)
                  break
                }
              }
              if (rr < 1) {
                col.waterY = lakeY[oi]
                col.height = Math.min(col.height, lakeY[oi] - 1 - Math.round((op.depth ?? 3) * Math.sqrt(1 - rr)))
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
              // 潭口：岸外地面比水面低（潭挂在坡上、下临大湖）时补一圈潭沿，向外按落差放宽、渐落回原地——
              // 不然水面的侧壁整个露出来，是一道立在坡上的水墙
              // 按原地面算（山丘先把这里垫高、临水退让再削回去，同样会削出缺口），末尾封顶之后再兜一次底
              if (op.rim && rr >= 1 && rr < 3) {
                const lip = level + 0.5
                if (h0 < lip) {
                  const band = 1.15 + Math.min(1.8, ((lip - h0) * 1.3) / Math.min(op.rx, op.rz))
                  if (rr < band) rimFloor = Math.max(rimFloor, lerp(lip, h0, smoothstep(1.15, band, rr)))
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
            case 'crescent': {
              const ox = dx - op.x
              const oz = dz - op.z
              const rho = Math.hypot(ox, oz)
              let ang = Math.atan2(oz, ox)
              while (ang < op.a0) ang += Math.PI * 2
              const t = (ang - op.a0) / (op.a1 - op.a0)
              // 弧外两角之外：只算到最近一端的距离，给岸坡用
              const half = t >= 0 && t <= 1 ? (op.w / 2) * Math.pow(Math.sin(Math.PI * t), 0.8) : 0
              const edge = Math.abs(rho - op.r) - half
              if (half > 0.6 && edge < 0) {
                const k = Math.min(1, -edge / Math.max(1, half))
                col.waterY = level
                col.height = Math.min(col.height, level - 1 - Math.round((op.depth ?? 2) * Math.sqrt(k)))
                col.waterKind = WaterKind.Lake
                col.waterDist = 0
              } else if (half > 0.6 && edge < 6) {
                // 泉岸：一圈缓坡落到水面
                col.height = Math.min(col.height, lerp(level + 0.5, col.height, smoothstep(0, 6, edge)))
                if (edge < col.waterDist) {
                  col.waterDist = edge
                  col.waterKind = WaterKind.Lake
                }
              }
              break
            }
            case 'dune': {
              let best = Infinity
              let along = 0
              let side = 0
              let acc = 0
              let total = 0
              for (let i = 1; i < op.pts.length; i++) total += Math.hypot(op.pts[i][0] - op.pts[i - 1][0], op.pts[i][1] - op.pts[i - 1][1])
              for (let i = 1; i < op.pts.length; i++) {
                const [ax, az] = op.pts[i - 1]
                const [bx, bz] = op.pts[i]
                const len = Math.hypot(bx - ax, bz - az)
                const hit = segmentDistance(dx, dz, ax, az, bx, bz)
                if (hit.dist < best) {
                  best = hit.dist
                  along = (acc + hit.t * len) / Math.max(1, total)
                  side = Math.sign((bx - ax) * (dz - az) - (bz - az) * (dx - ax)) || 1
                }
                acc += len
              }
              // 背风坡宽只有迎风坡的四成：脊线是一道锐利的沙棱
              const reach = side === op.lee ? op.w * 0.4 : op.w
              if (best >= reach || wet() || col.waterDist < 3) break
              const crest = op.h * Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along))), 0.6) * (0.85 + 0.3 * (0.5 + 0.5 * fbm(n, col.x / 23 + 5, col.z / 23, 2)))
              const g = best / reach
              const f = side === op.lee ? 1 - Math.pow(g, 1.3) : Math.pow(1 - g, 1.8)
              const hh = crest * f * smoothstep(3, 12, col.waterDist >= 1e8 ? 99 : col.waterDist)
              col.height = Math.max(col.height, level + hh)
              core = true
              break
            }
            case 'spire': {
              const dist = Math.hypot(dx - op.x, dz - op.z)
              if (dist >= op.r || wet()) break
              // 柱身：中段几乎直立、近底收成一圈陡坡；柱顶不平，按噪声参差起伏；四周按噪声进退，不是正圆
              const warp = 1 + 0.3 * fbm(n, col.x / 6 + 70, col.z / 6, 2)
              const dd = Math.min(1, (dist / op.r) * warp)
              const f = dd < 0.55 ? 1 - 0.25 * dd : 0.86 * Math.pow(Math.max(0, (1 - dd) / 0.45), 1.6)
              col.height += op.h * f * (0.85 + 0.3 * (0.5 + 0.5 * fbm(n, col.x / 4 + 9, col.z / 4 - 3, 2)))
              core = true // 峰林是山体本身：不受临水退让封顶
              break
            }
            case 'ridge': {
              // 最近的一段：距离、沿脊线的位置（0…1）、在哪一侧
              let best = Infinity
              let along = 0
              let side = 0
              let acc = 0
              let total = 0
              for (let i = 1; i < op.pts.length; i++) total += Math.hypot(op.pts[i][0] - op.pts[i - 1][0], op.pts[i][1] - op.pts[i - 1][1])
              for (let i = 1; i < op.pts.length; i++) {
                const [ax, az] = op.pts[i - 1]
                const [bx, bz] = op.pts[i]
                const len = Math.hypot(bx - ax, bz - az)
                const hit = segmentDistance(dx, dz, ax, az, bx, bz)
                if (hit.dist < best) {
                  best = hit.dist
                  along = (acc + hit.t * len) / Math.max(1, total)
                  side = Math.sign((bx - ax) * (dz - az) - (bz - az) * (dx - ax)) || 1
                }
                acc += len
              }
              const cliffSide = side === op.cliffSide
              // 崖脚线随噪声进退几格，崖面不是一条直边
              if (cliffSide) best = Math.max(0, best + 2.5 * fbm(n, col.x / 15 + 13, col.z / 15, 2))
              const reach = cliffSide ? op.cliff * 2.2 + 3 : op.w
              if (best >= reach || (wet() && !op.toWater)) break
              // 脊线：两头收、中间高，起伏不匀
              const crest = op.h * (op.squareEnds ? 1 : Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, along))), 0.55)) * (0.85 + 0.3 * (0.5 + 0.5 * fbm(n, col.x / 19 + 7, col.z / 19, 2)))
              let f: number
              if (cliffSide) {
                // 陡崖分级退让：崖顶一段几乎不降，往外层层收台（每级约 5 格高），崖脚收到地面；不再一刀切下的一整面平墙
                const W = op.cliff * 2.2
                const g = Math.min(1, best / W)
                f = 1 - Math.pow(g, 1.6)
                const q = (f * crest) / 5
                const st = (Math.floor(q) + smoothstep(0.5, 1, q - Math.floor(q))) * 5
                f = crest > 0 ? lerp(f, st / crest, 0.7) : f
              } else {
                f = Math.pow(1 - best / op.w, 1.5)
                // 冲沟：缓坡上顺坡几道凹槽，越往坡脚越深
                const g = Math.pow(Math.max(0, Math.sin(along * total / 6 + 2.2 * fbm(n, col.x / 13, col.z / 13 + 9, 2))), 6)
                f *= 1 - 0.35 * g * Math.min(1, best / (op.w * 0.35))
              }
              const shore = op.toWater || col.waterDist >= 1e8 ? 1 : smoothstep(0, 10, col.waterDist)
              const hh = crest * f * shore
              // 峡谷的崖不压进江面：水面那几格保持原样，崖壁从岸边直起
              if (op.toWater && wet()) break
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
                // 河渠汇入江河湖：已经是天然水面的地方不动（否则两种水位并排，出现一级级的水墙）
                if (col.waterY >= 0 && col.height < col.waterY && col.waterKind !== WaterKind.Pond) break
                // 贴着天然江湖海的岸（两格半内）不开渠、留一道堤：两边水位不同，否则岸边立起一条高出湖面的水带，侧面的水墙把湖上的船罩住
                if (col.waterDist <= 2.5 && col.waterKind !== WaterKind.Pond && col.waterKind !== WaterKind.None) break
                if (col.height < level - 1.5) {
                  // 渠道流出营造区、地势低下去：水面随地面降下（下游一级级跌水），不悬空
                  col.waterY = Math.floor(col.height)
                  col.height = col.height - 2
                } else {
                  col.waterY = level
                  col.height = Math.min(col.height, level - 2)
                }
                col.waterKind = WaterKind.Pond // 城中河渠：与天然江河区分（城墙可以圈住它）
                col.waterDist = 0
                col.paved = false
              } else if (best < op.w + 3 && best - op.w < col.waterDist) {
                // 紧贴天然江河的岸格仍记作天然水岸：否则后面的园湖看不出这里挨着大运河，照样开湖（扬州园湖 42 贴着运河 41 一格水墙）
                const nearNatural = col.waterDist <= 2.5 && (col.waterKind === WaterKind.River || col.waterKind === WaterKind.Lake || col.waterKind === WaterKind.Sea)
                col.waterDist = best - op.w
                if (!nearNatural) col.waterKind = WaterKind.Pond
              }
              break
            }
            case 'raise': {
              const blend = op.blend ?? 4
              if (d >= op.r + blend || wet()) break
              const target = level
              col.height = Math.max(col.height, d < op.r ? target : lerp(target, col.height, smoothstep(op.r, op.r + blend, d)))
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
            case 'path': {
              if (wet()) break
              for (let i = 1; i < op.pts.length; i++)
                if (segmentDistance(dx, dz, op.pts[i - 1][0], op.pts[i - 1][1], op.pts[i][0], op.pts[i][1]).dist <= op.w) {
                  col.paved = true
                  break
                }
              break
            }
          }
        }
        /* 临水退让：江河下切之后，地标的平整、山丘、山脊又把地面垫高到水边，岸成一道直上直下的墙（白帝、秭归、蔡山……）。
           垫高的部分按离水距离封顶——离水每远一格最多高 1.4 格，岸成坡；原地本来就高的不削 */
        if (!core && !wet0 && !wet() && wd0 < 60 && col.height > h0) {
          const cap = h0 + Math.max(0, wd0 - 1) * 1.4
          if (col.height > cap) col.height = cap
        }
        if (col.height < rimFloor) {
          col.height = rimFloor
          if (col.waterY >= 0 && col.height >= col.waterY) col.waterY = -1
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
      const wetMemo = new Map<number, boolean>()
      const isWet = (x: number, z: number) => {
        const k = ((x + 32768) << 16) | (z + 32768)
        let v = wetMemo.get(k)
        if (v === undefined) {
          const c = terrain.column(x, z)
          v = c.waterY >= 0 && c.height < c.waterY
          wetMemo.set(k, v)
        }
        return v
      }

      /* 城墙与城门 */
      for (const w of def.walls ?? []) {
        const h = w.height ?? 7
        const wx = cx + w.x
        const wz = cz + w.z
        const y = level + 1
        const gateHalf = 7
        const run = (ax: number, az: number, len: number, alongZ: boolean, gateAt: number | null) => {
          // 城门处与跨水处（水门）断开
          const gap = (k: number) => (gateAt !== null && k >= gateAt - gateHalf && k < gateAt + gateHalf) || isWet(alongZ ? ax : ax + k, alongZ ? az + k : az)
          let s = 0
          while (s < len) {
            if (gap(s)) {
              s++
              continue
            }
            let e = s
            while (e < len && !gap(e)) e++
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
        const gates: Record<string, [number, number, number]> = { n: [wx, wz - w.hd, 2], s: [wx, wz + w.hd, 0], w: [wx - w.hw, wz, 1], e: [wx + w.hw, wz, 3] }
        for (const g of w.gates) {
          const [gx, gz, rot] = gates[g]
          const gl = typeof w.gateLevels === 'number' ? w.gateLevels : (w.gateLevels?.[g] ?? 1)
          const gate = buildBuilding('gate', { width: 13, depth: 7, height: h, lanterns: true, gateLevels: gl, tile: w.gateTile })
          add(`gate-${index}-${g}`, gate.rotate(rot), gx, y, gz, { clear: h + 10 + gl * 4, entrance: 'both', rot })
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
        let x = Math.round(cx + spec.x)
        let z = Math.round(cz + spec.z)
        const isBridge = spec.b === 'bridge'
        let params = spec.p ?? {}
        if (isBridge) {
          /* 桥：沿自身轴线（rot 1 为南北向）找最近的一段水面，居中跨过、按水面宽定桥长，两头必须落在岸上；
             找不到可跨的水或水面太宽（桥会立在水中）就不建 */
          const alongZ = (spec.rot ?? 0) % 2 === 1
          const at = (k: number, px: number, pz: number) => (alongZ ? [px, pz + k] : [px + k, pz]) as [number, number]
          let found: { cx: number; cz: number; w: number } | null = null
          for (let k = 0; k <= 20 && !found; k++)
            for (const sgn of [1, -1]) {
              const [px, pz] = at(sgn * k, x, z)
              if (!isWet(px, pz)) continue
              let lo = 0
              let hi = 0
              while (lo < 30 && isWet(...at(-lo - 1, px, pz))) lo++
              while (hi < 30 && isWet(...at(hi + 1, px, pz))) hi++
              const [mx, mz] = at(Math.round((hi - lo) / 2), px, pz)
              found = { cx: mx, cz: mz, w: lo + hi + 1 }
              break
            }
          if (!found || found.w > 13) return
          const L = Math.max(7, Math.min(17, (found.w + 4) | 1))
          const half = (L - 1) / 2
          // 两头：桥端外一格必须是岸
          if (isWet(...at(-half - 1, found.cx, found.cz)) || isWet(...at(half + 1, found.cx, found.cz))) return
          x = found.cx
          z = found.cz
          params = { ...params, length: L }
        }
        /* 单座建筑落水兜底（城池里的楼、自动聚落的房）：底座湿了一成以上，就在附近 2–14 格找一处干地，
           不与已放的建筑重叠、不出营造范围；找不到，湿得不多照放（临水），湿得多就不建 */
        const nearWater = () => {
          for (let dz = -8; dz <= 8; dz += 4) for (let dx = -8; dx <= 8; dx += 4) if (isWet(x + dx, z + dz)) return true
          return false
        }
        if (!isBridge && !spec.overWater && spec.b !== 'lamp' && !(def.waterfront && spec.b === 'grandTower') && nearWater()) {
          const fp = footprintOf(spec.b, params, spec.rot ?? 0)
          const wetFrac = (px: number, pz: number) => fp.reduce((n, [fx, fz]) => n + (isWet(px + fx, pz + fz) ? 1 : 0), 0) / Math.max(1, fp.length)
          const f0 = wetFrac(x, z)
          if (f0 > 0.1) {
            const ext = fp.reduce((m, [fx, fz]) => Math.max(m, Math.abs(fx), Math.abs(fz)), 0) + 1
            const overlaps = (px: number, pz: number) =>
              lm.placements.some((q) => !/^(wall|gate|corner)/.test(q.id) && !q.id.includes('bridge') && px + ext > q.world.minX && px - ext < q.world.maxX && pz + ext > q.world.minZ && pz - ext < q.world.maxZ)
            // 新位置要平：底座高差 3 格以内、与原址地面相差不过 4 格——不挪到河岸陡坎、坡上，免得地基垫成一根高石柱
            const g0 = terrain.surfaceHeightAt(x, z)
            const flatAt = (px: number, pz: number) => {
              let lo = Infinity
              let hi = -Infinity
              for (const [fx, fz] of fp) {
                const h = terrain.surfaceHeightAt(px + fx, pz + fz)
                lo = Math.min(lo, h)
                hi = Math.max(hi, h)
              }
              return hi - lo <= 3 && Math.abs(terrain.surfaceHeightAt(px, pz) - g0) <= 4
            }
            let moved = false
            for (let r = 2; r <= 14 && !moved; r += 2)
              for (let a = 0; a < 16; a++) {
                const px = Math.round(x + Math.cos((a / 16) * Math.PI * 2) * r)
                const pz = Math.round(z + Math.sin((a / 16) * Math.PI * 2) * r)
                if (Math.hypot(px - cx, pz - cz) > def.radius * 1.2 || wetFrac(px, pz) > 0.03 || overlaps(px, pz) || !flatAt(px, pz)) continue
                x = px
                z = pz
                moved = true
                break
              }
            if (!moved && f0 > 0.3) return
          }
        }
        if (!isBridge && !spec.overWater && isWet(x, z)) return
        const s = buildBuilding(spec.b, params).rotate(spec.rot ?? 0)
        const y = (spec.atLevel ? level + 1 : terrain.surfaceHeightAt(x, z) + 1) + (spec.dy ?? 0)
        const bd = BuildingRegistry.get(spec.b)!
        add(`${def.id}-${spec.b}-${i}`, s, x, y, z, { foundation: bd.foundation === 'stone' && !spec.noFoundation, clear: isBridge || spec.overWater || spec.noFoundation ? 0 : 10, entrance: bd.entrance, rot: spec.rot ?? 0 })
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
        /* 指定了落差（top）：自砌一面陡崖，瀑布从崖顶飞落；崖面按哈希凹凸、两侧收窄，
           中途两道石坎把水流打出三叠（庐山三叠泉） */
        if (wf.top > 0) top = Math.max(top, bottom + wf.top)
        if (top > bottom + 3) {
          const s = new VoxelStructure('waterfall')
          const H = top - bottom
          const hw = half + 4
          for (let k = -hw; k <= hw; k++) {
            const edge = Math.max(0, Math.abs(k) - half - 1)
            const colH = H - edge * edge - ((k * 7 + 3) & 1)
            for (let y = 0; y <= colH; y++)
              for (let dz = 1; dz <= 4 + Math.floor(y / 10); dz++) {
                const bump = hash2i(k * 5 + dz, y, 91) & 7
                if (dz === 1 && Math.abs(k) <= half) continue
                if (dz === 1 && bump < 3) continue
                s.set(k, y, -dz, S(bump === 0 ? B.MOSS_STONE : y % 6 === 0 ? B.STONE : B.ROCK))
              }
          }
          const ledges = [Math.round(H * 0.36), Math.round(H * 0.68)]
          for (let k = -half; k <= half; k++) {
            let z = 0
            for (let y = H; y >= 0; y--) {
              // 石坎：落到这一层时往外跨出一格，下一段瀑布离崖更远
              if (ledges.includes(y)) {
                // 石坎从崖面伸到这一段水帘下，接住它、把下一段推出去一格
                for (let dz = -2; dz <= z; dz++) s.set(k, y, dz, S(B.MOSS_STONE))
                z += 1
              }
              s.set(k, y, z, packState({ id: B.WATERFALL, variant: 1 }))
            }
            s.set(k, H, -1, S(B.WATER))
            s.set(k, H, -2, S(B.WATER))
          }
          lm.waterfall = { x: fx, z: fz + 2, bottom, top, width: wf.width + 2 }
          add(`waterfall-${index}`, s, fx, bottom, fz, { foundation: false })
        }
      }

      /* 主楼视廊：名楼正面朝外张开的扇形，先于显式种植登记——楼前不论自然林还是目录里的柳，一棵乔木都不种 */
      const hi = heroIndex(def)
      if (def.major && (def.hero || !def.walls?.length) && heroIsLandmark(def)) {
        const hs = def.structures[hi]
        const fy = heroFrontYaw(def)
        this.occupancy.markFan(Math.round(cx + hs.x), Math.round(cz + hs.z), Math.atan2(Math.cos(fy), Math.sin(fy)), 0.4, def.radius * 1.3, Occupancy.HeroView)
      }

      /* 显式种植（苏堤杨柳、朱雀大街行道树……） */
      for (const t of def.trees ?? []) {
        const n = t.n ?? t.pts.length
        const pts = samplePolyline(t.pts, n)
        pts.forEach(([px, pz], k) => {
          const x = Math.round(cx + px)
          const z = Math.round(cz + pz)
          if (isWet(x, z) || this.occupancy.has(x, z, Occupancy.HeroView)) return
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

      /* 视线通道：从地标中心朝取景方向张开的扇形，不栽成熟乔木。没有定稿机位的按主楼正面（自动取景也偏好正面） */
      const sightYaw = def.cameraPreset || def.shots?.length ? lm.camera.yaw : heroFrontYaw(def)
      this.occupancy.markFan(cx, cz, Math.atan2(Math.cos(sightYaw), Math.sin(sightYaw)), 0.32, def.radius * 0.95, Occupancy.Sightline)
      // 每个定稿机位各一条视廊：从取景目标朝镜头张开（俯拍不怕树挡，跳过）；视廊里只许零星小树留作框景
      for (const s of def.shots ?? []) {
        if (s.pitch > 0.75) continue
        const [ox, , oz] = s.offset ?? [0, 0, 0]
        this.occupancy.markFan(Math.round(cx + ox), Math.round(cz + oz), Math.atan2(Math.cos(s.yaw), Math.sin(s.yaw)), 0.22, Math.min(s.distance * 0.8, def.radius * 1.2), Occupancy.Sightline)
      }
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
