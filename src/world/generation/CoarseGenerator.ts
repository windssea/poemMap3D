import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../coordinate/constants'
import type { LandmarkRegistry } from '../landmark/LandmarkRegistry'
import type { StructureBlock } from '../structure/VoxelStructure'
import type { TerrainManager } from '../terrain/TerrainManager'
import type { TreePlacementSystem } from '../vegetation/TreePlacementSystem'
import { MAX_TREE_RADIUS } from '../vegetation/TreeRegistry'
import { fullCubeOf, isLeafBlock } from '../voxel/VoxelDownsampler'
import { VoxelVolume } from '../voxel/VoxelVolume'

/** 远景第三级：一片 = 4×4 区块（64 方块见方），每格 4×4×4 方块 */
export const REGION_CHUNKS = 4
export const COARSE_CELL = 4
const N = (REGION_CHUNKS * CHUNK_SIZE) / COARSE_CELL
const SPAN = REGION_CHUNKS * CHUNK_SIZE

/**
 * 远景片：不生成整块方块体，只每 4 方块取一列地形（开销约为原分辨率的 1/16），
 * 树与建筑按方块逐个落进 4×4×4 的格子计数，够多的格子才成块——远看仍是同一片山水、同一片林子与城池，
 * 只是颗粒更粗。输出带 1 格（远景单位）外边，mesher 直接可用。
 */
export function generateCoarseRegion(terrain: TerrainManager, landmarks: LandmarkRegistry, trees: TreePlacementSystem, rx: number, rz: number): { volume: VoxelVolume; trees: number; structures: number } {
  const C = COARSE_CELL
  const W = N + 2
  const SY = WORLD_HEIGHT / C
  const vol = new VoxelVolume(rx * N - 1, 0, rz * N - 1, W, SY, W)
  const x0 = rx * SPAN
  const z0 = rz * SPAN
  const { samples } = terrain.lattice(x0 - C, z0 - C, W, C)
  const stride = W * W

  /* 地形：顶格取地表，下一格土，再下为岩；水面按格取整，细江细河至少占一格 */
  for (let j = 0; j < W; j++)
    for (let i = 0; i < W; i++) {
      const s = samples[j * W + i]
      const col = j * W + i
      vol.tint[col] = s.tintZone
      vol.biome[col] = s.biome
      const top = Math.max(0, Math.round((s.surfaceY + 1) / C) - 1)
      const ts = S(s.topBlock)
      const ss = S(s.soilBlock)
      const rs = S(s.rockBlock)
      for (let y = 0; y <= top; y++) vol.data[y * stride + col] = y === top ? ts : y === top - 1 ? ss : rs
      if (s.waterY > s.surfaceY) {
        const wt = Math.max(top, Math.round((s.waterY + 1) / C) - 1)
        for (let y = top; y <= wt; y++) vol.data[y * stride + col] = S(B.WATER)
      }
    }

  /* 树与建筑：逐方块落格计数 */
  const solid = new Uint8Array(stride * SY)
  const leaf = new Uint8Array(stride * SY)
  const sid = new Uint8Array(stride * SY)
  const lid = new Uint8Array(stride * SY)
  const bx0 = vol.ox * C
  const bz0 = vol.oz * C
  const stamp = (px: number, py: number, pz: number, blocks: readonly StructureBlock[]) => {
    for (const b of blocks) {
      const id = b.state & 255
      if (!id) continue
      const cx = ((px + b.x - bx0) / C) | 0
      const cz = ((pz + b.z - bz0) / C) | 0
      const y = py + b.y
      if (px + b.x < bx0 || pz + b.z < bz0 || cx >= W || cz >= W || y < 0 || y >= WORLD_HEIGHT) continue
      const k = ((y / C) | 0) * stride + cz * W + cx
      const f = fullCubeOf(id)
      if (f) {
        if (solid[k] < 255) solid[k]++
        // 屋面优先：远看城池就是一片瓦顶
        if (!sid[k] || (y & 3) >= 2) sid[k] = f
      } else if (isLeafBlock(id)) {
        if (leaf[k] < 255) leaf[k]++
        lid[k] = id
      }
    }
  }
  const X1 = x0 + SPAN + C
  const Z1 = z0 + SPAN + C
  const placements = landmarks.placementsNear(x0 - C, z0 - C, X1, Z1)
  for (const p of placements) stamp(p.x, p.y, p.z, p.blocks)
  const R = MAX_TREE_RADIUS
  const list = [...trees.collect(x0 - C - R, z0 - C - R, X1 + R, Z1 + R), ...landmarks.treesNear(x0 - C - R, z0 - C - R, X1 + R, Z1 + R)]
  for (const t of list) stamp(t.x, t.y, t.z, trees.cache.get(t.type, t.variant, t.height, t.slot, t.rotation).blocks)

  for (let k = 0; k < solid.length; k++) {
    if (solid[k] >= 10) vol.data[k] = S(sid[k])
    else if (leaf[k] + solid[k] >= 8 && leaf[k] >= 5 && !vol.data[k]) vol.data[k] = S(lid[k])
  }
  return { volume: vol, trees: list.length, structures: placements.length }
}
