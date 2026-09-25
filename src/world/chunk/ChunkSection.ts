import type { PackedState } from '../block/BlockState'
import { CHUNK_SIZE, SECTION_VOLUME } from '../coordinate/constants'

export const sectionIndex = (lx: number, ly: number, lz: number): number => (ly * CHUNK_SIZE + lz) * CHUNK_SIZE + lx

/**
 * 16×16×16 的方块段。
 * 与 Minecraft 的调色板容器同一思路：整段同一种方块（全空气 / 全岩石）时不分配数组，只记一个值。
 */
export class ChunkSection {
  /** 整段统一的状态；blocks 存在时无意义 */
  uniform: PackedState
  blocks: Uint16Array | null

  constructor(uniform: PackedState = 0, blocks: Uint16Array | null = null) {
    this.uniform = uniform
    this.blocks = blocks
  }

  get(lx: number, ly: number, lz: number): PackedState {
    return this.blocks ? this.blocks[sectionIndex(lx, ly, lz)] : this.uniform
  }

  set(lx: number, ly: number, lz: number, state: PackedState): void {
    if (!this.blocks) {
      if (state === this.uniform) return
      this.blocks = new Uint16Array(SECTION_VOLUME).fill(this.uniform)
    }
    this.blocks[sectionIndex(lx, ly, lz)] = state
  }

  get isEmpty(): boolean {
    return !this.blocks && this.uniform === 0
  }

  /** 若整段相同则退回统一值，释放数组 */
  compact(): this {
    const b = this.blocks
    if (!b) return this
    const v = b[0]
    for (let i = 1; i < b.length; i++) if (b[i] !== v) return this
    this.blocks = null
    this.uniform = v
    return this
  }

  count(predicate: (s: PackedState) => boolean): number {
    if (!this.blocks) return predicate(this.uniform) ? SECTION_VOLUME : 0
    let n = 0
    for (let i = 0; i < this.blocks.length; i++) if (predicate(this.blocks[i])) n++
    return n
  }
}
