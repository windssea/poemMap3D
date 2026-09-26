import { FoliageTokens, ShanshuiZones } from '../../config/palette'
import { TEXTURES } from '../block/BlockTextures'
import { ZONE_COUNT } from './TintZone'

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

/** 每张可染色贴图的底色：草按分区；树叶以树种底色为主，偏向当地叶色（山里树也发青） */
const TILE_TINT: Record<string, { base: keyof typeof FoliageTokens | 'grass'; zoneMix: number }> = {
  grass_top: { base: 'grass', zoneMix: 1 },
  grass_side: { base: 'grass', zoneMix: 1 },
  tall_grass: { base: 'grass', zoneMix: 1 },
  leaves_broad: { base: 'broad', zoneMix: 0.3 },
  leaves_pine: { base: 'pine', zoneMix: 0.12 },
  leaves_willow: { base: 'willow', zoneMix: 0.12 },
  bamboo_leaves: { base: 'bamboo', zoneMix: 0.15 },
  rice: { base: 'rice', zoneMix: 0.2 },
  leaves_palm: { base: 'palm', zoneMix: 0.3 },
}

/**
 * 染色表：tile × 配色分区 → RGB（24 位整数）。不可染色的贴图为白色。
 * 由 mesher（Worker 内）直接查表，结果写进顶点色。
 */
export function buildTintTable(): Uint32Array {
  const t = new Uint32Array(TEXTURES.length * ZONE_COUNT).fill(0xffffff)
  TEXTURES.forEach((tex, ti) => {
    const spec = TILE_TINT[tex.key]
    if (!spec) return
    for (let z = 0; z < ZONE_COUNT; z++) {
      const zone = ShanshuiZones[z]
      // 草色往灰黄绿里压三成五：树冠从地面上分得出来
      const rgb = spec.base === 'grass' ? mix(hexToRgb(zone.grass), hexToRgb(FoliageTokens.grassMute), 0.35) : mix(hexToRgb(FoliageTokens[spec.base]), hexToRgb(zone.foliage), spec.zoneMix)
      t[ti * ZONE_COUNT + z] = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
    }
  })
  return t
}
