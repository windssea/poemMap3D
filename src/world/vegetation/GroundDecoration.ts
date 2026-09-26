import { hash2i, hashUnit } from '../../utils/math'
import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { biomeDef } from '../biome/BiomeRegistry'
import { Occupancy, type OccupancyMap } from '../structure/OccupancyMap'
import type { TerrainRegion } from '../terrain/TerrainManager'
import { WaterKind } from '../terrain/TerrainSample'
import type { VoxelVolume } from '../voxel/VoxelVolume'

const SHORE_TOP = new Set<number>([B.SAND, B.GRAVEL, B.GRASS, B.MUD])

/**
 * 地被：草簇、野花、卵石、芦苇。只写在地表上方仍为空气、地表仍是原地形的位置（建筑与树优先）。
 * 芦苇成丛落在滩边，卵石沿岸，草簇与野花按生物群系。
 */
export function decorateGround(vol: VoxelVolume, region: TerrainRegion, occupancy: OccupancyMap, seed: number): void {
  for (let lz = 0; lz < vol.sz; lz++)
    for (let lx = 0; lx < vol.sx; lx++) {
      const x = vol.ox + lx
      const z = vol.oz + lz
      const s = region.at(x, z)
      if (!s || s.paved) continue
      /* 荷：湖、塘里水深一到三格处成片（大片的空处留着水面），偶有荷花 */
      if (s.waterY >= 0) {
        const depth = s.waterY - s.surfaceY
        if ((s.waterKind === WaterKind.Lake || s.waterKind === WaterKind.Pond) && depth >= 1 && depth <= 3 && vol.get(x, s.waterY + 1, z) === 0) {
          const patch = hashUnit(hash2i(x >> 3, z >> 3, seed + 431))
          const r = hashUnit(hash2i(x, z, seed + 433))
          if (patch < 0.3 && r < 0.62) vol.set(x, s.waterY + 1, z, S(r < 0.07 ? B.LOTUS_FLOWER : B.LOTUS_PAD))
        }
        continue
      }
      const y = s.surfaceY
      if ((vol.get(x, y, z) & 255) !== s.topBlock || vol.get(x, y + 1, z) !== 0) continue
      if (occupancy.has(x, z, Occupancy.Building | Occupancy.Entrance | Occupancy.Paved)) continue
      const g = biomeDef(s.biome).ground
      const r = hashUnit(hash2i(x, z, seed + 401))
      const cluster = hashUnit(hash2i(x >> 2, z >> 2, seed + 409))
      if (s.waterKind !== WaterKind.None && s.waterKind !== WaterKind.Sea && s.waterDistance < 2.2 && SHORE_TOP.has(s.topBlock)) {
        // 芦苇只成丛长在湿地岸（和少量浅滩岸）；岩岸偶有卵石；草岸只是草
        if ((s.shore === 4 && cluster < 0.6 && r < 0.55) || (s.shore === 2 && cluster < 0.3 && r < 0.3)) {
          vol.set(x, y + 1, z, S(B.REED))
          continue
        }
        if (s.shore === 3 && r > 0.94) {
          vol.set(x, y + 1, z, S(B.PEBBLE))
          continue
        }
      }
      /* 草、花成片而稀（大块简单区域 + 少量重点细节），比原先少四成五 */
      if (s.topBlock === B.GRASS) {
        if (r < g.grass * 0.55 * (0.2 + cluster * 1.3)) vol.set(x, y + 1, z, S(B.TALL_GRASS))
        else if (r < g.grass * 0.55 + g.flower * 0.5 && cluster > 0.55) vol.set(x, y + 1, z, S(r * 997 % 1 < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW))
      } else if (r < g.pebble * 0.4) vol.set(x, y + 1, z, S(B.PEBBLE))
    }
}
