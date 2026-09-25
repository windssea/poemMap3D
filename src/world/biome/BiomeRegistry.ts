import { B } from '../block/Blocks'
import type { BlockId } from '../block/BlockState'
import { BIOME_KEYS, BiomeId, type BiomeKey } from './BiomeId'

export type TreeType = 'broadleaf' | 'pine' | 'willow' | 'peach' | 'bamboo'

export interface BiomeDefinition {
  id: BiomeId
  key: BiomeKey
  surface: { top: BlockId; soil: BlockId; rock: BlockId; soilDepth: number }
  /** 树种权重 */
  trees: Partial<Record<TreeType, number>>
  /**
   * 景观空间配额：密林 / 疏林 / 留白（和为 1）。
   * 每处按低频噪声（经分位表均匀化）归入其一，留白处不栽乔木。
   */
  space: { dense: number; sparse: number; open: number }
  /** 每 100 列期望株数：[密林, 疏林] */
  density: [number, number]
  /** 地被：草簇、花、卵石的概率（每列） */
  ground: { grass: number; flower: number; pebble: number; reed: number }
}

const def = (d: Omit<BiomeDefinition, 'key'>): BiomeDefinition => ({ ...d, key: BIOME_KEYS[d.id] })

/** Biome 决定地表方块、树种、植被密度、地被 */
export const BIOMES: readonly BiomeDefinition[] = [
  def({ id: BiomeId.Ocean, surface: { top: B.SAND, soil: B.SAND, rock: B.STONE, soilDepth: 2 }, trees: {}, space: { dense: 0, sparse: 0, open: 1 }, density: [0, 0], ground: { grass: 0, flower: 0, pebble: 0, reed: 0 } }),
  def({ id: BiomeId.Beach, surface: { top: B.SAND, soil: B.SAND, rock: B.STONE, soilDepth: 3 }, trees: { broadleaf: 1 }, space: { dense: 0, sparse: 0.2, open: 0.8 }, density: [0, 0.5], ground: { grass: 0.03, flower: 0, pebble: 0.02, reed: 0 } }),
  def({ id: BiomeId.Plain, surface: { top: B.GRASS, soil: B.DIRT, rock: B.STONE, soilDepth: 4 }, trees: { broadleaf: 6, willow: 1, peach: 0.6, bamboo: 0.5 }, space: { dense: 0.12, sparse: 0.23, open: 0.65 }, density: [5, 0.9], ground: { grass: 0.16, flower: 0.025, pebble: 0.002, reed: 0 } }),
  def({ id: BiomeId.Hillside, surface: { top: B.GRASS, soil: B.DIRT, rock: B.STONE, soilDepth: 3 }, trees: { pine: 4, broadleaf: 4, bamboo: 0.6 }, space: { dense: 0.3, sparse: 0.4, open: 0.3 }, density: [6, 1.3], ground: { grass: 0.12, flower: 0.012, pebble: 0.004, reed: 0 } }),
  def({ id: BiomeId.Mountain, surface: { top: B.GRASS, soil: B.DIRT, rock: B.ROCK, soilDepth: 2 }, trees: { pine: 8, broadleaf: 1.5 }, space: { dense: 0.45, sparse: 0.3, open: 0.25 }, density: [6.5, 1.5], ground: { grass: 0.08, flower: 0.004, pebble: 0.01, reed: 0 } }),
  def({ id: BiomeId.Riverside, surface: { top: B.GRASS, soil: B.DIRT, rock: B.STONE, soilDepth: 4 }, trees: { willow: 7, bamboo: 1, peach: 1, broadleaf: 1 }, space: { dense: 0.15, sparse: 0.55, open: 0.3 }, density: [6, 1.8], ground: { grass: 0.2, flower: 0.02, pebble: 0.02, reed: 0.1 } }),
  def({ id: BiomeId.Wetland, surface: { top: B.GRASS, soil: B.MUD, rock: B.STONE, soilDepth: 4 }, trees: { willow: 5, broadleaf: 1 }, space: { dense: 0.1, sparse: 0.4, open: 0.5 }, density: [4, 1], ground: { grass: 0.3, flower: 0.01, pebble: 0.003, reed: 0.18 } }),
  def({ id: BiomeId.Garden, surface: { top: B.GRASS, soil: B.DIRT, rock: B.STONE, soilDepth: 4 }, trees: { peach: 4, bamboo: 3, willow: 3, broadleaf: 1 }, space: { dense: 0.2, sparse: 0.5, open: 0.3 }, density: [4, 1.5], ground: { grass: 0.14, flower: 0.06, pebble: 0.01, reed: 0.05 } }),
  def({ id: BiomeId.Plateau, surface: { top: B.GRASS, soil: B.GRAVEL, rock: B.ROCK, soilDepth: 1 }, trees: { pine: 1 }, space: { dense: 0.02, sparse: 0.18, open: 0.8 }, density: [2, 0.25], ground: { grass: 0.06, flower: 0.01, pebble: 0.015, reed: 0 } }),
  def({ id: BiomeId.Steppe, surface: { top: B.GRASS, soil: B.DIRT, rock: B.STONE, soilDepth: 3 }, trees: { broadleaf: 1 }, space: { dense: 0, sparse: 0.08, open: 0.92 }, density: [0, 0.2], ground: { grass: 0.22, flower: 0.02, pebble: 0.003, reed: 0 } }),
  def({ id: BiomeId.Desert, surface: { top: B.DESERT_SAND, soil: B.DESERT_SAND, rock: B.STONE, soilDepth: 5 }, trees: {}, space: { dense: 0, sparse: 0, open: 1 }, density: [0, 0], ground: { grass: 0.004, flower: 0, pebble: 0.004, reed: 0 } }),
  def({ id: BiomeId.Gobi, surface: { top: B.GOBI, soil: B.GRAVEL, rock: B.STONE, soilDepth: 2 }, trees: {}, space: { dense: 0, sparse: 0, open: 1 }, density: [0, 0], ground: { grass: 0.01, flower: 0, pebble: 0.03, reed: 0 } }),
  def({ id: BiomeId.Cliff, surface: { top: B.ROCK, soil: B.ROCK, rock: B.ROCK, soilDepth: 0 }, trees: { pine: 1 }, space: { dense: 0, sparse: 0.25, open: 0.75 }, density: [0, 0.6], ground: { grass: 0.02, flower: 0, pebble: 0.01, reed: 0 } }),
  def({ id: BiomeId.Snow, surface: { top: B.SNOW_GRASS, soil: B.ROCK, rock: B.ROCK, soilDepth: 1 }, trees: {}, space: { dense: 0, sparse: 0, open: 1 }, density: [0, 0], ground: { grass: 0, flower: 0, pebble: 0, reed: 0 } }),
]

export const biomeDef = (id: number): BiomeDefinition => BIOMES[id]
