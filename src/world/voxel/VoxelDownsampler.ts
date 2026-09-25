import { BlockRenderLayer, BlockShape } from '../block/BlockDefinition'
import type { BlockRegistry } from '../block/BlockRegistry'
import { B, Blocks } from '../block/Blocks'
import { S } from '../block/BlockState'
import { VoxelVolume } from './VoxelVolume'

/** 非整块 → 远看时的整块替身（屋面楼梯 → 瓦整块、半砖 → 同料整块、柱 → 漆墙……） */
const FULL_OF: Record<number, number> = {
  [B.ROOF_GRAY_STAIRS]: B.ROOF_GRAY,
  [B.ROOF_GRAY_SLAB]: B.ROOF_GRAY,
  [B.ROOF_YELLOW_STAIRS]: B.ROOF_YELLOW,
  [B.ROOF_YELLOW_SLAB]: B.ROOF_YELLOW,
  [B.ROOF_GREEN_STAIRS]: B.ROOF_GREEN,
  [B.ROOF_GREEN_SLAB]: B.ROOF_GREEN,
  [B.THATCH_STAIRS]: B.THATCH,
  [B.THATCH_SLAB]: B.THATCH,
  [B.STONE_BRICK_SLAB]: B.STONE_BRICK,
  [B.STONE_BRICK_STAIRS]: B.STONE_BRICK,
  [B.CITY_BRICK_SLAB]: B.CITY_BRICK,
  [B.MARBLE_SLAB]: B.MARBLE,
  [B.MARBLE_STAIRS]: B.MARBLE,
  [B.PLANKS_SLAB]: B.PLANKS,
  [B.PLANKS_STAIRS]: B.PLANKS,
  [B.DARK_PLANKS_SLAB]: B.DARK_PLANKS,
  [B.DARK_PLANKS_STAIRS]: B.DARK_PLANKS,
  [B.PAVING_SLAB]: B.PAVING,
  [B.PILLAR]: B.LACQUER,
  [B.DARK_POST]: B.DARK_PLANKS,
  [B.RIDGE_END]: B.ROOF_GRAY,
  [B.LATTICE_WINDOW]: B.LATTICE_WINDOW,
  [B.BAMBOO]: B.BAMBOO_LEAVES,
  [B.WILLOW_STRAND]: B.LEAVES_WILLOW,
}

/**
 * 远景 LOD：每 2×2×2 个方块合成一个大方块（与 Minecraft 远景模组同一思路）。
 * 同一份生成结果，只是分辨率减半——地形、树、建筑、江河都还在，远近不再是两套东西。
 *
 * 取块规则：
 *  - 实心（含非整块的整块替身）≥ 3：取上层实心里最多的那种（地表草皮在上）；
 *  - 否则树叶 ≥ 2：取最多的树叶；
 *  - 否则液体 ≥ 3：水；
 *  - 其余为空气（草、花、栏杆等细碎物远看不画）。
 * 输入体素需带 2 格外边，输出带 1 格（远景单位）外边。
 */
/** 远看时的整块替身：整块原样，非整块查表，细碎物为 0 */
export function fullCubeOf(id: number, reg: BlockRegistry = Blocks): number {
  if (!id) return 0
  if (reg.shape[id] === BlockShape.FULL_CUBE && reg.layer[id] !== BlockRenderLayer.Cutout) return id
  return FULL_OF[id] ?? 0
}

/** 是否树叶类（整块、镂空层） */
export const isLeafBlock = (id: number, reg: BlockRegistry = Blocks): boolean => reg.shape[id] === BlockShape.FULL_CUBE && reg.layer[id] === BlockRenderLayer.Cutout

export function downsample2(vol: VoxelVolume, reg: BlockRegistry = Blocks): VoxelVolume {
  const ox = vol.ox / 2
  const oz = vol.oz / 2
  const sx = vol.sx / 2
  const sz = vol.sz / 2
  const sy = vol.sy / 2
  const out = new VoxelVolume(ox, vol.oy / 2, oz, sx, sy, sz)
  const counts = new Map<number, number>()
  const solidOf = (id: number): number => {
    if (!id) return 0
    const shape = reg.shape[id]
    if (shape === BlockShape.FULL_CUBE && reg.layer[id] !== BlockRenderLayer.Cutout) return id
    return FULL_OF[id] ?? 0
  }
  const isLeaves = (id: number) => reg.shape[id] === BlockShape.FULL_CUBE && reg.layer[id] === BlockRenderLayer.Cutout
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      out.tint[z * sx + x] = vol.tint[z * 2 * vol.sx + x * 2]
      out.biome[z * sx + x] = vol.biome[z * 2 * vol.sx + x * 2]
      for (let y = 0; y < sy; y++) {
        let solid = 0
        let upper = 0
        let leaves = 0
        let liquid = 0
        let bestUpper = 0
        let bestUpperN = 0
        let bestLower = 0
        let bestLowerN = 0
        let bestLeaf = 0
        counts.clear()
        for (let dy = 1; dy >= 0; dy--)
          for (let dz = 0; dz < 2; dz++)
            for (let dx = 0; dx < 2; dx++) {
              const id = vol.data[((y * 2 + dy) * vol.sz + z * 2 + dz) * vol.sx + x * 2 + dx] & 255
              if (!id) continue
              const s = solidOf(id)
              if (s) {
                solid++
                const key = s + dy * 1000
                const n = (counts.get(key) ?? 0) + 1
                counts.set(key, n)
                if (dy) {
                  upper++
                  if (n > bestUpperN) {
                    bestUpperN = n
                    bestUpper = s
                  }
                } else if (n > bestLowerN) {
                  bestLowerN = n
                  bestLower = s
                }
              } else if (isLeaves(id)) {
                leaves++
                bestLeaf = id
              } else if (reg.liquid[id]) liquid++
            }
        let st = 0
        if (solid >= 3) st = S(upper >= 2 ? bestUpper : bestLower || bestUpper)
        else if (solid + leaves >= 3 && leaves >= 2) st = S(bestLeaf)
        else if (liquid >= 3) st = S(B.WATER)
        else if (solid >= 2 && liquid >= 2) st = S(bestLower || bestUpper)
        if (st) out.data[(y * sz + z) * sx + x] = st
      }
    }
  return out
}
