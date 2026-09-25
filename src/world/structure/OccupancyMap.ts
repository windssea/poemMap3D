import { blockToChunk, blockToLocal, chunkKey } from '../coordinate/coords'

/** 占用类别（按位） */
export const Occupancy = {
  Building: 1,
  /** 建筑外轮廓的缓冲带：不栽乔木 */
  Buffer: 2,
  /** 入口通道：什么都不种 */
  Entrance: 4,
  /** 视线通道：不栽成熟乔木 */
  Sightline: 8,
  /** 地标范围（园林化种植） */
  Landmark: 16,
  /** 道路 / 广场 */
  Paved: 32,
} as const

/**
 * 占用图：从地标定义直接登记（建筑占地、入口、视线），而不是事后扫描网格包围盒推断。
 * 稀疏存储：只有被登记过的区块才分配 16×16 字节。
 */
export class OccupancyMap {
  private readonly cells = new Map<number, Uint8Array>()

  get(x: number, z: number): number {
    const c = this.cells.get(chunkKey(blockToChunk(x), blockToChunk(z)))
    return c ? c[blockToLocal(z) * 16 + blockToLocal(x)] : 0
  }

  has(x: number, z: number, mask: number): boolean {
    return (this.get(x, z) & mask) !== 0
  }

  mark(x: number, z: number, flag: number): void {
    const k = chunkKey(blockToChunk(x), blockToChunk(z))
    let c = this.cells.get(k)
    if (!c) this.cells.set(k, (c = new Uint8Array(256)))
    c[blockToLocal(z) * 16 + blockToLocal(x)] |= flag
  }

  markRect(x0: number, z0: number, x1: number, z1: number, flag: number): void {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.mark(x, z, flag)
  }

  /** 以 (x, z) 为顶点、朝 angle 方向张开的扇形 */
  markFan(x: number, z: number, angle: number, halfAngle: number, length: number, flag: number): void {
    const R = Math.ceil(length)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dz)
        if (d > length || d < 1) continue
        let a = Math.atan2(dz, dx) - angle
        a = Math.atan2(Math.sin(a), Math.cos(a))
        if (Math.abs(a) <= halfAngle) this.mark(x + dx, z + dz, flag)
      }
  }

  markCircle(x: number, z: number, r: number, flag: number): void {
    const R = Math.ceil(r)
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= r * r) this.mark(x + dx, z + dz, flag)
  }
}
