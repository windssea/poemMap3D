import { BiomeId } from '../biome/BiomeId'
import type { TreeType } from '../biome/BiomeRegistry'
import { pruneFloating } from '../structure/StructureAnalysis'
import type { VoxelStructure } from '../structure/VoxelStructure'
import type { TreeDefinition, TreeScale } from './TreeDefinition'
import { BAMBOO_VARIANTS, BIRCH_VARIANTS, BROADLEAF_VARIANTS, PALM_VARIANTS, PEACH_VARIANTS, PINE_VARIANTS, WILLOW_VARIANTS, bambooGrove, birch, broadleaf, palm, peach, pine, willow } from './TreeFactories'

/** 植物尺度规范（方块高）：以民居约 8 格为参照 */
export const TREE_SCALE_HEIGHT: Record<TreeScale, [number, number]> = {
  garden: [6, 8],
  mature: [10, 13],
  grand: [13, 16],
}

const all = Object.values(BiomeId).filter((b) => b !== BiomeId.Ocean && b !== BiomeId.Desert && b !== BiomeId.Gobi && b !== BiomeId.Snow)

export const TREES: Record<TreeType, TreeDefinition> = {
  broadleaf: {
    id: 'broadleaf',
    name: '阔叶树',
    variants: BROADLEAF_VARIANTS.length,
    variantInfo: BROADLEAF_VARIANTS.map((v) => ({ name: v.name, scale: v.name === '高卵形' ? 'grand' : v.name === '庭院小树' ? 'garden' : 'mature' })),
    minHeight: 6,
    maxHeight: 16,
    allowedBiomes: all,
    minSpacing: 6,
    maxRadius: 8,
    factory: broadleaf,
  },
  pine: {
    id: 'pine',
    name: '松树',
    variants: PINE_VARIANTS.length,
    variantInfo: PINE_VARIANTS.map((v) => ({ name: v.name, scale: v.name === '横枝景观松' ? 'grand' : 'mature' })),
    minHeight: 8,
    maxHeight: 16,
    allowedBiomes: [BiomeId.Mountain, BiomeId.Hillside, BiomeId.Cliff, BiomeId.Plateau, BiomeId.Garden, BiomeId.Plain, BiomeId.Karst, BiomeId.Taiga],
    minSpacing: 4,
    maxRadius: 10,
    factory: pine,
  },
  willow: {
    id: 'willow',
    name: '柳树',
    variants: WILLOW_VARIANTS.length,
    variantInfo: WILLOW_VARIANTS.map((v) => ({ name: v.name, scale: v.name === '庭院柳' ? 'garden' : v.name === '景观柳' ? 'grand' : 'mature' })),
    minHeight: 7,
    maxHeight: 15,
    allowedBiomes: [BiomeId.Riverside, BiomeId.Wetland, BiomeId.Garden, BiomeId.Plain],
    minSpacing: 6,
    maxRadius: 8,
    factory: willow,
  },
  peach: {
    id: 'peach',
    name: '桃花树',
    variants: PEACH_VARIANTS.length,
    variantInfo: PEACH_VARIANTS.map((v) => ({ name: v.name, scale: 'garden' })),
    minHeight: 6,
    maxHeight: 8,
    allowedBiomes: [BiomeId.Garden, BiomeId.Riverside, BiomeId.Plain, BiomeId.Hillside],
    minSpacing: 4,
    maxRadius: 6,
    factory: peach,
  },
  bamboo: {
    id: 'bamboo',
    name: '竹林',
    variants: BAMBOO_VARIANTS.length,
    variantInfo: BAMBOO_VARIANTS.map((v) => ({ name: v.name, scale: 'garden' })),
    minHeight: 8,
    maxHeight: 14,
    allowedBiomes: [BiomeId.Garden, BiomeId.Riverside, BiomeId.Hillside, BiomeId.Plain, BiomeId.Karst, BiomeId.Tropical],
    minSpacing: 5,
    maxRadius: 5,
    factory: bambooGrove,
  },
  palm: {
    id: 'palm',
    name: '椰棕',
    variants: PALM_VARIANTS.length,
    variantInfo: PALM_VARIANTS.map((v) => ({ name: v.name, scale: 'mature' })),
    minHeight: 7,
    maxHeight: 13,
    allowedBiomes: [BiomeId.Tropical, BiomeId.Beach, BiomeId.Riverside],
    minSpacing: 4,
    maxRadius: 6,
    factory: palm,
  },
  birch: {
    id: 'birch',
    name: '白桦',
    variants: BIRCH_VARIANTS.length,
    variantInfo: BIRCH_VARIANTS.map((v) => ({ name: v.name, scale: 'mature' })),
    minHeight: 9,
    maxHeight: 14,
    allowedBiomes: [BiomeId.Taiga, BiomeId.Hillside, BiomeId.Mountain, BiomeId.Plain],
    minSpacing: 3,
    maxRadius: 5,
    factory: birch,
  },
}

export const TREE_TYPES = Object.keys(TREES) as TreeType[]
/** 任何树冠离树根的最大水平距离：区块生成时据此向外取样候选树 */
export const MAX_TREE_RADIUS = Math.max(...Object.values(TREES).map((t) => t.maxRadius))

/** 每种树 × 变体 × 高度 × 形态种子 只生成一次（再按 4 个朝向旋转缓存） */
export class TreeCache {
  private readonly cache = new Map<string, VoxelStructure>()
  static readonly SEED_SLOTS = 6

  get(type: TreeType, variant: number, height: number, slot: number, rotation: number): VoxelStructure {
    const k = `${type}:${variant}:${height}:${slot}:${rotation}`
    let s = this.cache.get(k)
    if (!s) {
      if (rotation) s = this.get(type, variant, height, slot, 0).rotate(rotation)
      else s = clampRadius(TREES[type].factory({ variant, seed: (slot + 1) * 7919 + variant * 131 + height * 17 + type.length * 3, height }), TREES[type].maxRadius)
      if (this.cache.size > 2000) this.cache.clear()
      this.cache.set(k, s)
    }
    return s
  }
}

/** 冠幅（结构水平包围半径） */
export function crownRadius(s: VoxelStructure): number {
  let r = 0
  for (const b of s.blocks) r = Math.max(r, Math.hypot(b.x, b.z))
  return r
}


/** 硬性保证：树冠不超出定义的半径（跨区块取样范围依赖它），超出的方块删去后再剔除悬空部分 */
function clampRadius(s: VoxelStructure, R: number): VoxelStructure {
  let cut = false
  for (const b of s.blocks)
    if (Math.max(Math.abs(b.x), Math.abs(b.z)) > R) {
      s.set(b.x, b.y, b.z, 0)
      cut = true
    }
  return cut ? pruneFloating(s) : s
}
