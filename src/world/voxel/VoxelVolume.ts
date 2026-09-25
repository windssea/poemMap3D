import type { PackedState } from '../block/BlockState'
import { WORLD_HEIGHT } from '../coordinate/constants'

/**
 * 一块连续的方块体（带 1 格外边），是生成器写入、mesher 读取的共同格式。
 * 区块生成时直接生成「区块 + 外边一圈」，mesher 不必再向邻居区块要数据，
 * 且由于生成是世界坐标的纯函数，外边与邻居区块的内部完全一致。
 */
export class VoxelVolume {
  readonly sx: number
  readonly sy: number
  readonly sz: number
  /** 体素 (0,0,0) 对应的世界方块坐标 */
  readonly ox: number
  readonly oy: number
  readonly oz: number
  readonly data: Uint16Array
  /** 每列的生物群系（sx × sz），供染色 */
  readonly biome: Uint8Array

  constructor(ox: number, oy: number, oz: number, sx: number, sy: number, sz: number, data?: Uint16Array, biome?: Uint8Array) {
    this.ox = ox
    this.oy = oy
    this.oz = oz
    this.sx = sx
    this.sy = sy
    this.sz = sz
    this.data = data ?? new Uint16Array(sx * sy * sz)
    this.biome = biome ?? new Uint8Array(sx * sz)
  }

  /** 世界坐标取方块；越界：世界底部以下视为实心岩（不出底面），其余为空气 */
  get(x: number, y: number, z: number): PackedState {
    const lx = x - this.ox
    const ly = y - this.oy
    const lz = z - this.oz
    if (lx < 0 || lz < 0 || lx >= this.sx || lz >= this.sz) return 0
    if (ly < 0) return y < 0 ? 1 : 0
    if (ly >= this.sy) return 0
    return this.data[(ly * this.sz + lz) * this.sx + lx]
  }

  set(x: number, y: number, z: number, s: PackedState): void {
    const lx = x - this.ox
    const ly = y - this.oy
    const lz = z - this.oz
    if (lx < 0 || lz < 0 || ly < 0 || lx >= this.sx || lz >= this.sz || ly >= this.sy) return
    this.data[(ly * this.sz + lz) * this.sx + lx] = s
  }

  contains(x: number, y: number, z: number): boolean {
    const lx = x - this.ox
    const ly = y - this.oy
    const lz = z - this.oz
    return lx >= 0 && lz >= 0 && ly >= 0 && lx < this.sx && lz < this.sz && ly < this.sy
  }

  containsColumn(x: number, z: number): boolean {
    const lx = x - this.ox
    const lz = z - this.oz
    return lx >= 0 && lz >= 0 && lx < this.sx && lz < this.sz
  }

  biomeAt(x: number, z: number): number {
    const lx = Math.min(this.sx - 1, Math.max(0, x - this.ox))
    const lz = Math.min(this.sz - 1, Math.max(0, z - this.oz))
    return this.biome[lz * this.sx + lx]
  }

  static forChunk(cx: number, cz: number, pad = 1): VoxelVolume {
    return new VoxelVolume(cx * 16 - pad, 0, cz * 16 - pad, 16 + pad * 2, WORLD_HEIGHT, 16 + pad * 2)
  }
}
