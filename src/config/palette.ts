/**
 * 色彩唯一来源。
 * 业务代码禁止散落十六进制色值：一律从这里的 Palette / MaterialTokens / BiomeTint / SeasonTint / WeatherTint / SkyTokens 取色。
 */

/** 国画矿物色 —— 全局视觉方向 */
export const Palette = {
  shiqing: '#276B83', // 石青
  shilv: '#4F8062', // 石绿
  daiqing: '#263E47', // 黛青
  xuanzhi: '#F2EAD8', // 宣纸白
  gujin: '#B89A64', // 古金
  zhusha: '#A43D32', // 朱砂红
  mo: '#27231F', // 墨
  moDan: '#554C42', // 淡墨
  moQing: '#8A7D6C', // 清墨
  zhe: '#9A6A22', // 赭石
} as const

/**
 * 方块贴图取色：每个贴图 16×16 像素，由 TextureAtlas 按「图案 + 这组颜色」程序生成（非任何现成贴图）。
 * 可染色贴图（草顶、树叶）用接近白的灰阶，由生物群系色在着色器里相乘。
 */
export const MaterialTokens = {
  grassTop: ['#e8e8e8', '#dcdcdc', '#f2f2f2', '#d0d0d0'],
  dirt: ['#8a6446', '#7b573c', '#976f4f', '#6e4d35'],
  stone: ['#7f8485', '#8f9495', '#72777a', '#999d9c'],
  rock: ['#6c7471', '#5f6866', '#7a817c', '#565f5d'],
  cobble: ['#6d7072', '#85898a', '#5a5d60', '#9a9d9c'],
  gravel: ['#88817a', '#9c958d', '#766f69', '#aaa39a'],
  sand: ['#dccfa0', '#d2c392', '#e5d9ae', '#c8b986'],
  desertSand: ['#d9b57a', '#cfa96c', '#e2c28a', '#c49c5f'],
  loess: ['#c9a46a', '#bd975d', '#d4b077', '#b08952'],
  gobi: ['#a38f74', '#8f7c64', '#b39f82', '#7d6c57'],
  redEarth: ['#a8603f', '#9a5537', '#b56d4a', '#8a4b31'],
  mud: ['#6f6a55', '#65604c', '#7a755f', '#5b5644'],
  snow: ['#f4f6f8', '#e8ecf0', '#ffffff', '#dde3ea'],
  ice: ['#b9d7e6', '#a8cadb', '#c9e2ee', '#98bdd0'],
  water: ['#3f7f94', '#397489', '#4a8ba0', '#336a7e'],
  logSide: ['#5c4331', '#4e3829', '#6a4e3a', '#433024'],
  logTop: ['#9a7a55', '#86684a', '#5c4331', '#a8875f'],
  pineLog: ['#6a4a36', '#5a3d2c', '#76543e', '#4c3326'],
  planks: ['#a47c52', '#94704a', '#b0885c', '#86643f'],
  darkPlanks: ['#5d3a26', '#4f311f', '#6a432c', '#44291a'],
  leavesBroad: ['#dedede', '#c4c4c4', '#ececec', '#a9a9a9'],
  leavesPine: ['#d2d2d2', '#b4b4b4', '#c7c7c7', '#9a9a9a'],
  leavesWillow: ['#e6e6e6', '#cfcfcf', '#f3f3f3', '#b8b8b8'],
  blossom: ['#f4c6d0', '#f2b5c4', '#f7d3da', '#ee9fb4'],
  blossomDeep: ['#e07a92', '#d9667f', '#e98fa6', '#c95670'],
  bambooStalk: ['#7da15a', '#6c8f4b', '#8fb36a', '#5a7c3d'],
  bambooLeaves: ['#dcdcdc', '#c0c0c0', '#ececec', '#a6a6a6'],
  tallGrass: ['#e0e0e0', '#c8c8c8', '#b0b0b0', '#f0f0f0'],
  reed: ['#b9a877', '#a8986a', '#c8b886', '#8f8158'],
  flowerRed: ['#c8443a', '#e0625a', '#7da15a', '#5a7c3d'],
  flowerYellow: ['#e8c34a', '#f2d86a', '#7da15a', '#5a7c3d'],
  plaster: ['#ece6d6', '#e2dbc8', '#f4efe2', '#d7cfba'],
  lacquer: ['#a43d32', '#943429', '#b24a3d', '#842d24'],
  roofGray: ['#3f4a52', '#353f46', '#4a565e', '#2c353b'],
  roofYellow: ['#d9a93a', '#c8962c', '#e6bb52', '#b38324'],
  roofGreen: ['#3f7d63', '#346c55', '#4a8b70', '#2c5e49'],
  stoneBrick: ['#8d8a82', '#7e7b74', '#9b9890', '#6f6c66'],
  cityBrick: ['#6f6d68', '#62605b', '#7c7a74', '#55534f'],
  marble: ['#e9e6dc', '#dcd8cc', '#f3f0e8', '#cfcabd'],
  paving: ['#a9a393', '#9b9585', '#b6b0a0', '#8e8878'],
  path: ['#b39b76', '#a58d69', '#c0a883', '#98815e'],
  lattice: ['#5d3a26', '#6a432c', '#f2e4c4', '#e6d3ab'],
  gold: ['#d4b25a', '#b89a64', '#e6c878', '#9c7f45'],
  lantern: ['#d8483a', '#f08a4a', '#ffcf7a', '#8a2a20'],
  thatch: ['#b89a64', '#a88a56', '#c7a972', '#94784a'],
  mossStone: ['#6f7a66', '#5f6a57', '#7d8872', '#8a8a7a'],
  pebble: ['#9c9a92', '#8a8880', '#b0aea6', '#7a7870'],
  lotus: ['#4f8062', '#5f9070', '#e9a3b8', '#3f6f52'],
} as const

