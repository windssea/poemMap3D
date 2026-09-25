import * as THREE from 'three'
import type { WorldSampler } from '../../world/WorldSampler'
import { type CameraPose, PITCH_MAX, poseToPosition } from './CameraPose'

/**
 * 镜头避山：通过 WorldSampler.surfaceHeightAt() 保证镜头不钻进山体、树冠与屋顶，
 * 并沿视线检查遮挡——有山挡在焦点与镜头之间时抬高俯角。
 */
export class CollisionResolver {
  private readonly tmp = new THREE.Vector3()
  /** 平滑后的俯角抬升量 */
  private lift = 0

  constructor(private readonly sampler: WorldSampler) {}

  /** 离地最小高度（随距离放大） */
  clearance(distance: number): number {
    return 2.5 + distance * 0.03
  }

  resolve(p: CameraPose, dt: number): CameraPose {
    const out = { target: p.target, yaw: p.yaw, pitch: p.pitch + this.lift, distance: p.distance }
    let need = 0
    const pos = poseToPosition(out, this.tmp)
    const minY = this.sampler.surfaceHeightAt(pos.x, pos.z) + this.clearance(p.distance)
    if (pos.y < minY) need = Math.max(need, Math.asin(Math.min(1, (minY - p.target.y) / p.distance)) - p.pitch)
    /* 视线遮挡：焦点到镜头之间取样 */
    for (let i = 1; i <= 6; i++) {
      const t = i / 7
      const x = p.target.x + (pos.x - p.target.x) * t
      const z = p.target.z + (pos.z - p.target.z) * t
      const y = p.target.y + (pos.y - p.target.y) * t
      const g = this.sampler.surfaceHeightAt(x, z) + 1.5
      if (g > y) need = Math.max(need, Math.atan2(g - p.target.y, p.distance * t * Math.cos(out.pitch)) - p.pitch + 0.04)
    }
    need = Math.max(0, Math.min(PITCH_MAX - p.pitch, need))
    const k = 1 - Math.exp(-dt * (need > this.lift ? 10 : 2.5))
    this.lift += (need - this.lift) * k
    out.pitch = Math.min(PITCH_MAX, p.pitch + this.lift)
    /* 硬约束：无论如何不低于地面 */
    const hard = poseToPosition(out, this.tmp)
    const floor = this.sampler.surfaceHeightAt(hard.x, hard.z) + 1.2
    if (hard.y < floor) out.pitch = Math.min(PITCH_MAX, Math.asin(Math.min(1, (floor - p.target.y) / p.distance)))
    return out
  }

  /** 一条航线上的最低安全高度（巡游用：飞行前量出沿途净空） */
  pathClearance(ax: number, az: number, bx: number, bz: number, samples = 24): number {
    let h = 0
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      h = Math.max(h, this.sampler.surfaceHeightAt(ax + (bx - ax) * t, az + (bz - az) * t))
    }
    return h
  }
}
