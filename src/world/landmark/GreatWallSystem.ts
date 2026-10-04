import { resamplePolyline } from '../../utils/geometry2d'
import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { buildBuilding } from '../building/BuildingRegistry'
import { getProjection } from '../coordinate/GeoProjection'
import { GREAT_WALL, GREAT_WALL_INNER, GREAT_WALL_PASSES } from '../generation/geography/GeographyData'
import { projectLine } from '../generation/geography/MacroGeography'
import { Occupancy, type OccupancyMap } from '../structure/OccupancyMap'
import { type PreparedPlacement, placeStructure, PlaceMode, preparePlacement } from '../structure/StructurePlacer'
import type { TerrainManager } from '../terrain/TerrainManager'
import type { VoxelVolume } from '../voxel/VoxelVolume'
import type { LandmarkRegistry } from './LandmarkRegistry'

interface WallPoint {
  x: number
  z: number
  /** 墙顶（马道面）Y */
  top: number
  /** 敌台：0 无，1 敌台，2 带铺房的敌台 */
  tower: number
  /** 墙外（迎敌一侧）的单位法向 */
  ox: number
  oz: number
  /** 墙身走向是否偏南北（敌台门开在哪两面） */
  alongZ: boolean
  /** 敌台门在门面上的偏移：墙斜着穿过敌台时，马道从门面偏一侧进出，门开在那里 */
  door: number
  /** 属于哪条墙线、线上第几点（拓扑检查用） */
  line: number
  seq: number
}



interface Beacon {
  x: number
  z: number
  base: number
}

const BUCKET = 64
const HEIGHT = 6
/** 墙身半宽：5 格宽（外侧垛墙、中间三格马道、内侧宇墙） */
const WALL_R = 2
/** 敌台半宽：9 格见方 */
const TOWER_R = 4
/** 敌台间距（沿墙格数） */
const TOWER_EVERY = 40
/** 烽火台间距与离墙距离 */
const BEACON_EVERY = 150
const BEACON_OFF = 14

/**
 * 长城：沿明长城走向、随山脊起伏的线性结构。
 *  - 墙身 5 格宽：下两层条石基础、上砌城砖；外侧垛墙（垛口一高一低），内侧矮宇墙，中间三格马道铺砖；
 *    墙顶沿线平滑，不随地面一格一格乱跳（马道高出地面 4–9 格之间）。
 *  - 每 40 格一座 9 格见方的空心敌台：两层，下层砖室开箭窗、顺墙两面开门，上层台顶垛口，隔一座加一间铺房。
 *  - 墙外十几格外的山头隔段立一座烽火台。
 *  - 关隘：有手工关城的（山海关、嘉峪关、雁门关），墙到关城城墙为止、由关城接上；没有的（居庸关），
 *    墙上开一座券门、门上起两层关楼。
 * 与其他结构一样逐区块按世界坐标写入，跨区块严丝合缝。
 */
export class GreatWallSystem {
  readonly points: WallPoint[] = []
  private readonly buckets = new Map<number, WallPoint[]>()
  private readonly beacons: Beacon[] = []
  /** 墙上券门关楼（没有手工关城的关隘） */
  readonly gates: PreparedPlacement[] = []