export type MaterialTokenKey = keyof typeof MaterialTokens

/** 生物群系染色（草顶 / 树叶） */
export const BiomeTint = {
  mountain: { grass: '#7fa068', foliage: '#4f8062' },
  hillside: { grass: '#8fb06a', foliage: '#5a8a58' },
  plain: { grass: '#9dbb6c', foliage: '#6a9559' },
  riverside: { grass: '#8cb872', foliage: '#6aa05e' },
  wetland: { grass: '#7fae78', foliage: '#5e9463' },
  garden: { grass: '#98c07a', foliage: '#6a9c5e' },
  plateau: { grass: '#a9ad74', foliage: '#617c55' },
  steppe: { grass: '#b3b879', foliage: '#6e8a55' },
  desert: { grass: '#c4b27a', foliage: '#7e8a5a' },
  gobi: { grass: '#b4a47a', foliage: '#7a8458' },
  cliff: { grass: '#7c9a66', foliage: '#4c7a5c' },
  snow: { grass: '#a8b8a8', foliage: '#4c6e5a' },
  ocean: { grass: '#9dbb6c', foliage: '#6a9559' },
  beach: { grass: '#a9c07a', foliage: '#6a9559' },
} as const

/** 专用树叶色（与生物群系叠乘前的树种底色） */
export const FoliageTokens = {
  broad: '#6a9a58',
  pine: '#2f5a44',
  willow: '#8fbf5e',
  bamboo: '#5f9a4a',
  grassTuft: '#8fb46a',
} as const

/** 季节：[草色乘子, 阔叶乘子, 枯黄混合量, 地面积雪] */
export const SeasonTint = {
  spring: { grass: '#f4fff0', foliage: '#f2ffe6', autumn: 0.0, snow: 0 },
  summer: { grass: '#e6f2dc', foliage: '#dcecd2', autumn: 0.0, snow: 0 },
  autumn: { grass: '#fff0c8', foliage: '#ffffff', autumn: 0.85, snow: 0 },
  winter: { grass: '#e8e4d8', foliage: '#d6d8d0', autumn: 0.45, snow: 1 },
} as const

/** 秋叶：阔叶在秋季混向这组暖色 */
export const AutumnTokens = { maple: '#c8562e', gold: '#d9a23a', rust: '#a8482a' } as const

export const WeatherTint = {
  clear: { light: 1.0, fog: 1.0, saturation: 1.0 },
  rain: { light: 0.62, fog: 1.9, saturation: 0.72 },
  snow: { light: 0.8, fog: 1.7, saturation: 0.6 },
  rainColor: '#a8b8c4',
  snowColor: '#ffffff',
} as const

/** 天空 / 光照 —— 按时辰 */
export const SkyTokens = {
  dawn: { top: '#94b0d0', horizon: '#f2dccb', sun: '#ffd6aa', ambientSky: '#d9dde6', ambientGround: '#b39c86', fog: '#ebe3da', cloud: '#fff1e6' },
  day: { top: '#7aa8bd', horizon: '#f2ead8', sun: '#fff3e2', ambientSky: '#e4eef2', ambientGround: '#c6ab7c', fog: '#e8e4d6', cloud: '#ffffff' },
  dusk: { top: '#8298b0', horizon: '#f2c38e', sun: '#ffb070', ambientSky: '#c4c8d6', ambientGround: '#a47f60', fog: '#e6c7a0', cloud: '#ffd9b8' },
  night: { top: '#122038', horizon: '#384a6c', sun: '#b4c6ff', ambientSky: '#667aa6', ambientGround: '#2c3440', fog: '#2e3b57', cloud: '#56627e' },
} as const

/** 水色：浅 → 中 → 深 */
export const WaterTokens = {
  shallow: '#6fa89a',
  mid: '#3f7f94',
  deep: '#263e47',
  foam: '#f2ead8',
  sky: '#c9dde4',
} as const

/** 覆盖图（全国代理）专用色 */
export const OverviewTokens = {
  forest: '#4a7a52',
  seaDeep: '#2d5d71',
  seaShallow: '#5f9fae',
  inkRiver: '#3f86b0',
  inkYellowRiver: '#c2903a',
  greatWall: '#8a3d2a',
  landmarkRoof: '#3f4a52',
  landmarkWall: '#ece6d6',
} as const

/** 诗人足迹色 */
export const TrailTokens = ['#b1402c', '#6b4a8a', '#4b7a5a', '#9a6a22', '#2d5d71', '#7a5a3a'] as const

/** 调试叠加色 */
export const DebugTokens = {
  chunkReady: '#4f8062',
  chunkPending: '#b89a64',
  chunkDirty: '#a43d32',
  selection: '#1b1b1b',
} as const
