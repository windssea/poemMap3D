import type { BlockRegistry } from '../block/BlockRegistry'
import { BlockShape } from '../block/BlockDefinition'
import { B } from '../block/Blocks'
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

/** 简单的可增长整数队列 */
class Queue {
  a = new Int32Array(4096)
  n = 0
  push(i: number): void {
    if (this.n === this.a.length) {
      const q = new Int32Array(this.a.length * 2)
      q.set(this.a)
      this.a = q
    }
    this.a[this.n++] = i
  }
}

/** 逐格漫开：每格减 step，挡光方块不进 */
function spread(L: Uint8Array, q: Queue, vol: VoxelVolume, blocks: Uint8Array, yLo: number, yHi: number, step: number): void {
  const { sx, sz, data } = vol
  const plane = sx * sz
  for (let qi = 0; qi < q.n; qi++) {
    const i = q.a[qi]
    const nv = L[i] - step
    if (nv <= 0) continue
    const x = i % sx
    const t = (i - x) / sx
    const z = t % sz
    const y = (t - z) / sz
    const visit = (j: number) => {
      if (L[j] >= nv || blocks[data[j] & 255]) return
      L[j] = nv
      q.push(j)
    }
    if (x > 0) visit(i - 1)
    if (x < sx - 1) visit(i + 1)
    if (z > 0) visit(i - sx)
    if (z < sz - 1) visit(i + sx)
    if (y > yLo) visit(i - plane)
    if (y < yHi) visit(i + plane)
  }
}

/** 发光方块的光级：灯笼照亮门前街面与檐下，格窗只把窗前一小片染暖 */
export function emissionLevel(id: number): number {
  if (id === B.LANTERN) return 13
  if (id === B.LATTICE_WINDOW) return 6
  return 0
}

/** 体外光源最远能照进来的距离（格）：最亮光源的光级 */
export const BLOCK_LIGHT_REACH = 13

/**
 * 方块光（0–15）：灯笼、格窗为源，逐格减 1 漫开，挡光方块不进。只给近景用。
 *
 * 体内的源直接从方块数据里找；体外的源（邻区块里离边界不远的灯笼）由 external 给出（世界坐标 x, y, z, 光级 四个一组，
 * 来自地标建筑的摆放表，与邻区块看到的是同一份），按曼哈顿距离注入到体块最外一圈，再在体内带遮挡地传播——
 * 两侧区块都这样算，边界两边接得上，夜里不会在区块边上起一道明暗缝。体外的遮挡看不见，按通透处理。
 * 没有任何光源时返回 null。
 */
export function volumeBlockLight(vol: VoxelVolume, reg: BlockRegistry, yLo: number, yHi: number, external?: Int32Array | null): Uint8Array | null {
  const { sx, sz, data, ox, oy, oz } = vol
  const blocks = skyBlocking(reg)
  const L = new Uint8Array(data.length)
  const q = new Queue()
  const seed = (i: number, v: number) => {
    if (v <= L[i]) return
    L[i] = v
    q.push(i)
  }
  for (let y = yLo; y <= yHi; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const i = (y * sz + z) * sx + x
        const e = emissionLevel(data[i] & 255)
        if (e > 0) seed(i, e)
      }
  if (external)
    for (let k = 0; k < external.length; k += 4) {
      const ex = external[k] - ox
      const ey = external[k + 1] - oy
      const ez = external[k + 2] - oz
      const e = external[k + 3]
      if (ex >= 0 && ez >= 0 && ex < sx && ez < sz) continue // 体内的源上面已经算过
      const y0 = Math.max(yLo, ey - e + 1)
      const y1 = Math.min(yHi, ey + e - 1)
      const edge = (x: number, z: number) => {
        const dxz = Math.abs(x - ex) + Math.abs(z - ez)
        if (dxz >= e) return
        for (let y = y0; y <= y1; y++) {
          const v = e - dxz - Math.abs(y - ey)
          if (v <= 0) continue
          const i = (y * sz + z) * sx + x
          if (!blocks[data[i] & 255]) seed(i, v)
        }
      }
      for (let x = 0; x < sx; x++) {
        edge(x, 0)
        edge(x, sz - 1)
      }
      for (let z = 1; z < sz - 1; z++) {
        edge(0, z)
        edge(sx - 1, z)
      }
    }
  if (!q.n) return null
  spread(L, q, vol, blocks, yLo, yHi, 1)
  return L
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
  const q = new Queue()
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const b = bottom[z * sx + x]
      let top = b - 1
      if (x > 0) top = Math.max(top, bottom[z * sx + x - 1] - 1)
      if (x < sx - 1) top = Math.max(top, bottom[z * sx + x + 1] - 1)
      if (z > 0) top = Math.max(top, bottom[(z - 1) * sx + x] - 1)
      if (z < sz - 1) top = Math.max(top, bottom[(z + 1) * sx + x] - 1)
      for (let y = b; y <= Math.min(top, yHi); y++) q.push((y * sz + z) * sx + x)
    }
  /* 3. 逐格漫开 */
  spread(L, q, vol, blocks, yLo, yHi, step)
  return L
}
