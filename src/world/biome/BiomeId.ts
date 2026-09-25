export const BiomeId = {
  Ocean: 0,
  Beach: 1,
  Plain: 2,
  Hillside: 3,
  Mountain: 4,
  Riverside: 5,
  Wetland: 6,
  Garden: 7,
  Plateau: 8,
  Steppe: 9,
  Desert: 10,
  Gobi: 11,
  Cliff: 12,
  Snow: 13,
} as const
export type BiomeId = (typeof BiomeId)[keyof typeof BiomeId]
export const BIOME_COUNT = 14

export const BIOME_KEYS = [
  'ocean',
  'beach',
  'plain',
  'hillside',
  'mountain',
  'riverside',
  'wetland',
  'garden',
  'plateau',
  'steppe',
  'desert',
  'gobi',
  'cliff',
  'snow',
] as const
export type BiomeKey = (typeof BIOME_KEYS)[number]

export const BIOME_NAMES_ZH = ['海', '海滩', '平原', '丘陵', '山地', '河岸', '湿地', '园林', '高原', '草原', '荒漠', '戈壁', '陡崖', '雪山'] as const
