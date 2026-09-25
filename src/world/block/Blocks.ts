import {
  type BlockDefinition,
  type BlockFaces,
  BlockRenderLayer,
  BlockShape,
  type BlockTag,
  TintClass,
  type VoxelBox,
} from './BlockDefinition'
import { BlockRegistry } from './BlockRegistry'
import { type PackedState, mirrorState, rotateState, stateAxis } from './BlockState'
import type { TextureKey } from './BlockTextures'

/** 方块 id。数值即存档 / 区块数据格式的一部分，只追加不改动。 */
export const B = {
  AIR: 0,
  STONE: 1,
  ROCK: 2,
  DIRT: 3,
  GRASS: 4,
  SAND: 5,
  DESERT_SAND: 6,
  GRAVEL: 7,
  LOESS: 8,
  GOBI: 9,
  RED_EARTH: 10,
  MUD: 11,
  SNOW: 12,
  SNOW_GRASS: 13,
  ICE: 14,
  WATER: 15,
  LOG: 16,
  PINE_LOG: 17,
  PLANKS: 18,
  DARK_PLANKS: 19,
  LEAVES_BROAD: 20,
  LEAVES_PINE: 21,
  LEAVES_WILLOW: 22,
  BLOSSOM: 23,
  BLOSSOM_DEEP: 24,
  BAMBOO: 25,
  BAMBOO_LEAVES: 26,
  TALL_GRASS: 27,
  REED: 28,
  FLOWER_RED: 29,
  FLOWER_YELLOW: 30,
  PLASTER: 31,
  LACQUER: 32,
  PILLAR: 33,
  ROOF_GRAY_STAIRS: 34,
  ROOF_GRAY_SLAB: 35,
  ROOF_GRAY: 36,
  ROOF_YELLOW_STAIRS: 37,
  ROOF_YELLOW_SLAB: 38,
  ROOF_YELLOW: 39,
  ROOF_GREEN_STAIRS: 40,
  ROOF_GREEN_SLAB: 41,
  ROOF_GREEN: 42,
  STONE_BRICK: 43,
  STONE_BRICK_SLAB: 44,
  STONE_BRICK_STAIRS: 45,
  CITY_BRICK: 46,
  CITY_BRICK_SLAB: 47,
  MARBLE: 48,
  MARBLE_SLAB: 49,
  MARBLE_STAIRS: 50,
  MARBLE_FENCE: 51,
  WOOD_FENCE: 52,
  LATTICE_WINDOW: 53,
  PAVING: 54,
  PATH: 55,
  GOLD: 56,
  FINIAL: 57,
  LANTERN: 58,
  THATCH: 59,
  THATCH_STAIRS: 60,
  THATCH_SLAB: 61,
  MOSS_STONE: 62,
  PEBBLE: 63,
  WATERFALL: 64,
  PLANKS_SLAB: 65,
  PLANKS_STAIRS: 66,
  DARK_PLANKS_SLAB: 67,
  DARK_PLANKS_STAIRS: 68,
  COBBLE: 69,
  RIDGE_END: 70,
  DARK_POST: 71,
  PAVING_SLAB: 72,
  SHRUB: 73,
} as const
export type BlockKey = keyof typeof B

const faces = (t: TextureKey | BlockFaces): BlockFaces => (typeof t === 'string' ? { top: t, bottom: t, side: t } : t)

interface Opts {
  tags?: BlockTag[]
  tint?: TintClass
  layer?: BlockRenderLayer
  replaceable?: boolean
  emissive?: number
  glow?: number
  material?: string
}

function base(id: number, name: string, shape: BlockShape, tex: TextureKey | BlockFaces, o: Opts = {}): BlockDefinition {
  const layer = o.layer ?? BlockRenderLayer.Solid
  const full = shape === BlockShape.FULL_CUBE
  return {
    id,
    name,
    shape,
    renderLayer: layer,
    solid: shape !== BlockShape.CROSS_PLANT && shape !== BlockShape.LIQUID && shape !== BlockShape.AIR,
    opaque: full && layer === BlockRenderLayer.Solid,
    liquid: shape === BlockShape.LIQUID,
    replaceable: o.replaceable ?? (shape === BlockShape.CROSS_PLANT || shape === BlockShape.AIR),
    occludesNeighbor: full && layer === BlockRenderLayer.Solid,
    castsShadow: shape !== BlockShape.AIR && layer !== BlockRenderLayer.Effect && shape !== BlockShape.LIQUID,
    receivesAO: layer === BlockRenderLayer.Solid || layer === BlockRenderLayer.Cutout,
    tags: o.tags ?? [],
    materialKey: o.material ?? (layer === BlockRenderLayer.Solid ? 'block.solid' : layer === BlockRenderLayer.Cutout ? 'block.cutout' : layer === BlockRenderLayer.Translucent ? 'block.translucent' : 'block.effect'),
    faces: faces(tex),
    tint: o.tint ?? TintClass.None,
    emissive: o.emissive,
    glow: o.glow,
  }
}