  constructor(terrain: TerrainManager, occupancy: OccupancyMap, landmarks?: LandmarkRegistry) {
    const P = getProjection()
    // 有城墙的地标（关城、城池）：长城到它的城墙为止，城里不穿墙
    const forts = (landmarks?.landmarks ?? []).flatMap((l) => (l.def.walls ?? []).map((w) => ({ x0: l.x + w.x - w.hw - 1, x1: l.x + w.x + w.hw + 1, z0: l.z + w.z - w.hd - 1, z1: l.z + w.z + w.hd + 1 })))
    const inFort = (x: number, z: number) => forts.some((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1)
    // 没有手工关城的关隘：墙上开券门
    const passes = GREAT_WALL_PASSES.map((p) => P.project(p.lng, p.lat)).filter((p) => !forts.some((f) => p.x >= f.x0 - 30 && p.x <= f.x1 + 30 && p.z >= f.z0 - 30 && p.z <= f.z1 + 30))
    const seen = new Set<number>()
    const usedPass = new Set<number>()
    const lines = [projectLine(P, GREAT_WALL), projectLine(P, GREAT_WALL_INNER)]
    for (const l of landmarks?.landmarks ?? []) for (const g of l.def.greatWall ?? []) lines.push(g.map(([x, z]) => [l.x + x, l.z + z] as [number, number]))
    lines.forEach((line, lineIdx) => {
      const raw: { x: number; z: number; g: number }[] = []
      for (const [fx, fz] of resamplePolyline(line, 1)) {
        const x = Math.round(fx)
        const z = Math.round(fz)
        const k = ((x + 32768) << 16) | (z + 32768)
        if (seen.has(k)) continue
        seen.add(k)
        raw.push({ x, z, g: terrain.column(x, z).height })
      }
      const n = raw.length
      const valid = raw.map((r) => {
        const c = terrain.column(r.x, r.z)
        return !(c.waterY >= 0 && c.height < c.waterY) && !inFort(r.x, r.z)
      })
      // 关隘券门：每个关隘只开一座（内外长城在居庸关交汇，两条线都会经过它）
      const gateIdx: number[] = []
      passes.forEach((p, pi) => {
        if (usedPass.has(pi)) return
        let best = -1
        let bd = 12
        raw.forEach((r, i) => {
          const d = Math.hypot(r.x - p.x, r.z - p.z)
          if (valid[i] && d < bd) {
            bd = d
            best = i
          }
        })
        if (best >= 0) {
          gateIdx.push(best)
          usedPass.add(pi)
        }
      })
      const gateNear = (i: number, r: number) => gateIdx.some((gi) => Math.abs(gi - i) <= r)
      // 走向：前后各三格
      const tan = raw.map((_, i) => {
        const a = raw[Math.max(0, i - 3)]
        const b = raw[Math.min(n - 1, i + 3)]
        const tl = Math.hypot(b.x - a.x, b.z - a.z) || 1
        return [(b.x - a.x) / tl, (b.z - a.z) / tl] as const
      })
      // 墙顶：前后七格地面的平均（马道不随地面乱跳），夹在地面以上 4–9 格之间
      const top = raw.map((r, i) => {
        let sum = 0
        let cnt = 0
        for (let j = Math.max(0, i - 3); j <= Math.min(n - 1, i + 3); j++) {
          sum += raw[j].g
          cnt++
        }
        return Math.round(Math.min(r.g + 9, Math.max(r.g + 4, sum / cnt + HEIGHT)))
      })
      // 敌台
      const tower = new Int8Array(n)
      let sinceTower = TOWER_EVERY >> 1
      let towers = 0
      for (let i = 0; i < n; i++) {
        if (!valid[i] || gateNear(i, 14)) continue // 敌台门不对着券门关楼的门座
        ++sinceTower
        // 敌台连同前后六格要一样高：只落在这一段地面起伏不过五格的地方，陡坡上往后顺延（不在坡上撑起一根高台）
        let gLo = Infinity
        let gHi = -Infinity
        for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) {
          gLo = Math.min(gLo, raw[j].g)
          gHi = Math.max(gHi, raw[j].g)
        }
        if (gHi - gLo > 5) continue
        if (sinceTower >= TOWER_EVERY) {
          sinceTower = 0
          tower[i] = towers++ % 2 === 0 ? 2 : 1
        }
      }
      // 关城伸出的支线：远端收在一座敌台上（墙爬上山头、止于墩台），不悬一截
      if (lineIdx >= 2) {
        let last = n - 1
        while (last > 0 && !valid[last]) last--
        if (!tower[last]) {
          for (let j = Math.max(0, last - 16); j < last; j++) tower[j] = 0
          tower[last] = 1
        }
      }
      // 马道：相邻两格至多差一格，一路走得上去；只有地面本身一格陡过一格的崖坡，才许跟着地面多跨（天梯）。
      // 只抬不降的单调传播：每格不低于邻格减去允许的落差，反复到不再变——一定收敛，也不会在两遍之间来回推翻
      const lo = raw.map((r) => Math.floor(r.g) - 2) // 最低比地面低两格（墙顶以上三格会清空，成一道切进坡里的马道）
      for (let i = 0; i < n; i++) top[i] = Math.max(top[i], lo[i])
      const allow = (i: number, j: number) => Math.max(1, Math.ceil(Math.abs(raw[i].g - raw[j].g) - 0.25))
      const prop = () => {
        for (let pass = 0; pass < 400; pass++) {
          let changed = false
          for (let i = 1; i < n; i++) {
            const v = top[i - 1] - allow(i, i - 1)
            if (top[i] < v) {
              top[i] = v
              changed = true
            }
          }
          for (let i = n - 2; i >= 0; i--) {
            const v = top[i + 1] - allow(i, i + 1)
            if (top[i] < v) {
              top[i] = v
              changed = true
            }
          }
          if (!changed) break
        }
      }
      // 敌台前后六格与台同高：门外就是马道，不是一级台阶。台取这一段的最高值，传播后若被抬得不平，再取最高、再传播
      const windows: [number, number][] = []
      for (let i = 0; i < n; i++) if (tower[i]) windows.push([Math.max(0, i - 6), Math.min(n - 1, i + 6)])
      for (let round = 0; round < 50; round++) {
        let flat = true
        for (const [j0, j1] of windows) {
          let t = -Infinity
          for (let j = j0; j <= j1; j++) t = Math.max(t, top[j])
          for (let j = j0; j <= j1; j++)
            if (top[j] !== t) {
              top[j] = t
              flat = false
            }
        }
        prop()
        if (flat && round > 0) break
      }

      for (let i = 0; i < n; i++) {
        if (!valid[i]) continue
        const { x, z, g } = raw[i]
        const [tx, tz] = tan[i]
        // 墙外：两条法向里朝北（z 小）的那条——明长城外侧是塞北
        let ox = -tz
        let oz = tx
        if (oz > 0) {
          ox = -ox
          oz = -oz
        }
        if (gateIdx.includes(i)) {
          // 券门关楼：顺墙走向摆，门洞穿墙
          const rot = Math.abs(tx) >= Math.abs(tz) ? 0 : 1
          const s = buildBuilding('gate', { width: 13, depth: 7, height: top[i] - Math.floor(g), lanterns: true, gateLevels: 2 }).rotate(rot)
          const pl = preparePlacement({ id: 'wall-gate', structure: s, x, y: Math.floor(g) + 1, z, mode: PlaceMode.Replace, foundation: S(B.STONE_BRICK), clearHeight: 20, order: 1 << 30 })
          this.gates.push(pl)
          occupancy.markRect(pl.world.minX, pl.world.minZ, pl.world.maxX, pl.world.maxZ, Occupancy.Building)
        }
        if (gateNear(i, 6)) continue
        const alongZ = Math.abs(tz) > Math.abs(tx)
        // 中线穿出门面的位置：沿主轴走 TOWER_R 格时横向偏出多少
        const door = Math.round(alongZ ? (TOWER_R * tx) / tz : (TOWER_R * tz) / tx)
        const pt: WallPoint = { x, z, top: top[i], tower: tower[i], ox, oz, alongZ, door: Math.max(-(TOWER_R - 1), Math.min(TOWER_R - 1, door)), line: lineIdx, seq: i }
        this.points.push(pt)
        const bk = ((Math.floor(x / BUCKET) + 1024) << 11) | (Math.floor(z / BUCKET) + 1024)
        const bucket = this.buckets.get(bk)
        if (bucket) bucket.push(pt)
        else this.buckets.set(bk, [pt])
        const r = tower[i] ? TOWER_R : WALL_R
        occupancy.markRect(x - r - 1, z - r - 1, x + r + 1, z + r + 1, Occupancy.Building)
        // 烽火台：墙外山头
        if (i % BEACON_EVERY === BEACON_EVERY >> 1) {
          const bx = Math.round(x + ox * BEACON_OFF)
          const bz = Math.round(z + oz * BEACON_OFF)
          const bc = terrain.column(bx, bz)
          if (!(bc.waterY >= 0 && bc.height < bc.waterY) && !inFort(bx, bz) && !occupancy.has(bx, bz, Occupancy.Building)) {
            this.beacons.push({ x: bx, z: bz, base: Math.floor(bc.height) })
            occupancy.markRect(bx - 3, bz - 3, bx + 3, bz + 3, Occupancy.Building)
          }
        }
      }
    })
  }

