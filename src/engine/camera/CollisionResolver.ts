import * as THREE from 'three'
import type { WorldSampler } from '../../world/WorldSampler'
import { type CameraPose, PITCH_MAX, poseToPosition } from './CameraPose'

const RING = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
]

/**
 * 镜头避山。
 *
 * 不做逐帧的「贴地钳制」——那会随地形台阶、区块载入前后的高度跳变来回顶镜头，正是抖动来源。
 * 做法：
 *  1. 只看地形（不含树与屋顶，区块载入前后一致），取机位周围一圈的最高处，并做不对称平滑
 *     （上升快、回落慢）得到安全高度；
 *  2. 视线遮挡每 0.3 秒按「未抬升」的姿态检查一次（避免抬升后不再遮挡 → 放下 → 又遮挡的振荡），
 *     结果带迟滞：抬起后至少保持 2 秒才允许回落；
 *  3. 俯角抬升量整体平滑。
 */
export class CollisionResolver {
  private readonly tmp = new THREE.Vector3()
  private lift = 0
  private occlusionLift = 0
  private safeY: number | null = null
  private checkT = 0
  private hold = 0

  constructor(private readonly sampler: WorldSampler) {}

  clearance(distance: number): number {
    return 2.5 + distance * 0.03
  }

  /** 刚跳到新地方（飞行起点等）时重置平滑状态 */
  reset(): void {
    this.safeY = null
  }

  resolve(p: CameraPose, dt: number): CameraPose {
    const out = { target: p.target, yaw: p.yaw, pitch: p.pitch, distance: p.distance }
    const pos = poseToPosition(p, this.tmp)
    /* 1. 机位周围地面最高处（平滑） */
    const r = 2 + p.distance * 0.04
    let g = -Infinity
    for (const [ox, oz] of RING) g = Math.max(g, this.sampler.groundHeightAt(pos.x + ox * r, pos.z + oz * r))
    if (this.safeY === null) this.safeY = g
    else this.safeY += (g - this.safeY) * (1 - Math.exp(-dt * (g > this.safeY ? 4 : 0.8)))
    const minY = this.safeY + this.clearance(p.distance)
    let need = 0
    if (pos.y < minY) need = Math.asin(Math.min(1, Math.max(-1, (minY - p.target.y) / p.distance))) - p.pitch

    /* 2. 视线遮挡（按未抬升的姿态，间隔检查 + 迟滞） */
    this.checkT -= dt
    this.hold = Math.max(0, this.hold - dt)
    if (this.checkT <= 0) {
      this.checkT = 0.3
      let occ = 0
      for (let i = 1; i <= 6; i++) {
        const t = i / 7
        const x = p.target.x + (pos.x - p.target.x) * t
        const z = p.target.z + (pos.z - p.target.z) * t
        const y = p.target.y + (pos.y - p.target.y) * t
        const gy = this.sampler.groundHeightAt(x, z) + 1.5
        if (gy > y) occ = Math.max(occ, Math.atan2(gy - p.target.y, p.distance * t * Math.cos(p.pitch)) - p.pitch + 0.05)
      }
      if (occ > this.occlusionLift) {
        this.occlusionLift = occ
        this.hold = 2
      } else if (this.hold <= 0) this.occlusionLift = occ
    }
    need = Math.max(0, Math.min(PITCH_MAX - p.pitch, Math.max(need, this.occlusionLift)))
    this.lift += (need - this.lift) * (1 - Math.exp(-dt * (need > this.lift ? 5 : 1.5)))
    out.pitch = Math.min(PITCH_MAX, p.pitch + this.lift)
    return out
  }

  /** 一条航线上的最低安全高度（巡游用：飞行前量出沿途净空） */
  pathClearance(ax: number, az: number, bx: number, bz: number, samples = 24): number {
    let h = 0
    for (let i = 0; i <= samples; i++) {
      const t = i / samples
      h = Math.max(h, this.sampler.groundHeightAt(ax + (bx - ax) * t, az + (bz - az) * t))
    }
    return h
  }
}
