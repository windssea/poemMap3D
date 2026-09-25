import { mirrorBlock, rotateBlock } from '../block/Blocks'
import type { PackedState } from '../block/BlockState'
import { rotateXZ } from '../block/Direction'
import type { Vec3i } from '../coordinate/coords'

export interface StructureBlock {
  x: number
  y: number
  z: number
  state: PackedState
}

export interface Bounds3 {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

const key = (x: number, y: number, z: number) => ((x + 512) * 1024 + (z + 512)) * 1024 + (y + 512)

/**
 * 体素结构：树、建筑、桥、塔、城墙、亭子都是它。
 * 坐标是相对「锚点」的整数方块坐标；锚点通常是地面中心（y = 0 为地面上的第一层）。
 */
export class VoxelStructure {
  private readonly map = new Map<number, StructureBlock>()
  private list: StructureBlock[] | null = null
  name: string

  constructor(name = 'structure') {
    this.name = name
  }

  set(x: number, y: number, z: number, state: PackedState): this {
    const k = key(x, y, z)
    this.list = null
    if (state === 0) this.map.delete(k)
    else this.map.set(k, { x, y, z, state })
    return this
  }

  /** 只在空位放置（不覆盖已有方块） */
  setIfEmpty(x: number, y: number, z: number, state: PackedState): this {
    if (!this.map.has(key(x, y, z))) this.set(x, y, z, state)
    return this
  }

  get(x: number, y: number, z: number): PackedState {
    return this.map.get(key(x, y, z))?.state ?? 0
  }

  has(x: number, y: number, z: number): boolean {
    return this.map.has(key(x, y, z))
  }

  /** 方块列表（缓存，结构被修改时失效） */
  get blocks(): StructureBlock[] {
    return (this.list ??= [...this.map.values()])
  }

  get size(): Vec3i {
    const b = this.bounds()
    return { x: b.maxX - b.minX + 1, y: b.maxY - b.minY + 1, z: b.maxZ - b.minZ + 1 }
  }

  get count(): number {
    return this.map.size
  }

  bounds(): Bounds3 {
    let minX = Infinity
    let minY = Infinity
    let minZ = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    let maxZ = -Infinity
    for (const b of this.map.values()) {
      if (b.x < minX) minX = b.x
      if (b.y < minY) minY = b.y
      if (b.z < minZ) minZ = b.z
      if (b.x > maxX) maxX = b.x
      if (b.y > maxY) maxY = b.y
      if (b.z > maxZ) maxZ = b.z
    }
    if (!this.map.size) return { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }
    return { minX, minY, minZ, maxX, maxY, maxZ }
  }

  /** 俯视顺时针旋转 quarter 个 90°（方块状态的朝向一起转） */
  rotate(quarter: number): VoxelStructure {
    const out = new VoxelStructure(this.name)
    for (const b of this.map.values()) {
      const [x, z] = rotateXZ(b.x, b.z, quarter)
      out.set(x, b.y, z, rotateBlock(b.state, quarter))
    }
    return out
  }

  /** 镜像：'x' 沿 X 翻转（东西互换），'z' 南北互换 */
  mirror(axis: 'x' | 'z'): VoxelStructure {
    const out = new VoxelStructure(this.name)
    for (const b of this.map.values()) out.set(axis === 'x' ? -b.x : b.x, b.y, axis === 'z' ? -b.z : b.z, mirrorBlock(b.state, axis))
    return out
  }

  translate(dx: number, dy: number, dz: number): VoxelStructure {
    const out = new VoxelStructure(this.name)
    for (const b of this.map.values()) out.set(b.x + dx, b.y + dy, b.z + dz, b.state)
    return out
  }

  /** 并入另一个结构（后者覆盖前者） */
  merge(other: VoxelStructure, dx = 0, dy = 0, dz = 0, overwrite = true): this {
    for (const b of other.blocks) {
      if (overwrite) this.set(b.x + dx, b.y + dy, b.z + dz, b.state)
      else this.setIfEmpty(b.x + dx, b.y + dy, b.z + dz, b.state)
    }
    return this
  }

  /** 地面轮廓（y 最低一层以上所有方块投影到 XZ） */
  footprint(): Set<number> {
    const s = new Set<number>()
    for (const b of this.map.values()) s.add(((b.x + 512) << 10) | (b.z + 512))
    return s
  }
}