  apply(vol: VoxelVolume): number {
    const M = TOWER_R + 1
    const x0 = vol.ox - M
    const z0 = vol.oz - M
    const x1 = vol.ox + vol.sx - 1 + M
    const z1 = vol.oz + vol.sz - 1 + M
    const near: WallPoint[] = []
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
        for (const p of this.buckets.get(((i + 1024) << 11) | (j + 1024)) ?? []) if (p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1) near.push(p)

    /* 每一列归最近的墙点（拐弯处不同点的内外侧不互相打架）；敌台优先 */
    const cells = new Map<number, { p: WallPoint; d: number; tower: boolean }>()
    for (const p of near) {
      const r = p.tower ? TOWER_R : WALL_R
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const x = p.x + dx
          const z = p.z + dz
          if (!vol.containsColumn(x, z)) continue
          const k = ((x + 32768) << 16) | (z + 32768)
          const d = Math.hypot(dx, dz)
          const tower = p.tower > 0
          const cur = cells.get(k)
          if (!cur || (tower && !cur.tower) || (tower === cur.tower && d < cur.d)) cells.set(k, { p, d, tower })
        }
    }
    let n = 0
    for (const [k, { p, tower }] of cells) {
      const x = (k >>> 16) - 32768
      const z = (k & 0xffff) - 32768
      const dx = x - p.x
      const dz = z - p.z
      // 墙身：从墙顶往下砌到实地；最下两层条石
      let yb = p.top - HEIGHT
      for (; yb > 0; yb--) {
        const cur = vol.get(x, yb, z) & 255
        if (cur && cur !== B.WATER && cur !== B.TALL_GRASS && cur !== B.REED && cur !== B.SHRUB) break
      }
      for (let y = yb + 1; y <= p.top; y++) vol.set(x, y, z, S(y <= yb + 2 ? B.STONE_BRICK : B.CITY_BRICK))
      // 墙顶以上先清空（伸进来的树冠、地形）：马道、敌台室内与门洞留出走人的空
      for (let y = p.top + 1; y <= p.top + (tower ? 3 : 3); y++) vol.set(x, y, z, 0)
      n++
      if (tower) {
        this.towerCell(vol, x, z, dx, dz, p)
        continue
      }
      const o = dx * p.ox + dz * p.oz
      if (o > WALL_R - 0.5) {
        // 垛墙：一道齐胸的墙，上面垛子一高一低
        vol.set(x, p.top + 1, z, S(B.CITY_BRICK))
        if (((x + z) & 1) === 0) vol.set(x, p.top + 2, z, S(B.CITY_BRICK))
      } else if (o < -(WALL_R - 0.5)) {
        vol.set(x, p.top + 1, z, S(B.CITY_BRICK_SLAB)) // 宇墙
      } else vol.set(x, p.top, z, S(B.PAVING)) // 马道
    }

