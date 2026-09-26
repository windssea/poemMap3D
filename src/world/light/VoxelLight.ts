import type { BlockRegistry } from '../block/BlockRegistry'
import { B, Blocks } from '../block/Blocks'
import type { Chunk } from '../chunk/Chunk'
import { CHUNK_SIZE, SECTION_HEIGHT, SECTION_VOLUME, WORLD_HEIGHT } from '../coordinate/constants'

/**
 * 体素光照数据（为程序化建筑内部、洞穴等预留，类 Minecraft）：
 *  - 每格一个字节：高四位天空光（0–15），低四位方块光（0–15）；
 *  - 按 16 格高的段懒分配，全暗 / 全亮的段不必存；
 *  - 天空光：列顶以上为 15，向下遇实心即止；再向旁边（檐下、洞口）逐格衰减 1 地漫开；
 *    树叶、水额外吸收 1；
 *  - 方块光：灯笼等发光方块为源，向六个方向逐格衰减 1。
 * 目前只算、只存，渲染仍用顶点 AO + 面向明暗 + 实时太阳；以后洞穴与室内可直接取用。
 */
export class ChunkLight {
  private readonly sections = new Map<number, Uint8Array>()

  private index(lx: number, y: number, lz: number): number {
    return ((y & (SECTION_HEIGHT - 1)) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx
  }

  private section(sy: number, create: boolean): Uint8Array | undefined {
    let s = this.sections.get(sy)
    if (!s && create) {
      s = new Uint8Array(SECTION_VOLUME)
      this.sections.set(sy, s)
    }
    return s
  }

  sky(lx: number, y: number, lz: number): number {
    if (y >= WORLD_HEIGHT) return 15
    if (y < 0) return 0
    const s = this.sections.get(y >> 4)
    return s ? s[this.index(lx, y, lz)] >> 4 : 0
  }

  block(lx: number, y: number, lz: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0
    const s = this.sections.get(y >> 4)
    return s ? s[this.index(lx, y, lz)] & 15 : 0
  }

  setSky(lx: number, y: number, lz: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return
    const s = this.section(y >> 4, v > 0)
    if (!s) return
    const i = this.index(lx, y, lz)
    s[i] = (s[i] & 15) | ((v & 15) << 4)
  }

  setBlock(lx: number, y: number, lz: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return
    const s = this.section(y >> 4, v > 0)
    if (!s) return
    const i = this.index(lx, y, lz)
    s[i] = (s[i] & 0xf0) | (v & 15)
  }

  /** 两种光取大（着色时用：0–15） */
  level(lx: number, y: number, lz: number): number {
    return Math.max(this.sky(lx, y, lz), this.block(lx, y, lz))
  }

  get allocatedSections(): number {
    return this.sections.size
  }
}

/** 光的通透：0 挡光，1 透光，2 透光但多吸收 1（树叶、水） */
function passOf(id: number, reg: BlockRegistry): 0 | 1 | 2 {
  if (!id) return 1
  if (reg.liquid[id]) return 2
  if (reg.occludes[id]) return 0
  if (reg.aoSolid[id]) return 2 // 树叶类整块
  return 1
}

/** 发光方块的亮度 */
export function emissionOf(id: number): number {
  if (id === B.LANTERN) return 14
  if (id === B.LATTICE_WINDOW) return 7
  return 0
}

type Node = [number, number, number, number]
const N6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const

/**
 * 计算一个区块的天空光与方块光（只在区块内传播；跨区块边界的传播留待以后接邻居）。
 * 返回光照数据；耗时约与区块内的空腔体积成正比。
 */
export function computeChunkLight(chunk: Chunk, reg: BlockRegistry = Blocks): ChunkLight {
  const L = new ChunkLight()
  const queue: Node[] = []
  const top = (lx: number, lz: number) => chunk.heightmap[lz * CHUNK_SIZE + lx]
  /* 1. 天空光：列顶以上全亮；向下穿过透光方块（树叶、水每格减 1） */
  let maxTop = 0
  for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) maxTop = Math.max(maxTop, top(lx, lz))
  const ceil = Math.min(WORLD_HEIGHT - 1, maxTop + 1)
  for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      let v = 15
      for (let y = ceil; y >= 0 && v > 0; y--) {
        const pass = passOf(chunk.getBlock(lx, y, lz) & 255, reg)
        if (pass === 0) break
        if (pass === 2) v = Math.max(0, v - 1)
        L.setSky(lx, y, lz, v)
        if (y <= top(lx, lz) + 1) queue.push([lx, y, lz, v])
      }
    }
  /* 2. 天空光向旁边漫开（檐下、洞口、树荫下） */
  spread(queue, chunk, L, reg, true)
  /* 3. 方块光：发光源向外漫开 */
  const q2: Node[] = []
  for (let lz = 0; lz < CHUNK_SIZE; lz++)
    for (let lx = 0; lx < CHUNK_SIZE; lx++)
      for (let y = 0; y <= top(lx, lz); y++) {
        const e = emissionOf(chunk.getBlock(lx, y, lz) & 255)
        if (e > 0) {
          L.setBlock(lx, y, lz, e)
          q2.push([lx, y, lz, e])
        }
      }
  spread(q2, chunk, L, reg, false)
  return L
}

function spread(queue: Node[], chunk: Chunk, L: ChunkLight, reg: BlockRegistry, sky: boolean): void {
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y, z, v] = queue[qi]
    if (v <= 1) continue
    for (const [dx, dy, dz] of N6) {
      const nx = x + dx
      const ny = y + dy
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= CHUNK_SIZE || nz >= CHUNK_SIZE || ny < 0 || ny >= WORLD_HEIGHT) continue
      const pass = passOf(chunk.getBlock(nx, ny, nz) & 255, reg)
      if (pass === 0) continue
      const nv = v - (pass === 2 ? 2 : 1)
      const cur = sky ? L.sky(nx, ny, nz) : L.block(nx, ny, nz)
      if (nv <= cur) continue
      if (sky) L.setSky(nx, ny, nz, nv)
      else L.setBlock(nx, ny, nz, nv)
      queue.push([nx, ny, nz, nv])
    }
  }
}