const cube = (id: number, name: string, tex: TextureKey | BlockFaces, o?: Opts) => base(id, name, BlockShape.FULL_CUBE, tex, o)
const slab = (id: number, name: string, tex: TextureKey | BlockFaces, o?: Opts) => base(id, name, BlockShape.SLAB, tex, o)
const stairs = (id: number, name: string, tex: TextureKey | BlockFaces, o?: Opts) => base(id, name, BlockShape.STAIRS, tex, o)
const cross = (id: number, name: string, tex: TextureKey, o?: Opts) =>
  base(id, name, BlockShape.CROSS_PLANT, tex, { layer: BlockRenderLayer.Cutout, tags: ['plant'], ...o })
const custom = (id: number, name: string, tex: TextureKey | BlockFaces, boxes: VoxelBox[], o?: Opts): BlockDefinition => ({
  ...base(id, name, BlockShape.CUSTOM_VOXEL, tex, o),
  boxes,
})

const leaves = (id: number, name: string, tex: TextureKey, tint: TintClass) =>
  cube(id, name, tex, { layer: BlockRenderLayer.Cutout, tags: ['leaves', 'plant'], tint, replaceable: false })

export function createDefaultBlockRegistry(): BlockRegistry {
  const r = new BlockRegistry()
  const grassFaces: BlockFaces = { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }

  r.register(base(B.AIR, 'air', BlockShape.AIR, 'stone', { replaceable: true }))
  r.register(cube(B.STONE, 'stone', 'stone', { tags: ['terrain', 'rock'] }))
  r.register(cube(B.ROCK, 'rock', 'rock', { tags: ['terrain', 'rock'] }))
  r.register(cube(B.DIRT, 'dirt', 'dirt', { tags: ['terrain', 'soil'] }))
  r.register(cube(B.GRASS, 'grass', grassFaces, { tags: ['terrain', 'soil'], tint: TintClass.Grass }))
  r.register(cube(B.SAND, 'sand', 'sand', { tags: ['terrain', 'sand'] }))
  r.register(cube(B.DESERT_SAND, 'desert_sand', 'desert_sand', { tags: ['terrain', 'sand'] }))
  r.register(cube(B.GRAVEL, 'gravel', 'gravel', { tags: ['terrain'] }))
  r.register(cube(B.LOESS, 'loess', 'loess', { tags: ['terrain', 'soil'] }))
  r.register(cube(B.GOBI, 'gobi', 'gobi', { tags: ['terrain'] }))
  r.register(cube(B.RED_EARTH, 'red_earth', 'red_earth', { tags: ['terrain', 'soil'] }))
  r.register(cube(B.MUD, 'mud', 'mud', { tags: ['terrain', 'soil'] }))
  r.register(cube(B.SNOW, 'snow', 'snow', { tags: ['terrain', 'snow'] }))
  r.register(cube(B.SNOW_GRASS, 'snow_grass', { top: 'snow', side: 'snow_side', bottom: 'dirt' }, { tags: ['terrain', 'snow'] }))
  r.register(cube(B.ICE, 'ice', 'ice', { layer: BlockRenderLayer.Translucent, tags: ['water'] }))
  r.register(base(B.WATER, 'water', BlockShape.LIQUID, 'water', { layer: BlockRenderLayer.Translucent, tags: ['water'], tint: TintClass.Water, replaceable: true }))
  r.register(cube(B.LOG, 'log', { top: 'log_top', bottom: 'log_top', side: 'log_side' }, { tags: ['wood'] }))
  r.register(cube(B.PINE_LOG, 'pine_log', { top: 'log_top', bottom: 'log_top', side: 'pine_log' }, { tags: ['wood'] }))
  r.register(cube(B.PLANKS, 'planks', 'planks', { tags: ['wood', 'building'] }))
  r.register(cube(B.DARK_PLANKS, 'dark_planks', 'dark_planks', { tags: ['wood', 'building'] }))
  r.register(leaves(B.LEAVES_BROAD, 'leaves_broad', 'leaves_broad', TintClass.Deciduous))
  r.register(leaves(B.LEAVES_PINE, 'leaves_pine', 'leaves_pine', TintClass.Evergreen))
  r.register(leaves(B.LEAVES_WILLOW, 'leaves_willow', 'leaves_willow', TintClass.Deciduous))
  r.register(leaves(B.BLOSSOM, 'blossom', 'blossom', TintClass.Blossom))
  r.register(leaves(B.BLOSSOM_DEEP, 'blossom_deep', 'blossom_deep', TintClass.Blossom))
  r.register(base(B.BAMBOO, 'bamboo', BlockShape.POST, { top: 'bamboo_stalk', bottom: 'bamboo_stalk', side: 'bamboo_stalk' }, { tags: ['plant', 'wood'] }))
  r.register(leaves(B.BAMBOO_LEAVES, 'bamboo_leaves', 'bamboo_leaves', TintClass.Evergreen))
  r.register(cross(B.TALL_GRASS, 'tall_grass', 'tall_grass', { tint: TintClass.Grass }))
  r.register(cross(B.REED, 'reed', 'reed'))
  r.register(cross(B.FLOWER_RED, 'flower_red', 'flower_red'))
  r.register(cross(B.FLOWER_YELLOW, 'flower_yellow', 'flower_yellow'))
  r.register(cube(B.PLASTER, 'plaster', 'plaster', { tags: ['building', 'wall'] }))
  r.register(cube(B.LACQUER, 'lacquer', 'lacquer', { tags: ['building', 'wall'] }))
  r.register(base(B.PILLAR, 'pillar', BlockShape.POST, 'lacquer', { tags: ['building'] }))

  const roof = (s: number, sl: number, full: number, name: string, tex: TextureKey) => {
    r.register(stairs(s, `${name}_stairs`, tex, { tags: ['building', 'roof'] }))
    r.register(slab(sl, `${name}_slab`, tex, { tags: ['building', 'roof'] }))
    r.register(cube(full, name, tex, { tags: ['building', 'roof'] }))
  }
  roof(B.ROOF_GRAY_STAIRS, B.ROOF_GRAY_SLAB, B.ROOF_GRAY, 'roof_gray', 'roof_gray')
  roof(B.ROOF_YELLOW_STAIRS, B.ROOF_YELLOW_SLAB, B.ROOF_YELLOW, 'roof_yellow', 'roof_yellow')
  roof(B.ROOF_GREEN_STAIRS, B.ROOF_GREEN_SLAB, B.ROOF_GREEN, 'roof_green', 'roof_green')

  r.register(cube(B.STONE_BRICK, 'stone_brick', 'stone_brick', { tags: ['building', 'wall'] }))
  r.register(slab(B.STONE_BRICK_SLAB, 'stone_brick_slab', 'stone_brick', { tags: ['building'] }))
  r.register(stairs(B.STONE_BRICK_STAIRS, 'stone_brick_stairs', 'stone_brick', { tags: ['building'] }))
  r.register(cube(B.CITY_BRICK, 'city_brick', 'city_brick', { tags: ['building', 'wall'] }))
  r.register(slab(B.CITY_BRICK_SLAB, 'city_brick_slab', 'city_brick', { tags: ['building', 'wall'] }))
  r.register(cube(B.MARBLE, 'marble', 'marble', { tags: ['building'] }))
  r.register(slab(B.MARBLE_SLAB, 'marble_slab', 'marble', { tags: ['building'] }))
  r.register(stairs(B.MARBLE_STAIRS, 'marble_stairs', 'marble', { tags: ['building'] }))
  r.register(base(B.MARBLE_FENCE, 'marble_fence', BlockShape.FENCE, 'marble', { tags: ['building'] }))
  r.register(base(B.WOOD_FENCE, 'wood_fence', BlockShape.FENCE, 'dark_planks', { tags: ['building', 'wood'] }))
  r.register(base(B.LATTICE_WINDOW, 'lattice_window', BlockShape.PANE, 'lattice', { layer: BlockRenderLayer.Cutout, tags: ['building'] }))
  r.register(cube(B.PAVING, 'paving', 'paving', { tags: ['building', 'terrain'] }))
  r.register(cube(B.PATH, 'path', 'path', { tags: ['terrain'] }))
  r.register(cube(B.GOLD, 'gold', 'gold', { tags: ['ornament'] }))
  r.register(custom(B.FINIAL, 'finial', 'gold', [[6, 0, 6, 10, 6, 10], [5, 6, 5, 11, 9, 11], [7, 9, 7, 9, 16, 9]], { tags: ['ornament'] }))
  r.register(
    custom(B.LANTERN, 'lantern', { top: 'dark_planks', bottom: 'dark_planks', side: 'lantern' }, [[7, 14, 7, 9, 16, 9], [4, 4, 4, 12, 13, 12], [5, 3, 5, 11, 4, 11], [5, 13, 5, 11, 14, 11]], {
      tags: ['ornament', 'light'],
      emissive: 1,
      glow: 1.1,
    }),
  )
  r.register(cube(B.THATCH, 'thatch', 'thatch', { tags: ['building', 'roof'] }))
  r.register(stairs(B.THATCH_STAIRS, 'thatch_stairs', 'thatch', { tags: ['building', 'roof'] }))
  r.register(slab(B.THATCH_SLAB, 'thatch_slab', 'thatch', { tags: ['building', 'roof'] }))
  r.register(cube(B.MOSS_STONE, 'moss_stone', 'moss_stone', { tags: ['terrain', 'rock'] }))
  r.register(custom(B.PEBBLE, 'pebble', 'pebble', [[2, 0, 3, 7, 2, 7], [9, 0, 8, 14, 3, 13], [4, 0, 10, 7, 1, 13]], { replaceable: true, tags: ['terrain'] }))
  r.register(base(B.WATERFALL, 'waterfall', BlockShape.LIQUID, 'water', { layer: BlockRenderLayer.Translucent, tags: ['water'], tint: TintClass.Water, replaceable: false }))
  r.register(slab(B.PLANKS_SLAB, 'planks_slab', 'planks', { tags: ['wood', 'building'] }))
  r.register(stairs(B.PLANKS_STAIRS, 'planks_stairs', 'planks', { tags: ['wood', 'building'] }))
  r.register(slab(B.DARK_PLANKS_SLAB, 'dark_planks_slab', 'dark_planks', { tags: ['wood', 'building'] }))
  r.register(stairs(B.DARK_PLANKS_STAIRS, 'dark_planks_stairs', 'dark_planks', { tags: ['wood', 'building'] }))
  r.register(cube(B.COBBLE, 'cobble', 'cobble', { tags: ['terrain', 'rock'] }))
  r.register(custom(B.RIDGE_END, 'ridge_end', 'roof_gray', [[4, 0, 4, 12, 8, 12], [5, 8, 5, 11, 12, 11], [5, 12, 2, 11, 16, 7]], { tags: ['roof', 'ornament'] }))
  r.register(base(B.DARK_POST, 'dark_post', BlockShape.POST, 'dark_planks', { tags: ['building', 'wood'] }))
  r.register(slab(B.PAVING_SLAB, 'paving_slab', 'paving', { tags: ['building'] }))
  r.register(leaves(B.SHRUB, 'shrub', 'leaves_broad', TintClass.Deciduous))
  return r
}

/** 全局默认注册表（主线程与各 Worker 各自构建一份，内容相同） */
export const Blocks = createDefaultBlockRegistry()

const FACING_SHAPES = new Set<number>([BlockShape.STAIRS, BlockShape.CUSTOM_VOXEL, BlockShape.PANE])

/** 只转动真正有朝向 / 轴向的方块状态，其余原样（不产生无意义的状态差异） */
export function rotateBlock(p: PackedState, quarter: number): PackedState {
  const shape = Blocks.shape[p & 255]
  if (FACING_SHAPES.has(shape) || stateAxis(p) !== 0) return rotateState(p, quarter)
  return p
}

export function mirrorBlock(p: PackedState, axis: 'x' | 'z'): PackedState {
  return FACING_SHAPES.has(Blocks.shape[p & 255]) ? mirrorState(p, axis) : p
}
