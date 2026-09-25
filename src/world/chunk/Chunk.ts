import type { PackedState } from '../block/BlockState'
import { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, WORLD_HEIGHT } from '../coordinate/constants'
import { chunkKey, columnIndex } from '../coordinate/coords'
import { ChunkSection } from './ChunkSection'

/**
 * 区块生命周期：
 * UNLOADED → REQUESTED → GENERATING → GENERATED → DECORATING → MESHING → READY → VISIBLE → DIRTY → REMESH
 */
export const ChunkState = {
  UNLOADED: 0,
  REQUESTED: 1,
  GENERATING: 2,
  GENERATED: 3,
  DECORATING: 4,
  MESHING: 5,
  READY: 6,
  VISIBLE: 7,
  DIRTY: 8,
  REMESH: 9,
} as const
export type ChunkState = (typeof ChunkState)[keyof typeof ChunkState]
export const CHUNK_STATE_NAMES = ['UNLOADED', 'REQUESTED', 'GENERATING', 'GENERATED', 'DECORATING', 'MESHING', 'READY', 'VISIBLE', 'DIRTY', 'REMESH'] as const

/** 可在 Worker 间传递的区块数据 */
export interface ChunkData {
  cx: number
  cz: number
  /** 每段：统一值或 4096 长数组 */
  sections: ({ uniform: number; blocks: Uint16Array | null } | null)[]
  heightmap: Uint16Array
  biomeMap: Uint8Array
  tintMap: Uint8Array
}

export class Chunk {
  readonly cx: number
  readonly cz: number
  readonly key: number
  /** 段号 → 段；缺省即全空气 */
  readonly sections = new Map<number, ChunkSection>()
  /** 每列最高的非空气方块 Y（无则 0） */
  readonly heightmap = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE)
  readonly biomeMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
  /** 每列的配色分区（网格重建时的草叶染色） */
  readonly tintMap = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE)
  state: ChunkState = ChunkState.UNLOADED

  constructor(cx: number, cz: number) {
    this.cx = cx
    this.cz = cz
    this.key = chunkKey(cx, cz)
  }

  getBlock(lx: number, y: number, lz: number): PackedState {
    if (y < 0 || y >= WORLD_HEIGHT) return 0
    const s = this.sections.get(y >> 4)
    return s ? s.get(lx, y & 15, lz) : 0
  }

  setBlock(lx: number, y: number, lz: number, state: PackedState): void {
    if (y < 0 || y >= WORLD_HEIGHT) return
    const sy = y >> 4
    let s = this.sections.get(sy)
    if (!s) {
      if (state === 0) return
      s = new ChunkSection()
      this.sections.set(sy, s)
    }
    s.set(lx, y & 15, lz, state)
    const ci = columnIndex(lx, lz)
    if (state !== 0 && y > this.heightmap[ci]) this.heightmap[ci] = y
    else if (state === 0 && y === this.heightmap[ci]) this.recomputeColumn(lx, lz)
  }

  recomputeColumn(lx: number, lz: number): void {
    let y = WORLD_HEIGHT - 1
    while (y > 0 && this.getBlock(lx, y, lz) === 0) y--
    this.heightmap[columnIndex(lx, lz)] = y
  }

  toData(): ChunkData {
    const sections: ChunkData['sections'] = []
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const s = this.sections.get(sy)
      sections.push(s && !s.isEmpty ? { uniform: s.uniform, blocks: s.blocks } : null)
    }
    return { cx: this.cx, cz: this.cz, sections, heightmap: this.heightmap, biomeMap: this.biomeMap, tintMap: this.tintMap }
  }

  static fromData(d: ChunkData): Chunk {
    const c = new Chunk(d.cx, d.cz)
    d.sections.forEach((s, sy) => {
      if (s) c.sections.set(sy, new ChunkSection(s.uniform, s.blocks))
    })
    c.heightmap.set(d.heightmap)
    c.biomeMap.set(d.biomeMap)
    c.tintMap.set(d.tintMap)
    return c
  }

  /** 统计非空气方块数（调试用） */
  blockCount(): number {
    let n = 0
    for (const s of this.sections.values()) n += s.count((v) => v !== 0)
    return n
  }

  /** 内容哈希：同种子生成的区块必须一致（测试用） */
  hash(): number {
    let h = 0x811c9dc5
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const s = this.sections.get(sy)
      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE * SECTION_HEIGHT; i++) {
        const v = s ? (s.blocks ? s.blocks[i] : s.uniform) : 0
        h = Math.imul(h ^ v, 0x01000193)
      }
    }
    return h >>> 0
  }
}
