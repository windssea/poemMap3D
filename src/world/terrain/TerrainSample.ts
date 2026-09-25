import type { BlockId } from '../block/BlockState'
import type { BiomeId } from '../biome/BiomeId'

export const WaterKind = { None: 0, Sea: 1, River: 2, Lake: 3, Pond: 4 } as const
export type WaterKind = (typeof WaterKind)[keyof typeof WaterKind]

/** 地形塑形阶段的一列（可被江河、湖泊与地标修改器改写） */
export interface TerrainColumn {
  x: number
  z: number
  /** 地表最高实心方块的 Y（浮点，最后取整） */
  height: number
  /** 水面方块 Y；-1 为无水 */
  waterY: number
  waterKind: WaterKind
  /** 到最近水边的距离（方块，水中为 0） */
  waterDist: number
  /** 地标强制的生物群系（-1 为不强制） */
  biomeOverride: number
  /** 覆盖该列的地标下标（-1 为无） */
  landmark: number
  /** 是否为地标铺装地面（不长草木） */
  paved: boolean
}

export interface TerrainSample {
  surfaceY: number
  waterY: number
  waterKind: WaterKind
  slope: number
  biome: BiomeId

  topBlock: BlockId
  soilBlock: BlockId
  rockBlock: BlockId
  soilDepth: number

  waterDistance: number
  landmark: number
  paved: boolean
}

/** 地标地形修改器：在地形塑形流水线末端改写某一范围内的列 */
export interface TerrainModifier {
  readonly landmark: number
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  apply(col: TerrainColumn): void
}
