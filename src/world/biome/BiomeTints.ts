import { BiomeTint, FoliageTokens } from '../../config/palette'
import { TEXTURES } from '../block/BlockTextures'
import { BIOME_COUNT, BIOME_KEYS } from './BiomeId'

const hexToRgb = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
]

/** 每张可染色贴图的底色：草按生物群系；树叶以树种底色为主，少量偏向当地叶色 */
const TILE_TINT: Record<string, { base: keyof typeof FoliageTokens | 'grass'; biomeMix: number }> = {
  grass_top: { base: 'grass', biomeMix: 1 },
  grass_side: { base: 'grass', biomeMix: 1 },
  tall_grass: { base: 'grass', biomeMix: 1 },
  leaves_broad: { base: 'broad', biomeMix: 0.35 },
  leaves_pine: { base: 'pine', biomeMix: 0.12 },
  leaves_willow: { base: 'willow', biomeMix: 0.2 },
  bamboo_leaves: { base: 'bamboo', biomeMix: 0.15 },
}

/**
 * 染色表：tile × biome → RGB（打包成 24 位整数）。不可染色的贴图为白色。
 * 由 mesher（Worker 内）直接查表，结果写进顶点色。
 */
export function buildTintTable(): Uint32Array {
  const t = new Uint32Array(TEXTURES.length * BIOME_COUNT).fill(0xffffff)
  TEXTURES.forEach((tex, ti) => {
    const spec = TILE_TINT[tex.key]
    if (!spec) return
    for (let b = 0; b < BIOME_COUNT; b++) {
      const biome = BiomeTint[BIOME_KEYS[b]]
      const rgb = spec.base === 'grass' ? hexToRgb(biome.grass) : mix(hexToRgb(FoliageTokens[spec.base]), hexToRgb(biome.foliage), spec.biomeMix)
      t[ti * BIOME_COUNT + b] = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]
    }
  })
  return t
}
