import type { BlockId } from './BlockState'
import type { TextureKey } from './BlockTextures'

export const BlockShape = {
  AIR: 0,
  FULL_CUBE: 1,
  SLAB: 2,
  STAIRS: 3,
  POST: 4,
  FENCE: 5,
  PANE: 6,
  CROSS_PLANT: 7,
  LIQUID: 8,
  CUSTOM_VOXEL: 9,
} as const
export type BlockShape = (typeof BlockShape)[keyof typeof BlockShape]

export const BlockRenderLayer = { Solid: 0, Cutout: 1, Translucent: 2, Effect: 3 } as const
export type BlockRenderLayer = (typeof BlockRenderLayer)[keyof typeof BlockRenderLayer]
export const RENDER_LAYER_COUNT = 4

export type BlockTag =
  | 'terrain'
  | 'soil'
  | 'rock'
  | 'sand'
  | 'snow'
  | 'wood'
  | 'leaves'
  | 'plant'
  | 'water'
  | 'building'
  | 'roof'
  | 'wall'
  | 'ornament'
  | 'light'

/** 着色类别：决定 mesher 写入哪种生物群系色，以及季节着色器如何处理 */
export const TintClass = {
  None: 0,
  Grass: 1,
  Deciduous: 2,
  Evergreen: 3,
  Blossom: 4,
  Water: 5,
  /** 荷：夏季满塘，春秋稀，冬季无（着色器按季节镂空） */
  Lotus: 6,
} as const
export type TintClass = (typeof TintClass)[keyof typeof TintClass]

/** 1/16 方块单位的盒子：[x0, y0, z0, x1, y1, z1] */
export type VoxelBox = readonly [number, number, number, number, number, number]

export interface BlockFaces {
  top: TextureKey
  bottom: TextureKey
  side: TextureKey
}

export interface BlockDefinition {
  id: BlockId
  name: string

  shape: BlockShape
  renderLayer: BlockRenderLayer

  solid: boolean
  opaque: boolean
  liquid: boolean
  replaceable: boolean
  occludesNeighbor: boolean

  castsShadow: boolean
  receivesAO: boolean

  tags: readonly BlockTag[]
  materialKey: string

  faces: BlockFaces
  tint: TintClass
  /** CUSTOM_VOXEL 的盒子（朝北时） */
  boxes?: readonly VoxelBox[]
  /** 夜间自发光强度（0–1） */
  emissive?: number
  /** 额外在 Effect 层生成的光晕（半边长，方块单位） */
  glow?: number
}
