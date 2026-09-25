import { CHUNK_MASK, CHUNK_SHIFT, CHUNK_SIZE, SECTION_HEIGHT, WORLD_RENDER_SCALE } from './constants'

export interface Vec3i {
  x: number
  y: number
  z: number
}

export interface ChunkPos {
  cx: number
  cz: number
}

/** 方块 → 所属区块（负坐标向下取整） */
export const blockToChunk = (b: number): number => b >> CHUNK_SHIFT
/** 方块 → 区块内局部坐标 0..15（负坐标也正确） */
export const blockToLocal = (b: number): number => b & CHUNK_MASK
export const chunkOrigin = (c: number): number => c << CHUNK_SHIFT
export const sectionOf = (y: number): number => Math.floor(y / SECTION_HEIGHT)

/** 区块键：cx、cz 各占 16 位（±32767 区块足够覆盖整个中国） */
export const chunkKey = (cx: number, cz: number): number => ((cx + 32768) << 16) | (cz + 32768)
export const chunkKeyX = (k: number): number => (k >>> 16) - 32768
export const chunkKeyZ = (k: number): number => (k & 0xffff) - 32768

/** 区块列内的方块下标：(y * 16 + z) * 16 + x */
export const columnIndex = (lx: number, lz: number): number => lz * CHUNK_SIZE + lx

export const toRender = (blockCoord: number): number => blockCoord * WORLD_RENDER_SCALE
export const fromRender = (renderCoord: number): number => renderCoord / WORLD_RENDER_SCALE

export interface ChunkNeighbor {
  cx: number
  cz: number
}

/** 位于区块边缘的方块会影响哪些相邻区块（用于脏区传播） */
export function edgeNeighbors(x: number, z: number): ChunkNeighbor[] {
  const lx = blockToLocal(x)
  const lz = blockToLocal(z)
  const cx = blockToChunk(x)
  const cz = blockToChunk(z)
  const out: ChunkNeighbor[] = []
  const dxs = lx === 0 ? [-1, 0] : lx === CHUNK_SIZE - 1 ? [0, 1] : [0]
  const dzs = lz === 0 ? [-1, 0] : lz === CHUNK_SIZE - 1 ? [0, 1] : [0]
  for (const dx of dxs) for (const dz of dzs) if (dx || dz) out.push({ cx: cx + dx, cz: cz + dz })
  return out
}
