import * as THREE from 'three'
import { clamp } from '../../utils/math'
import { type CameraPose, DIST_MAX, DIST_MIN, PITCH_MAX, PITCH_MIN } from './CameraPose'

export interface OrbitBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * 环绕操作：拖动转视角、右键平移、滚轮推拉（朝光标处推近）。只改「目标姿态」，平滑由 CameraController 负责。
 */
export class OrbitController {
  enabled = true
  private readonly right = new THREE.Vector3()
  private readonly fwd = new THREE.Vector3()

  constructor(
    private readonly goal: CameraPose,
    private readonly bounds: OrbitBounds,
  ) {}

  rotate(dx: number, dy: number): void {
    if (!this.enabled) return
    this.goal.yaw -= dx * 0.0055
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.0045, PITCH_MIN, PITCH_MAX)
  }

  pan(dx: number, dy: number, viewportH: number): void {
    if (!this.enabled) return
    const k = (this.goal.distance * 1.15) / viewportH
    this.right.set(Math.cos(this.goal.yaw), 0, -Math.sin(this.goal.yaw))
    this.fwd.set(-Math.sin(this.goal.yaw), 0, -Math.cos(this.goal.yaw))
    const t = this.goal.target
    t.addScaledVector(this.right, -dx * k)
    t.addScaledVector(this.fwd, (dy * k) / Math.max(0.35, Math.sin(this.goal.pitch)))
    this.clampTarget()
  }

  /** delta > 0 拉远；ground 为光标下的地面点（朝它推近） */
  zoom(delta: number, ground: THREE.Vector3 | null): void {
    if (!this.enabled) return
    const before = this.goal.distance
    const after = clamp(before * Math.exp(delta * 0.0013), DIST_MIN, DIST_MAX)
    this.goal.distance = after
    if (ground && after < before) {
      const f = 1 - after / before
      this.goal.target.x += (ground.x - this.goal.target.x) * f
      this.goal.target.z += (ground.z - this.goal.target.z) * f
    }
    this.clampTarget()
  }

  private clampTarget(): void {
    const b = this.bounds
    this.goal.target.x = clamp(this.goal.target.x, b.minX, b.maxX)
    this.goal.target.z = clamp(this.goal.target.z, b.minZ, b.maxZ)
  }
}
