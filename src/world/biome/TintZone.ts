import { ShanshuiZones, type ShanshuiZoneKey } from '../../config/palette'
import { smoothstep } from '../../utils/math'
import { BiomeId } from './BiomeId'

export const ZONE_COUNT = ShanshuiZones.length
const Z = Object.fromEntries(ShanshuiZones.map((z, i) => [z.key, i])) as Record<ShanshuiZoneKey, number>
export const zoneIndex = (k: ShanshuiZoneKey): number => Z[k]

/**
 * 千里江山图配色：一列的草 / 叶染色分区。
 * 连续的海拔与纬度过渡用细噪声抖动选相邻分区，得到色块交错的过渡而不是一道硬线。
 *
 * @param meters 海拔（米）
 * @param coarse 低频噪声 [-1, 1]（片状变化）
 * @param dither 高频噪声 [0, 1)（相邻分区之间抖动）
 */
export function tintZoneOf(biome: number, meters: number, lat: number, coarse: number, dither: number): number {
  const pick = (t: number, zones: ShanshuiZoneKey[]): number => {
    const f = Math.min(zones.length - 1e-6, Math.max(0, t * (zones.length - 1) + (dither - 0.5) * 0.9 + 0.5))
    return Z[zones[Math.floor(f)]]
  }
  switch (biome) {
    case BiomeId.Desert:
    case BiomeId.Gobi:
      return Z.gobi
    case BiomeId.Steppe:
      return coarse > 0 ? Z.steppe2 : Z.steppe
    case BiomeId.Plateau:
      return pick(smoothstep(3800, 5200, meters) * 0.6 + (coarse * 0.5 + 0.5) * 0.4, ['alp', 'alp2', 'alpAzure'])
    case BiomeId.Beach:
      return Z.shore
    case BiomeId.Tropical:
      return dither < 0.7 ? Z.tropic : Z.meadow
    case BiomeId.Taiga:
      return dither < 0.75 ? Z.taiga : Z.forest2
    case BiomeId.Karst:
      return meters > 1100 ? Z.malachite : dither < 0.7 ? Z.karst : Z.foothill
    case BiomeId.Riverside:
    case BiomeId.Wetland:
    case BiomeId.Garden:
      if (meters < 400) return dither < 0.5 ? Z.meadow : Z.paddy
  }
  if (meters > 3300) return pick(smoothstep(3300, 5600, meters), ['alp', 'alp2', 'alpAzure', 'azure2'])
  if (meters > 1100) return pick(smoothstep(1100, 2800, meters), ['malachite', 'teal', 'azure2', 'azure'])
  if (meters > 320) return pick(smoothstep(320, 1100, meters) * 0.85 + (coarse * 0.5 + 0.5) * 0.15, ['foothill', 'forest', 'forest2', 'malachite', 'teal'])
  if (lat > 44) return Z.north
  /* 平原：北方黄绿田、南方稻绿；近丘陵处渐入林色 */
  const south = smoothstep(35, 30, lat)
  const hill = smoothstep(120, 320, meters)
  if (hill > 0.5 + (dither - 0.5) * 0.5) return Z.foothill
  const s = south + (coarse * 0.3) + (dither - 0.5) * 0.5
  if (s > 0.5) return coarse > 0.1 ? Z.paddy2 : Z.paddy
  return coarse > 0 ? Z.field2 : Z.field
}
