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
  /** 底层轮廓（相对坐标）；y 为这一列最低方块的相对高度（城门券洞里铺地比墙身低一格，各列不同） */
  base: { x: number; z: number; y: number }[]
  minY: number
}

export function preparePlacement(p: StructurePlacement): PreparedPlacement {
  const b = p.structure.bounds()
  const blocks = p.structure.blocks
  const baseSet = new Map<number, { x: number; z: number; y: number }>()
  for (const s of blocks) {
    const k = ((s.x + 512) << 10) | (s.z + 512)
    const c = baseSet.get(k)
    if (!c) baseSet.set(k, { x: s.x, z: s.z, y: s.y })
    else if (s.y < c.y) c.y = s.y
  }
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
  // 清空与地基按每一列自己的落地高度算：按整座的最低点算，最低点以上、本列最低块以下那一格地面被清掉、地基又从更低处起砌，
  // 城门墙身、牌坊柱脚下就悬出一道空缝。只有贴地的列（最低块离整座最低点不超过一格）这样算；
  // 檐口、挑台这些悬在半空的列，地基仍按整座最低点——否则地基会从檐口一路砌到地面，檐下立起一排石柱
  const foot = (cy: number) => (cy - p.minY <= 1 ? cy : p.minY)
  if (p.clearHeight) {
    const top = p.y + p.minY + p.clearHeight
    for (const c of p.base) {
      const x = p.x + c.x
      const z = p.z + c.z
      if (!vol.containsColumn(x, z)) continue
      // 悬空列只从自己最低块往上清：檐口下的地面、邻接的城墙不动（门楼檐口压在城墙端头上，从地面清起会把墙头削掉）
      for (let y = p.y + c.y; y <= top; y++) vol.set(x, y, z, 0)
    }
  }
  if (p.foundation) {
    for (const c of p.base) {
      const x = p.x + c.x
      const z = p.z + c.z
      if (!vol.containsColumn(x, z)) continue
      for (let y = p.y + foot(c.y) - 1; y > 0; y--) {
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
