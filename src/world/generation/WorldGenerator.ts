import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import type { Chunk } from '../chunk/Chunk'
import type { LandmarkRegistry } from '../landmark/LandmarkRegistry'
import { placeStructure, PlaceMode, preparePlacement } from '../structure/StructurePlacer'
import type { TerrainManager } from '../terrain/TerrainManager'
import { decorateGround } from '../vegetation/GroundDecoration'
import type { TreeInstance, TreePlacementSystem } from '../vegetation/TreePlacementSystem'
import { MAX_TREE_RADIUS } from '../vegetation/TreeRegistry'
import { VoxelVolume } from '../voxel/VoxelVolume'
import { World } from '../World'
import { WorldConfig } from '../WorldConfig'

export interface ChunkGenerationResult {
  chunk: Chunk
  volume: VoxelVolume
  trees: number
  structures: number
  ms: number
}

/**
 * 区块生成流水线（纯函数，世界坐标决定一切）：
 *   Terrain Block Fill → Water Fill → Landmark Reservation / Structure Placement
 *   → Vegetation Decoration → Ground Decoration
 * 直接生成「区块 + 外边一圈」，外边与相邻区块内部完全一致，mesher 不必等待邻居。
 */
export class ChunkGenerator {
  constructor(
    private readonly terrain: TerrainManager,
    private readonly landmarks: LandmarkRegistry,
    private readonly trees: TreePlacementSystem,
    private readonly seed: number = WorldConfig.seed,
  ) {}

  generateVolume(cx: number, cz: number, pad = 1): { volume: VoxelVolume; trees: number; structures: number } {
    const vol = VoxelVolume.forChunk(cx, cz, pad)
    const region = this.terrain.region(vol.ox, vol.oz, vol.sx, vol.sz)

    /* 地形方块：岩层 → 土层 → 地表；其上注水 */
    for (let lz = 0; lz < vol.sz; lz++)
      for (let lx = 0; lx < vol.sx; lx++) {
        const s = region.samples[lz * vol.sx + lx]
        vol.biome[lz * vol.sx + lx] = s.biome
        const base = lx + lz * vol.sx
        const stride = vol.sx * vol.sz
        const top = S(s.topBlock)
        const soil = S(s.soilBlock)
        const rock = S(s.rockBlock)
        for (let y = 0; y <= s.surfaceY; y++) {
          const depth = s.surfaceY - y
          vol.data[y * stride + base] = depth === 0 ? top : depth <= s.soilDepth ? soil : y < 3 ? S(B.STONE) : rock
        }
        if (s.waterY > s.surfaceY) for (let y = s.surfaceY + 1; y <= s.waterY; y++) vol.data[y * stride + base] = S(B.WATER)
      }

    /* 地标建筑 */
    const x0 = vol.ox
    const z0 = vol.oz
    const x1 = vol.ox + vol.sx - 1
    const z1 = vol.oz + vol.sz - 1
    const placements = this.landmarks.placementsNear(x0, z0, x1, z1)
    for (const p of placements) placeStructure(vol, p)

    /* 树：树根在外扩范围内的都要考虑（树冠可能伸进来） */
    const R = MAX_TREE_RADIUS
    const list: TreeInstance[] = [...this.trees.collect(x0 - R, z0 - R, x1 + R, z1 + R), ...this.landmarks.treesNear(x0 - R, z0 - R, x1 + R, z1 + R)]
    list.sort((a, b) => a.order - b.order || a.x - b.x || a.z - b.z)
    let treeCount = 0
    for (const t of list) {
      const s = this.trees.cache.get(t.type, t.variant, t.height, t.slot, t.rotation)
      const p = preparePlacement({ id: 'tree', structure: s, x: t.x, y: t.y, z: t.z, mode: PlaceMode.Soft, order: t.order })
      if (p.world.maxX < x0 || p.world.minX > x1 || p.world.maxZ < z0 || p.world.minZ > z1) continue
      if (placeStructure(vol, p)) treeCount++
    }

    /* 地被 */
    decorateGround(vol, region, this.landmarks.occupancy, this.seed)
    return { volume: vol, trees: treeCount, structures: placements.length }
  }

  generate(cx: number, cz: number): ChunkGenerationResult {
    const t0 = performance.now()
    const g = this.generateVolume(cx, cz, 1)
    const chunk = World.chunkFromVolume(g.volume, cx, cz, 1)
    return { chunk, volume: g.volume, trees: g.trees, structures: g.structures, ms: performance.now() - t0 }
  }
}
