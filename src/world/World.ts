import type { PackedState } from './block/BlockState'
import { Chunk, ChunkState } from './chunk/Chunk'
import { CHUNK_SIZE, WORLD_HEIGHT } from './coordinate/constants'
import { blockToChunk, blockToLocal, chunkKey, columnIndex, edgeNeighbors } from './coordinate/coords'
import { VoxelVolume } from './voxel/VoxelVolume'

/**
 * 已物化的方块世界：只保存镜头附近真正生成过的区块。
 * 远处的地形由 WorldSampler 直接按生成函数取样，全国远景由 Overview 表示。
 */
export class World {
  readonly chunks = new Map<number, Chunk>()
  /** 区块内容被改动（需要重建网格）时回调 */
  onDirty: ((cx: number, cz: number) => void) | null = null

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz))
  }

  ensureChunk(cx: number, cz: number): Chunk {
    const k = chunkKey(cx, cz)
    let c = this.chunks.get(k)
    if (!c) {
      c = new Chunk(cx, cz)
      this.chunks.set(k, c)
    }
    return c
  }

  putChunk(c: Chunk): void {
    this.chunks.set(c.key, c)
  }

  removeChunk(cx: number, cz: number): void {
    this.chunks.delete(chunkKey(cx, cz))
  }

  getBlock(x: number, y: number, z: number): PackedState {
    const c = this.getChunk(blockToChunk(x), blockToChunk(z))
    return c ? c.getBlock(blockToLocal(x), y, blockToLocal(z)) : 0
  }

  /** 改一个方块：本区块标脏；若在区块边缘，相邻区块也标脏（邻面剔除与 AO 会变） */
  setBlock(x: number, y: number, z: number, s: PackedState): boolean {
    const cx = blockToChunk(x)
    const cz = blockToChunk(z)
    const c = this.getChunk(cx, cz)
    if (!c) return false
    c.setBlock(blockToLocal(x), y, blockToLocal(z), s)
    this.markDirty(c)
    for (const n of edgeNeighbors(x, z)) {
      const nc = this.getChunk(n.cx, n.cz)
      if (nc) this.markDirty(nc)
    }
    return true
  }

  private markDirty(c: Chunk): void {
    if (c.state === ChunkState.VISIBLE || c.state === ChunkState.READY) c.state = ChunkState.DIRTY
    this.onDirty?.(c.cx, c.cz)
  }

  /** 已加载区块中某列的最高方块 Y；区块未加载返回 -1 */
  loadedHeightAt(x: number, z: number): number {
    const c = this.getChunk(blockToChunk(x), blockToChunk(z))
    return c ? c.heightmap[columnIndex(blockToLocal(x), blockToLocal(z))] : -1
  }

  /** 用已加载区块拼出带 1 格外边的体素（主线程重建网格用） */
  buildVolume(cx: number, cz: number): VoxelVolume {
    const vol = VoxelVolume.forChunk(cx, cz, 1)
    for (let lz = 0; lz < vol.sz; lz++)
      for (let lx = 0; lx < vol.sx; lx++) {
        const x = vol.ox + lx
        const z = vol.oz + lz
        const c = this.getChunk(blockToChunk(x), blockToChunk(z))
        if (!c) continue
        const ix = blockToLocal(x)
        const iz = blockToLocal(z)
        vol.biome[lz * vol.sx + lx] = c.biomeMap[columnIndex(ix, iz)]
        const top = c.heightmap[columnIndex(ix, iz)]
        for (let y = 0; y <= Math.min(top, WORLD_HEIGHT - 1); y++) {
          const s = c.getBlock(ix, y, iz)
          if (s) vol.data[(y * vol.sz + lz) * vol.sx + lx] = s
        }
      }
    return vol
  }

  /** 把体素内部 16×16 区域写进区块 */
  static chunkFromVolume(vol: VoxelVolume, cx: number, cz: number, pad = 1): Chunk {
    const c = new Chunk(cx, cz)
    for (let lz = 0; lz < CHUNK_SIZE; lz++)
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const vx = lx + pad
        const vz = lz + pad
        c.biomeMap[columnIndex(lx, lz)] = vol.biome[vz * vol.sx + vx]
        let top = 0
        for (let y = 0; y < vol.sy; y++) {
          const s = vol.data[(y * vol.sz + vz) * vol.sx + vx]
          if (s) {
            c.setBlock(lx, y + vol.oy, lz, s)
            top = y + vol.oy
          }
        }
        c.heightmap[columnIndex(lx, lz)] = top
      }
    for (const s of c.sections.values()) s.compact()
    return c
  }
}
