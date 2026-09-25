import type { PackedState } from '../block/BlockState'
import { VoxelStructure } from './VoxelStructure'

/** 结构搭建辅助：填盒、空心盒、线段 */
export class StructureBuilder {
  readonly s: VoxelStructure

  constructor(name: string, target?: VoxelStructure) {
    this.s = target ?? new VoxelStructure(name)
  }

  set(x: number, y: number, z: number, st: PackedState): this {
    this.s.set(x, y, z, st)
    return this
  }

  setIfEmpty(x: number, y: number, z: number, st: PackedState): this {
    this.s.setIfEmpty(x, y, z, st)
    return this
  }

  /** 实心盒（含两端） */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: PackedState | ((x: number, y: number, z: number) => PackedState)): this {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.s.set(x, y, z, typeof st === 'function' ? st(x, y, z) : st)
    return this
  }

  /** 四面墙（不含顶底） */
  walls(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: PackedState | ((x: number, y: number, z: number) => PackedState)): this {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
          this.s.set(x, y, z, typeof st === 'function' ? st(x, y, z) : st)
        }
    return this
  }

  /** 三维直线（按最长轴逐格） */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: PackedState, ifEmpty = false): this {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0
      const x = Math.round(x0 + (x1 - x0) * t)
      const y = Math.round(y0 + (y1 - y0) * t)
      const z = Math.round(z0 + (z1 - z0) * t)
      if (ifEmpty) this.s.setIfEmpty(x, y, z, st)
      else this.s.set(x, y, z, st)
    }
    return this
  }

  /**
   * 连续相贴的体素线：相邻两格之间至少共享一个面（不只是角），用于树枝，保证结构连通。
   */
  solidLine(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, st: PackedState, ifEmpty = false): this {
    let x = x0
    let y = y0
    let z = z0
    const put = () => (ifEmpty ? this.s.setIfEmpty(x, y, z, st) : this.s.set(x, y, z, st))
    put()
    let guard = 0
    while ((x !== x1 || y !== y1 || z !== z1) && guard++ < 512) {
      const dx = x1 - x
      const dy = y1 - y
      const dz = z1 - z
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      const az = Math.abs(dz)
      if (ax >= ay && ax >= az) x += Math.sign(dx)
      else if (ay >= az) y += Math.sign(dy)
      else z += Math.sign(dz)
      put()
    }
    return this
  }

  /** 椭球团（用于树冠等） */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, st: PackedState, keep?: (x: number, y: number, z: number, d: number) => boolean, ifEmpty = true): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2
          if (d > 1) continue
          if (keep && !keep(x, y, z, d)) continue
          if (ifEmpty) this.s.setIfEmpty(x, y, z, st)
          else this.s.set(x, y, z, st)
        }
    return this
  }

  build(): VoxelStructure {
    return this.s
  }
}
