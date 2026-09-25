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
 * 旧做法是被山挡住就抬俯角——绕着高山、高楼转时，俯角被自动顶上去，用户往下压、它往上顶，很别扭。
 * 现在的做法：
 *  - 距离与俯角都由用户说了算，视线遮挡不做自动修正（修正会随方块台阶忽开忽关，镜头突然推拉）；
 *  - 只有镜头本身快钻进地面时才略抬俯角，平滑、带回落迟滞。
 * 只看地形（不含树与屋顶，区块载入前后一致），不抖。
 */
export class CollisionResolver {
  private readonly tmp = new THREE.Vector3()
  private lift = 0
  private safeY: number | null = null

  constructor(private readonly sampler: WorldSampler) {}

  clearance(distance: number): number {
    return 2.5 + distance * 0.02
  }

  /** 刚跳到新地方（飞行起点等）时重置平滑状态 */
  reset(): void {
    this.safeY = null
  }

  resolve(p: CameraPose, dt: number): CameraPose {
    const out = { target: p.target, yaw: p.yaw, pitch: p.pitch, distance: p.distance }
    // 距离只由用户（滚轮）决定：视线被山擦到时不收臂——在台阶状的方块地形上平移，视线忽擦忽离，
    // 收臂会让镜头一顿一顿地突然推近再慢慢拉远。被挡住就被挡住，用户自己转开即可。
    /* 机位本身离地：周围一圈最高处（平滑）+ 净空，不够才略抬俯角 */
    const pos = poseToPosition(out, this.tmp)
    const r = 1.5 + out.distance * 0.03
    let g = -Infinity
    for (const [ox, oz] of RING) g = Math.max(g, this.sampler.groundHeightAt(pos.x + ox * r, pos.z + oz * r))
    if (this.safeY === null) this.safeY = g
    else this.safeY += (g - this.safeY) * (1 - Math.exp(-dt * (g > this.safeY ? 5 : 1)))
    const minY = this.safeY + this.clearance(out.distance)
    let need = 0
    if (pos.y < minY) need = Math.asin(Math.min(1, Math.max(-1, (minY - p.target.y) / out.distance))) - p.pitch
    need = Math.max(0, Math.min(PITCH_MAX - p.pitch, need))
    this.lift += (need - this.lift) * (1 - Math.exp(-dt * (need > this.lift ? 6 : 2)))
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
