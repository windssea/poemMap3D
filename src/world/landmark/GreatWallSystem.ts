import { resamplePolyline } from '../../utils/geometry2d'
import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { getProjection } from '../coordinate/GeoProjection'
import { GREAT_WALL, GREAT_WALL_PASSES } from '../generation/geography/GeographyData'
import { projectLine } from '../generation/geography/MacroGeography'
import { Occupancy, type OccupancyMap } from '../structure/OccupancyMap'
import type { TerrainManager } from '../terrain/TerrainManager'
import type { VoxelVolume } from '../voxel/VoxelVolume'

interface WallPoint {
  x: number
  z: number
  top: number
  tower: boolean
}

const BUCKET = 64
const HEIGHT = 6

/**
 * 长城：沿明长城走向、随山脊起伏的线性结构（城墙 3 格宽，敌楼 7 格见方），关城处加宽。
 * 与其他结构一样逐区块按世界坐标写入，跨区块严丝合缝。
 */
export class GreatWallSystem {
  readonly points: WallPoint[] = []
  private readonly buckets = new Map<number, WallPoint[]>()

  constructor(terrain: TerrainManager, occupancy: OccupancyMap) {
    const P = getProjection()
    const line = resamplePolyline(projectLine(P, GREAT_WALL), 1)
    const passes = GREAT_WALL_PASSES.map((p) => P.project(p.lng, p.lat))
    const seen = new Set<number>()
    let i = 0
    for (const [fx, fz] of line) {
      const x = Math.round(fx)
      const z = Math.round(fz)
      const k = ((x + 32768) << 16) | (z + 32768)
      if (seen.has(k)) continue
      seen.add(k)
      const c = terrain.column(x, z)
      if (c.waterY >= 0 && c.height < c.waterY) continue
      const nearPass = passes.some((p) => Math.hypot(p.x - x, p.z - z) < 6)
      const pt: WallPoint = { x, z, top: Math.floor(c.height) + HEIGHT, tower: i % 56 === 0 || nearPass }
      i++
      this.points.push(pt)
      const bk = ((Math.floor(x / BUCKET) + 1024) << 11) | (Math.floor(z / BUCKET) + 1024)
      const b = this.buckets.get(bk)
      if (b) b.push(pt)
      else this.buckets.set(bk, [pt])
      const r = pt.tower ? 4 : 2
      occupancy.markRect(x - r, z - r, x + r, z + r, Occupancy.Building)
    }
  }

  apply(vol: VoxelVolume): number {
    const x0 = vol.ox - 4
    const z0 = vol.oz - 4
    const x1 = vol.ox + vol.sx + 3
    const z1 = vol.oz + vol.sz + 3
    let n = 0
    for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++)
      for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
        for (const p of this.buckets.get(((i + 1024) << 11) | (j + 1024)) ?? []) {
          if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue
          const r = p.tower ? 3 : 1
          const top = p.tower ? p.top + 4 : p.top
          for (let dz = -r; dz <= r; dz++)
            for (let dx = -r; dx <= r; dx++) {
              const x = p.x + dx
              const z = p.z + dz
              if (!vol.containsColumn(x, z)) continue
              let y = top
              // 从墙顶向下砌到地面
              for (; y > 0; y--) {
                const cur = vol.get(x, y, z) & 255
                if (y <= top - HEIGHT && cur && cur !== B.WATER && cur !== B.TALL_GRASS && cur !== B.REED) break
                vol.set(x, y, z, S(dx === 0 && dz === 0 && y === top ? B.PAVING : B.CITY_BRICK))
              }
              const edge = Math.max(Math.abs(dx), Math.abs(dz)) === r
              if (edge && (x + z) % 2 === 0) vol.set(x, top + 1, z, S(B.CITY_BRICK))
              n++
            }
          if (p.tower && vol.contains(p.x, top + 1, p.z)) {
            for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) vol.set(p.x + dx, top + 4, p.z + dz, S(B.ROOF_GRAY_SLAB))
            for (const [dx, dz] of [
              [-2, -2],
              [2, -2],
              [-2, 2],
              [2, 2],
            ])
              for (let y = 1; y < 4; y++) vol.set(p.x + dx, top + y, p.z + dz, S(B.CITY_BRICK))
          }
        }
    return n
  }
}
