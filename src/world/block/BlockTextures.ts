import type { MaterialTokenKey } from '../../config/palette'

/**
 * 方块贴图表。顺序即贴图数组层号（mesher 写入顶点，TextureAtlas 生成像素），两边共用这一张表。
 * pattern 是程序化像素图案，tokens 指向 config/palette 的取色组。
 */
export type TexturePattern =
  | 'noise'
  | 'grassTop'
  | 'grassSide'
  | 'snowSide'
  | 'strata'
  | 'cobble'
  | 'speckle'
  | 'logSide'
  | 'logTop'
  | 'planks'
  | 'leaves'
  | 'needles'
  | 'willowLeaves'
  | 'blossom'
  | 'bambooStalk'
  | 'bambooLeaves'
  | 'cross'
  | 'reed'
  | 'flower'
  | 'plaster'
  | 'lacquer'
  | 'roofTiles'
  | 'bricks'
  | 'bigBricks'
  | 'marble'
  | 'paving'
  | 'lattice'
  | 'gold'
  | 'lantern'
  | 'thatch'
  | 'water'
  | 'ice'
  | 'pebble'

export interface TextureDef {
  key: string
  tokens: MaterialTokenKey
  pattern: TexturePattern
}

export const TEXTURES = [
  { key: 'grass_top', tokens: 'grassTop', pattern: 'grassTop' },
  { key: 'grass_side', tokens: 'dirt', pattern: 'grassSide' },
  { key: 'dirt', tokens: 'dirt', pattern: 'noise' },
  { key: 'stone', tokens: 'stone', pattern: 'noise' },
  { key: 'rock', tokens: 'rock', pattern: 'strata' },
  { key: 'cobble', tokens: 'cobble', pattern: 'cobble' },
  { key: 'gravel', tokens: 'gravel', pattern: 'speckle' },
  { key: 'sand', tokens: 'sand', pattern: 'speckle' },
  { key: 'desert_sand', tokens: 'desertSand', pattern: 'speckle' },
  { key: 'loess', tokens: 'loess', pattern: 'strata' },
  { key: 'gobi', tokens: 'gobi', pattern: 'speckle' },
  { key: 'red_earth', tokens: 'redEarth', pattern: 'noise' },
  { key: 'mud', tokens: 'mud', pattern: 'noise' },
  { key: 'snow', tokens: 'snow', pattern: 'noise' },
  { key: 'snow_side', tokens: 'dirt', pattern: 'snowSide' },
  { key: 'ice', tokens: 'ice', pattern: 'ice' },
  { key: 'water', tokens: 'water', pattern: 'water' },
  { key: 'log_side', tokens: 'logSide', pattern: 'logSide' },
  { key: 'log_top', tokens: 'logTop', pattern: 'logTop' },
  { key: 'pine_log', tokens: 'pineLog', pattern: 'logSide' },
  { key: 'planks', tokens: 'planks', pattern: 'planks' },
  { key: 'dark_planks', tokens: 'darkPlanks', pattern: 'planks' },
  { key: 'leaves_broad', tokens: 'leavesBroad', pattern: 'leaves' },
  { key: 'leaves_pine', tokens: 'leavesPine', pattern: 'needles' },
  { key: 'leaves_willow', tokens: 'leavesWillow', pattern: 'willowLeaves' },
  { key: 'blossom', tokens: 'blossom', pattern: 'blossom' },
  { key: 'blossom_deep', tokens: 'blossomDeep', pattern: 'blossom' },
  { key: 'bamboo_stalk', tokens: 'bambooStalk', pattern: 'bambooStalk' },
  { key: 'bamboo_leaves', tokens: 'bambooLeaves', pattern: 'bambooLeaves' },
  { key: 'tall_grass', tokens: 'tallGrass', pattern: 'cross' },
  { key: 'reed', tokens: 'reed', pattern: 'reed' },
  { key: 'flower_red', tokens: 'flowerRed', pattern: 'flower' },
  { key: 'flower_yellow', tokens: 'flowerYellow', pattern: 'flower' },
  { key: 'plaster', tokens: 'plaster', pattern: 'plaster' },
  { key: 'lacquer', tokens: 'lacquer', pattern: 'lacquer' },
  { key: 'roof_gray', tokens: 'roofGray', pattern: 'roofTiles' },
  { key: 'roof_yellow', tokens: 'roofYellow', pattern: 'roofTiles' },
  { key: 'roof_green', tokens: 'roofGreen', pattern: 'roofTiles' },
  { key: 'stone_brick', tokens: 'stoneBrick', pattern: 'bricks' },
  { key: 'city_brick', tokens: 'cityBrick', pattern: 'bigBricks' },
  { key: 'marble', tokens: 'marble', pattern: 'marble' },
  { key: 'paving', tokens: 'paving', pattern: 'paving' },
  { key: 'path', tokens: 'path', pattern: 'speckle' },
  { key: 'lattice', tokens: 'lattice', pattern: 'lattice' },
  { key: 'gold', tokens: 'gold', pattern: 'gold' },
  { key: 'lantern', tokens: 'lantern', pattern: 'lantern' },
  { key: 'thatch', tokens: 'thatch', pattern: 'thatch' },
  { key: 'moss_stone', tokens: 'mossStone', pattern: 'cobble' },
  { key: 'pebble', tokens: 'pebble', pattern: 'pebble' },
] as const satisfies readonly TextureDef[]

export type TextureKey = (typeof TEXTURES)[number]['key']

const INDEX = new Map<string, number>(TEXTURES.map((t, i) => [t.key, i]))

export function textureIndex(key: TextureKey): number {
  return INDEX.get(key)!
}
