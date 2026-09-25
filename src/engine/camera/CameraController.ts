import * as THREE from 'three'
import type { LandmarkView } from '../../world/WorldManager'
import type { WorldSampler } from '../../world/WorldSampler'
import { angleDelta, type CameraLevel, type CameraPose, clonePose, poseToPosition } from './CameraPose'
import { CameraPresetRepository } from './CameraPresetRepository'
import { CollisionResolver } from './CollisionResolver'
import { FlightController, type FlightOptions } from './FlightController'
import { FocusController } from './FocusController'
import { type OrbitBounds, OrbitController } from './OrbitController'

/** 三级视角阈值（镜头距离，方块），带回差不抖 */
const LEVELS = { nationalIn: 1300, nationalOut: 1150, localIn: 240, localOut: 285 }

/**
 * 镜头控制：姿态平滑、环绕、飞行、聚焦、避山与三级视角。
 * 不知道诗词——诗词导航只通过 Engine.focusLandmark(id) 间接调用这里。
 */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera
  /** 当前（已平滑）姿态 */
  readonly pose: CameraPose
  /** 目标姿态（输入与聚焦写这里） */
  readonly goal: CameraPose
  readonly orbit: OrbitController
  readonly flight: FlightController
  readonly focus = new FocusController()
  readonly collision: CollisionResolver
  readonly presets: CameraPresetRepository
  level: CameraLevel = 'national'
  onLevelChange: ((l: CameraLevel) => void) | null = null
  private resolved: CameraPose

  constructor(
    private readonly sampler: WorldSampler,
    bounds: OrbitBounds,
    initial: CameraPose,
  ) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 12000)
    this.pose = clonePose(initial)
    this.goal = clonePose(initial)
    this.resolved = clonePose(initial)
    this.orbit = new OrbitController(this.goal, bounds)
    this.collision = new CollisionResolver(sampler)
    this.flight = new FlightController(this.collision)
    this.presets = new CameraPresetRepository(sampler)
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  /** 用户开始操作：打断飞行与环绕 */
  interrupt(): void {
    if (this.flight.active) {
      this.goal.target.copy(this.pose.target)
      Object.assign(this.goal, { yaw: this.pose.yaw, pitch: this.pose.pitch, distance: this.pose.distance })
      this.flight.cancel()
    }
    this.focus.stopOrbit()
  }

  flyTo(to: CameraPose, opts?: FlightOptions): Promise<void> {
    this.focus.stopOrbit()
    const p = this.flight.flyTo(this.pose, to, opts)
    return p.then(() => {
      this.goal.target.copy(to.target)
      Object.assign(this.goal, { yaw: to.yaw, pitch: to.pitch, distance: to.distance })
    })
  }

  focusLandmark(view: LandmarkView, opts?: FlightOptions & { shot?: number }): Promise<void> {
    return this.flyTo(this.focus.poseFor(view, opts?.shot ?? 1), opts)
  }

  flyToPreset(key: string, opts?: FlightOptions): Promise<void> {
    const p = this.presets.pose(key)
    return p ? this.flyTo(p, opts) : Promise.resolve()
  }

  update(dt: number): void {
    if (this.flight.active) {
      this.flight.update(dt, this.pose)
    } else {
      this.focus.update(dt, this.goal)
      /* 目标点贴地：平移后慢慢落到地面高度 */
      const gy = this.sampler.groundHeightAt(this.goal.target.x, this.goal.target.z)
      this.goal.target.y += (gy - this.goal.target.y) * (1 - Math.exp(-dt * 3))
      const k = 1 - Math.exp(-dt * 9)
      this.pose.target.lerp(this.goal.target, k)
      this.pose.yaw += angleDelta(this.pose.yaw, this.goal.yaw) * k
      this.pose.pitch += (this.goal.pitch - this.pose.pitch) * k
      this.pose.distance = Math.exp(Math.log(this.pose.distance) + (Math.log(this.goal.distance) - Math.log(this.pose.distance)) * k)
    }
    this.resolved = this.collision.resolve(this.pose, dt)
    const pos = poseToPosition(this.resolved, this.camera.position)
    this.camera.near = Math.max(0.3, this.resolved.distance * 0.004)
    this.camera.far = Math.max(3000, this.resolved.distance * 5 + 2000)
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(pos)
    this.camera.lookAt(this.resolved.target)
    this.updateLevel()
  }

  private updateLevel(): void {
    const d = this.pose.distance
    let l = this.level
    if (l === 'national' && d < LEVELS.nationalOut) l = d < LEVELS.localIn ? 'local' : 'regional'
    else if (l === 'regional') l = d > LEVELS.nationalIn ? 'national' : d < LEVELS.localIn ? 'local' : 'regional'
    else if (l === 'local' && d > LEVELS.localOut) l = d > LEVELS.nationalIn ? 'national' : 'regional'
    if (l !== this.level) {
      this.level = l
      this.onLevelChange?.(l)
    }
  }

  /** 当前生效的（已避山的）姿态 */
  get effective(): CameraPose {
    return this.resolved
  }
}
