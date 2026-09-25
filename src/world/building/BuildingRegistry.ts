import type { VoxelStructure } from '../structure/VoxelStructure'
import {
  archBridge,
  type BuildingParams,
  brickPagoda,
  gate,
  hall,
  house,
  hut,
  lamp,
  pagoda,
  pavilion,
  stupa,
  terrace,
  tower,
  wallSegment,
} from './BuildingFactory'

export type BuildingId = 'lamp' | 'house' | 'hall' | 'pavilion' | 'pagoda' | 'brickPagoda' | 'gate' | 'wall' | 'tower' | 'bridge' | 'stupa' | 'terrace' | 'hut'

export interface BuildingDefinition {
  id: BuildingId
  name: string
  /** 入口：正面留通道 / 前后都留（城门）/ 不留（墙、桥、台） */
  entrance: 'front' | 'both' | 'none'
  /** 放置时底层以下用什么填到地面 */
  foundation: 'stone' | 'none'
  build: (p: BuildingParams) => VoxelStructure
}

const defs: BuildingDefinition[] = [
  { id: 'lamp', name: '街灯', entrance: 'none', foundation: 'stone', build: lamp },
  { id: 'house', name: '民居', entrance: 'front', foundation: 'stone', build: house },
  { id: 'hut', name: '茅舍', entrance: 'front', foundation: 'stone', build: hut },
  { id: 'hall', name: '殿', entrance: 'front', foundation: 'stone', build: hall },
  { id: 'pavilion', name: '亭', entrance: 'front', foundation: 'stone', build: pavilion },
  { id: 'pagoda', name: '塔', entrance: 'front', foundation: 'stone', build: pagoda },
  { id: 'brickPagoda', name: '砖塔', entrance: 'both', foundation: 'stone', build: brickPagoda },
  { id: 'gate', name: '城门', entrance: 'both', foundation: 'stone', build: gate },
  { id: 'wall', name: '城墙', entrance: 'none', foundation: 'stone', build: wallSegment },
  { id: 'tower', name: '楼阁', entrance: 'front', foundation: 'stone', build: tower },
  { id: 'bridge', name: '拱桥', entrance: 'none', foundation: 'none', build: archBridge },
  { id: 'stupa', name: '白塔', entrance: 'none', foundation: 'stone', build: stupa },
  { id: 'terrace', name: '台基', entrance: 'front', foundation: 'stone', build: terrace },
]

/** 数据驱动的建筑注册表：新增建筑只需加一条定义 */
export const BuildingRegistry = new Map<BuildingId, BuildingDefinition>(defs.map((d) => [d.id, d]))

const cache = new Map<string, VoxelStructure>()

/** 按 id + 参数构建（同参数只构建一次） */
export function buildBuilding(id: BuildingId, p: BuildingParams = {}): VoxelStructure {
  const k = `${id}:${JSON.stringify(p)}`
  let s = cache.get(k)
  if (!s) {
    s = BuildingRegistry.get(id)!.build(p)
    s.name = id
    cache.set(k, s)
  }
  return s
}
