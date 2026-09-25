import { clamp, lerp } from '../../utils/math'
import { angleDelta, type CameraPose, clonePose } from './CameraPose'
import type { CollisionResolver } from './CollisionResolver'

export interface FlightOptions {
  /** 速度倍数（巡游设置：1 / 1.5 / 2） */
  speed?: number
  duration?: number
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * 飞行：远距离先升高、远渡、再推近；近距离短距滑移。
 * 起飞前量出沿途地形净空，镜头在山前提前平滑爬升。
 */
export class FlightController {
  private from: CameraPose | null = null
  private to: CameraPose | null = null
  private t = 0
  private dur = 1
  private hop = 0
  private minAlt = 0
  private resolveDone: (() => void) | null = null

  constructor(private readonly collision: CollisionResolver) {}

  get active(): boolean {
    return this.to !== null
  }

  flyTo(from: CameraPose, to: CameraPose, opts: FlightOptions = {}): Promise<void> {
    this.cancel()
    this.from = clonePose(from)
    this.to = clonePose(to)
    this.t = 0
    const d = from.target.distanceTo(to.target)
    const speed = opts.speed ?? 1
    this.dur = (opts.duration ?? clamp(1.3 + Math.log1p(d / 160) * 1.25, 1.2, 6)) / speed
    this.hop = clamp((d / Math.max(from.distance, to.distance)) * 0.7, 0, 3)
    this.minAlt = this.collision.pathClearance(from.target.x, from.target.z, to.target.x, to.target.z) + 10
    return new Promise((r) => (this.resolveDone = r))
  }

  cancel(): void {
    this.to = null
    this.from = null
    const r = this.resolveDone
    this.resolveDone = null
    r?.()
  }

  /** 推进一帧，写入 out；飞完返回 false */
  update(dt: number, out: CameraPose): boolean {
    if (!this.to || !this.from) return false
    this.t = Math.min(1, this.t + dt / this.dur)
    const e = ease(this.t)
    const a = this.from
    const b = this.to
    out.target.lerpVectors(a.target, b.target, e)
    out.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * e
    const arc = Math.sin(Math.PI * this.t)
    out.pitch = lerp(a.pitch, b.pitch, e) + arc * 0.12 * Math.min(1, this.hop)
    out.distance = Math.exp(lerp(Math.log(a.distance), Math.log(b.distance), e)) * (1 + this.hop * arc)
    /* 航线净空：镜头高度不低于沿途最高处 */
    const camY = out.target.y + Math.sin(out.pitch) * out.distance
    const need = this.minAlt * arc
    if (camY < need && out.distance > 1) out.distance += (need - camY) / Math.max(0.3, Math.sin(out.pitch))
    if (this.t >= 1) {
      Object.assign(out, { yaw: b.yaw, pitch: b.pitch, distance: b.distance })
      out.target.copy(b.target)
      const r = this.resolveDone
      this.to = null
      this.from = null
      this.resolveDone = null
      r?.()
      return false
    }
    return true
  }
}