    /* 烽火台：5 格见方实心砖台，高十格，顶上一圈垛口、正中一座烟灶 */
    for (const b of this.beacons) {
      if (b.x < x0 || b.x > x1 || b.z < z0 || b.z > z1) continue
      const top = b.base + 10
      for (let dz = -2; dz <= 2; dz++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = b.x + dx
          const z = b.z + dz
          if (!vol.containsColumn(x, z)) continue
          let yb = b.base
          while (yb > 0 && !(vol.get(x, yb, z) & 255)) yb--
          // 收分：上半截四角收进
          const corner = Math.abs(dx) === 2 && Math.abs(dz) === 2
          for (let y = yb + 1; y <= top; y++) if (!(corner && y > b.base + 6)) vol.set(x, y, z, S(y <= yb + 2 ? B.STONE_BRICK : B.CITY_BRICK))
          const rim = Math.max(Math.abs(dx), Math.abs(dz)) === 2
          if (rim && !corner && ((dx + dz) & 1) === 0) vol.set(x, top + 1, z, S(B.CITY_BRICK))
        }
      if (vol.contains(b.x, top + 2, b.z)) {
        vol.set(b.x, top + 1, b.z, S(B.COBBLE))
        vol.set(b.x, top + 2, b.z, S(B.COBBLE))
      }
    }

