import type { PlaceAnchor } from '../landmark/LandmarkDefinition'
import { LandmarkRegistry } from '../landmark/LandmarkRegistry'
import { TerrainManager } from '../terrain/TerrainManager'
import { TreePlacementSystem } from '../vegetation/TreePlacementSystem'
import { LakeManager } from '../water/LakeManager'
import { RiverManager } from '../water/RiverManager'
import { WorldConfig } from '../WorldConfig'
import { type MacroGridData, MacroSampler } from './geography/MacroGeography'
import { ChunkGenerator } from './WorldGenerator'

export interface WorldInit {
  macro: MacroGridData
  anchors: PlaceAnchor[]
  seed?: number
}

/**
 * 一份完整的世界生成上下文（纯数据 + 纯函数）。
 * 主线程与每个生成 Worker 各持一份：宏观网格由第一个 Worker 算好后复制分发，其余部分各自确定地重建。
 */
export class WorldContext {
  readonly seed: number
  readonly macro: MacroSampler
  readonly rivers: RiverManager
  readonly lakes: LakeManager
  readonly terrain: TerrainManager
  readonly landmarks: LandmarkRegistry
  readonly trees: TreePlacementSystem
  readonly chunks: ChunkGenerator

  constructor(init: WorldInit) {
    this.seed = init.seed ?? WorldConfig.seed
    this.macro = new MacroSampler(init.macro)
    this.rivers = new RiverManager(this.macro)
    this.lakes = new LakeManager(this.macro)
    const base = new TerrainManager(this.macro, this.rivers, this.lakes, [], this.seed)
    this.landmarks = new LandmarkRegistry(init.anchors, base)
    this.terrain = new TerrainManager(this.macro, this.rivers, this.lakes, this.landmarks.modifiers, this.seed)
    this.landmarks.resolve(this.terrain)
    this.trees = new TreePlacementSystem((x, z) => this.terrain.sample(x, z), this.landmarks.occupancy, (i) => this.landmarks.profileOf(i), this.seed)
    this.chunks = new ChunkGenerator(this.terrain, this.landmarks, this.trees, this.seed)
  }
}
