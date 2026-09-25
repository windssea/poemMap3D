import type { BiomeId } from '../biome/BiomeId'
import type { TreeType } from '../biome/BiomeRegistry'
import type { VoxelStructure } from '../structure/VoxelStructure'

export type { TreeType }

/** 尺度等级：以民居（约 8 方块高）为参照 */
export type TreeScale = 'garden' | 'mature' | 'grand'

export interface TreeParams {
  variant: number
  seed: number
  /** 目标高度（方块） */
  height: number
}

/** 树的生长：TreeDefinition → TreeStructureFactory → VoxelStructure */
export type TreeStructureFactory = (p: TreeParams) => VoxelStructure

export interface TreeVariantInfo {
  name: string
  scale: TreeScale
}

export interface TreeDefinition {
  id: TreeType
  name: string
  variants: number
  variantInfo: readonly TreeVariantInfo[]
  minHeight: number
  maxHeight: number
  allowedBiomes: readonly BiomeId[]
  /** 最小株距（方块） */
  minSpacing: number
  /** 冠幅半径上限（方块）：决定跨区块取样范围 */
  maxRadius: number
  factory: TreeStructureFactory
}
