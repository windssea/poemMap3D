import type { BlockRegistry } from '../block/BlockRegistry'
import { BlockShape } from '../block/BlockDefinition'
import type { VoxelVolume } from '../voxel/VoxelVolume'

/**
 * 体素块的天空光（0–15），网格化时按顶点取用，只乘间接光：檐下、殿内、廊下、城门洞、山洞里天光渐弱。
 *
 * 只有挡光的方块挡天：不透明整块、半砖、楼梯（屋面、檐口都由半砖和楼梯砌成）。树叶、水、窗格、栏杆、草都透光，
 * 也不额外吸收——林下、水底的明暗已有阴影与水色负责；而且远景（2×2 合并）、远景片没有这些细物，
 * 若近景按树冠压暗，镜头推进时会在林子里起一圈亮度台阶。
 *
 * 做法（类 Minecraft）：每列从顶向下，未遇挡光方块前都是 15；再从「旁边一列在这个高度被挡住」的格子出发，
 * 向六个方向逐格减 step 漫开。step 为每格代表的方块数（近景 1、远景 2、远景片 4），远近同一处的明暗大致一样。
 *
 * 只在体块（区块 + 外边）内传播：大殿横跨区块边界时，两边各自只看得到自己这侧加一格外边，边上可能差一两级；
 * 顶点取四格平均后差别很小。
 */
const blockingCache = new WeakMap<BlockRegistry, Uint8Array>()

export function skyBlocking(reg: BlockRegistry): Uint8Array {
  let t = blockingCache.get(reg)
  if (!t) {
    t = new Uint8Array(reg.shape.length)
    for (let id = 1; id < t.length; id++) {
      const sh = reg.shape[id]
      t[id] = reg.occludes[id] || sh === BlockShape.SLAB || sh === BlockShape.STAIRS ? 1 : 0
    }
    blockingCache.set(reg, t)
  }
  return t
}

/**
 * 计算 [yLo, yHi] 高度段的天空光，下标与 vol.data 相同。段外：高于 yHi 视为 15，低于 yLo 视为 0（由取用方处理）。
 */
export function volumeSkyLight(vol: VoxelVolume, reg: BlockRegistry, yLo: number, yHi: number, step = 1): Uint8Array {
  const { sx, sz, data } = vol
  const blocks = skyBlocking(reg)
  const L = new Uint8Array(data.length)
  const plane = sx * sz
  /* 1. 每列自顶向下：未遇挡光方块前全亮。bottom 记下这一列最低的全亮格 */
  const bottom = new Int16Array(plane)
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      let y = yHi
      for (; y >= yLo; y--) {
        const i = (y * sz + z) * sx + x
        if (blocks[data[i] & 255]) break
        L[i] = 15
      }
      bottom[z * sx + x] = y + 1
    }
  /* 2. 种子：旁边一列在这个高度已被挡住（檐口下、墙根边、洞口）的全亮格 */
  let queue = new Int32Array(4096)
  let qn = 0
  const push = (i: number) => {
    if (qn === queue.length) {
      const q = new Int32Array(queue.length * 2)
      q.set(queue)
      queue = q
    }
    queue[qn++] = i
  }
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const b = bottom[z * sx + x]
      let top = b - 1
      if (x > 0) top = Math.max(top, bottom[z * sx + x - 1] - 1)
      if (x < sx - 1) top = Math.max(top, bottom[z * sx + x + 1] - 1)
      if (z > 0) top = Math.max(top, bottom[(z - 1) * sx + x] - 1)
      if (z < sz - 1) top = Math.max(top, bottom[(z + 1) * sx + x] - 1)
      for (let y = b; y <= Math.min(top, yHi); y++) push((y * sz + z) * sx + x)
    }
  /* 3. 逐格漫开 */
  for (let qi = 0; qi < qn; qi++) {
    const i = queue[qi]
    const nv = L[i] - step
    if (nv <= 0) continue
    const x = i % sx
    const t = (i - x) / sx
    const z = t % sz
    const y = (t - z) / sz
    const visit = (j: number) => {
      if (L[j] >= nv || blocks[data[j] & 255]) return
      L[j] = nv
      push(j)
    }
    if (x > 0) visit(i - 1)
    if (x < sx - 1) visit(i + 1)
    if (z > 0) visit(i - sx)
    if (z < sz - 1) visit(i + sx)
    if (y > yLo) visit(i - plane)
    if (y < yHi) visit(i + plane)
  }
  return L
}
