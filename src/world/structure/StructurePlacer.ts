import { BlockRenderLayer, BlockShape } from '../block/BlockDefinition'
import type { BlockRegistry } from '../block/BlockRegistry'
import { Blocks } from '../block/Blocks'
import type { PackedState } from '../block/BlockState'
import type { VoxelVolume } from '../voxel/VoxelVolume'
import type { Bounds3, StructureBlock, VoxelStructure } from './VoxelStructure'

export const PlaceMode = {
  /** 覆盖一切（建筑） */
  Replace: 0,
  /** 只放在空气、水草等可替换位置（树） */
  Soft: 1,
} as const
export type PlaceMode = (typeof PlaceMode)[keyof typeof PlaceMode]

/** 一次放置：结构已旋转 / 镜像完毕，锚点落在世界方块坐标 (x, y, z) */
export interface StructurePlacement {
  id: string
  structure: VoxelStructure
  x: number
  y: number
  z: number
  mode: PlaceMode
  /** 底层下方一直填到地面的地基方块（0 为不填） */
  foundation?: PackedState
  /** 清掉占地范围内锚点以上这么高的地形（建在坡上时削平） */
  clearHeight?: number
  /** 排序键：保证跨区块放置顺序一致 */
  order: number
}

/** 预处理后的放置（世界包围盒 + 扁平方块表） */
export interface PreparedPlacement extends StructurePlacement {
  world: Bounds3
  blocks: StructureBlock[]
  /** 底层轮廓（相对坐标） */
  base: { x: number; z: number }[]
  minY: number
}

export function preparePlacement(p: StructurePlacement): PreparedPlacement {
  const b = p.structure.bounds()
  const blocks = p.structure.blocks
  const baseSet = new Map<number, { x: number; z: number }>()
  for (const s of blocks) baseSet.set(((s.x + 512) << 10) | (s.z + 512), { x: s.x, z: s.z })
  return {
    ...p,
    blocks,
    base: [...baseSet.values()],
    minY: b.minY,
    world: { minX: p.x + b.minX, minY: p.y + b.minY, minZ: p.z + b.minZ, maxX: p.x + b.maxX, maxY: p.y + b.maxY, maxZ: p.z + b.maxZ },
  }
}

export const intersectsVolume = (p: PreparedPlacement, v: VoxelVolume): boolean =>
  p.world.maxX >= v.ox && p.world.minX < v.ox + v.sx && p.world.maxZ >= v.oz && p.world.minZ < v.oz + v.sz

/**
 * 把结构写入体素（按体素边界裁剪）。
 * 由于只按世界坐标写入、且放置顺序由 order 决定，同一结构被相邻区块各写一部分时结果严丝合缝。
 */
export function placeStructure(vol: VoxelVolume, p: PreparedPlacement, reg: BlockRegistry = Blocks): number {
  let written = 0
  if (p.clearHeight) {
    const top = p.y + p.minY + p.clearHeight
    for (const c of p.base) {
      const x = p.x + c.x
      const z = p.z + c.z
      if (!vol.containsColumn(x, z)) continue
      for (let y = p.y + p.minY; y <= top; y++) vol.set(x, y, z, 0)
    }
  }
  if (p.foundation) {
    for (const c of p.base) {
      const x = p.x + c.x
      const z = p.z + c.z
      if (!vol.containsColumn(x, z)) continue
      for (let y = p.y + p.minY - 1; y > 0; y--) {
        const id = vol.get(x, y, z) & 255
        if (id && !reg.replaceable[id] && !reg.liquid[id]) break
        vol.set(x, y, z, p.foundation)
      }
    }
  }
  for (const b of p.blocks) {
    const x = p.x + b.x
    const y = p.y + b.y
    const z = p.z + b.z
    if (!vol.contains(x, y, z)) continue
    if (p.mode === PlaceMode.Soft) {
      const cur = vol.get(x, y, z) & 255
      // 树干、枝可以穿过邻树的叶团（否则后种的树会被前一棵的树冠截断而悬空）
      const leavesUnderLog = reg.layer[cur] === BlockRenderLayer.Cutout && reg.shape[cur] === BlockShape.FULL_CUBE && reg.opaque[b.state & 255] === 1
      if (cur && !reg.replaceable[cur] && !leavesUnderLog) continue
    }
    vol.set(x, y, z, b.state)
    written++
  }
  return written
}