    /* 券门关楼 */
    for (const g of this.gates) if (!(g.world.maxX < vol.ox || g.world.minX >= vol.ox + vol.sx || g.world.maxZ < vol.oz || g.world.minZ >= vol.oz + vol.sz)) placeStructure(vol, g)
    return n
  }

  /** 敌台：9 格见方，台身实心到马道面；上起一层砖室（箭窗、顺墙两面开门），室顶台面一圈垛口，隔一座加一间铺房 */
  private towerCell(vol: VoxelVolume, x: number, z: number, dx: number, dz: number, p: WallPoint): void {
    const T = p.top
    const rim = Math.max(Math.abs(dx), Math.abs(dz)) === TOWER_R
    const corner = Math.abs(dx) === TOWER_R && Math.abs(dz) === TOWER_R
    if (rim) {
      // 门开在马道中线穿出门面的地方（墙斜着过敌台时偏向一侧），三格宽，正对马道
      const doorFace = p.alongZ ? Math.abs(dz) === TOWER_R && Math.abs(dx - Math.sign(dz) * p.door) <= 1 : Math.abs(dx) === TOWER_R && Math.abs(dz - Math.sign(dx) * p.door) <= 1
      for (let y = T + 1; y <= T + 3; y++) {
        let id: number = B.CITY_BRICK
        if (doorFace && y <= T + 2) id = 0
        // 箭窗：每面三孔
        else if (!corner && y === T + 2 && (Math.abs(dx) === TOWER_R ? dz : dx) % 2 === 0 && Math.abs(Math.abs(dx) === TOWER_R ? dz : dx) <= 2) id = 0
        if (id) vol.set(x, y, z, S(id))
      }
      vol.set(x, T + 4, z, S(B.CITY_BRICK))
      if (((dx + dz) & 1) === 0) vol.set(x, T + 5, z, S(B.CITY_BRICK))
    } else {
      vol.set(x, T, z, S(B.PAVING))
      vol.set(x, T + 4, z, S(B.PAVING))
      // 铺房：台顶正中 5×5 小屋、灰瓦
      if (p.tower === 2 && Math.abs(dx) <= 2 && Math.abs(dz) <= 2) {
        const wall = Math.max(Math.abs(dx), Math.abs(dz)) === 2
        if (wall && !(dx === 0 && dz === 2)) for (let y = T + 5; y <= T + 6; y++) vol.set(x, y, z, S(B.CITY_BRICK))
        vol.set(x, T + 7, z, S(B.ROOF_GRAY_SLAB))
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) vol.set(x, T + 8, z, S(dx === 0 && dz === 0 ? B.ROOF_GRAY : B.ROOF_GRAY_SLAB))
      }
    }
    // 铺房檐：比屋身各出一格
    if (p.tower === 2 && Math.max(Math.abs(dx), Math.abs(dz)) === 3) vol.set(x, T + 7, z, S(B.ROOF_GRAY_SLAB))
  }
}
