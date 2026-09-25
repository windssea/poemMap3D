import * as THREE from 'three'
import type { WorldSampler } from '../../world/WorldSampler'
import { type CameraPose, DIST_MIN, PITCH_MAX, poseToPosition } from './CameraPose'

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
 * 镜头避山：弹簧臂。
 *
 * 旧做法是被山挡住就抬俯角——绕着高山、高楼转时，俯角被自动顶上去，用户往下压、它往上顶，很别扭。
 * 现在的做法（第三人称游戏里常见的弹簧臂）：
 *  1. 从注视点沿视线往镜头取样，遇到地形就把镜头收到遮挡之前（收得快、放得慢，不来回弹）；
 *     俯角完全由用户说了算；
 *  2. 只有镜头本身快贴到地面时才略抬俯角（不钻地），同样平滑。
 * 只看地形（不含树与屋顶，区块载入前后一致），不抖。
 */
export class CollisionResolver {
  private readonly tmp = new THREE.Vector3()
  private lift = 0
  private arm: number | null = null
  private safeY: number | null = null

  constructor(private readonly sampler: WorldSampler) {}

  clearance(distance: number): number {
    return 2.5 + distance * 0.02
  }

  /** 刚跳到新地方（飞行起点等）时重置平滑状态 */
  reset(): void {
    this.safeY = null
    this.arm = null
  }

  resolve(p: CameraPose, dt: number): CameraPose {
    const out = { target: p.target, yaw: p.yaw, pitch: p.pitch, distance: p.distance }
    /* 1. 弹簧臂：注视点附近几格不算（目标常落在坡面上），其后第一处低于地面的取样点之前停住 */
    const pos0 = poseToPosition(p, this.tmp)
    const n = 20
    let tHit = 1
    for (let i = 1; i <= n; i++) {
      const t = i / n
      if (t * p.distance < 6) continue
      const x = p.target.x + (pos0.x - p.target.x) * t
      const y = p.target.y + (pos0.y - p.target.y) * t
      const z = p.target.z + (pos0.z - p.target.z) * t
      if (y < this.sampler.groundHeightAt(x, z) + 1) {
        tHit = (i - 1) / n
        break
      }
    }
    const want = tHit < 1 ? Math.max(DIST_MIN + 2, p.distance * tHit) : p.distance
    if (this.arm === null) this.arm = want
    else this.arm += (want - this.arm) * (1 - Math.exp(-dt * (want < this.arm ? 12 : 2.5)))
    out.distance = Math.min(p.distance, this.arm)

    /* 2. 机位本身离地：周围一圈最高处（平滑）+ 净空，不够才略抬俯角 */
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
