import * as THREE from 'three'
import type { LandmarkView } from '../../world/WorldManager'
import type { WorldSampler } from '../../world/WorldSampler'
import { angleDelta, type CameraLevel, type CameraPose, clonePose, poseToPosition } from './CameraPose'
import { CameraPresetRepository } from './CameraPresetRepository'
import { CollisionResolver } from './CollisionResolver'
import { FlightController, type FlightOptions } from './FlightController'
import { FocusController } from './FocusController'
import { type OrbitBounds, OrbitController } from './OrbitController'

/** 三级视角阈值（取景距离，方块），带回差不抖 */
const LEVELS = { nationalIn: 1300, nationalOut: 1150, localIn: 240, localOut: 285 }

/** 标准镜头的竖直视场角（约合全画幅 31mm）；名胜机位、视角预设都按它构图 */
export const BASE_FOV = 42

/**
 * 焦段：竖直视场角（全画幅 24mm 高的底片上折算）。换焦段时镜头同时前后移，让注视点处的画面一样大——
 * 变的只是透视：长焦把远近山水压在一起，广角把近景拉开、纵深夸张。
 */
export const LENSES = { wide: 53.1, standard: BASE_FOV, human: 27, tele: 16.1 } as const
export type Lens = keyof typeof LENSES

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
  /** 聚焦名楼后保持注视点高度（看楼身而不是楼脚）；用户一平移就恢复贴地 */
  private holdY = false
  /** 当前焦段（竖直视场角，竖屏另加宽）：lensFov 平滑追 lensWant，换焦段是一段推拉变焦而不是一跳 */
  private lensWant: number = BASE_FOV
  private lensFov: number = BASE_FOV
  /**
   * 取景距离 → 真实镜头距离的倍数：tan(标准半视场) / tan(当前半视场)。
   * pose.distance 一律是「取景距离」（同一画面在标准镜头下的距离）——三级视角、区块半径、地名疏密、平移速度、
   * 名胜机位都按它算，换焦段不变；只有摆相机、雾、裁剪面、地名深度用真实距离（eyeDistance）。
   */
  lensScale = 1
  /** 避山后真实镜头所在的姿态（distance 为真实距离） */
  private resolvedEye: CameraPose

  constructor(
    private readonly sampler: WorldSampler,
    bounds: OrbitBounds,
    initial: CameraPose,
  ) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 1, 12000)
    this.pose = clonePose(initial)
    this.goal = clonePose(initial)
    this.resolved = clonePose(initial)
    this.resolvedEye = clonePose(initial)
    this.orbit = new OrbitController(this.goal, bounds)
    this.collision = new CollisionResolver(sampler)
    this.flight = new FlightController(this.collision)
    this.presets = new CameraPresetRepository(sampler)
  }

  /** 竖屏加宽视场角：宽高比 0.8 以下渐变到 0.5 时加宽约一半（标准镜头 42°→62°；竖屏 42° 的水平视角只剩二十来度，像长焦） */
  private fovFor(aspect: number, base = this.lensFov): number {
    return aspect >= 0.8 ? base : base + 20 * (base / BASE_FOV) * Math.min(1, (0.8 - aspect) / 0.3)
  }

  /** 按当前焦段与宽高比定视场角与取景倍数 */
  private applyLens(): void {
    if (this.fixed) return
    const a = this.camera.aspect
    this.camera.fov = this.fovFor(a)
    this.lensScale = Math.tan((this.fovFor(a, BASE_FOV) * Math.PI) / 360) / Math.tan((this.camera.fov * Math.PI) / 360)
    this.camera.updateProjectionMatrix()
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    if (this.fixed) this.camera.updateProjectionMatrix()
    else this.applyLens()
  }

  /** 换焦段（竖直视场角）；instant 为真时一步到位（启动时） */
  setLens(fov: number, instant = false): void {
    this.lensWant = fov
    if (instant) {
      this.lensFov = fov
      this.applyLens()
    }
  }

  /** 真实镜头到注视点的距离（取景距离 × 焦段倍数） */
  get eyeDistance(): number {
    return this.resolvedEye.distance
  }

  /** 用户开始操作：打断飞行与环绕 */
  interrupt(): void {
    this.releaseFixed()
    if (this.flight.active) {
      this.goal.target.copy(this.pose.target)
      Object.assign(this.goal, { yaw: this.pose.yaw, pitch: this.pose.pitch, distance: this.pose.distance })
      this.flight.cancel()
    }
    this.focus.stopOrbit()
  }

  /** 跟随：写入目标姿态（飞行中忽略） */
  follow(p: CameraPose): void {
    if (this.flight.active) return
    this.goal.target.copy(p.target)
    this.goal.yaw = p.yaw
    this.goal.pitch = p.pitch
    this.goal.distance = p.distance
  }

  /** 飞行目的地（飞行中才有）：世界据此预读 */
  destination: CameraPose | null = null

  /** 平移：注视点恢复贴地 */
  pan(dx: number, dy: number, viewportH: number): void {
    this.releaseFixed()
    this.holdY = false
    this.orbit.pan(dx, dy, viewportH)
  }

  /** 推拉：朝光标推近时注视点跟着落地 */
  zoom(delta: number, ground: THREE.Vector3 | null): void {
    this.releaseFixed()
    if (ground && delta < 0) this.holdY = false
    this.orbit.zoom(delta, ground)
  }

  flyTo(to: CameraPose, opts?: FlightOptions): Promise<void> {
    this.releaseFixed()
    this.focus.stopOrbit()
    this.holdY = true
    const p = this.flight.flyTo(this.pose, to, opts)
    this.destination = to
    return p.then(() => {
      if (this.destination === to) this.destination = null
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

  /** 固定机位：直接给眼点、注视点与视场角，绕过平滑、飞行与避山（地面人视校准、验收截图用） */
  private fixed: { eye: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null
  private readonly baseFov = BASE_FOV

  setFixed(eye: THREE.Vector3, look: THREE.Vector3, fov = this.baseFov): void {
    this.flight.cancel()
    this.focus.stopOrbit()
    this.destination = null
    this.fixed = { eye: eye.clone(), look: look.clone(), fov }
  }

  clearFixed(): void {
    if (!this.fixed) return
    this.fixed = null
    this.applyLens()
    this.collision.reset()
  }

  /** 从固定机位回到环绕镜头：目标姿态取固定机位当时的姿态，不跳 */
  private releaseFixed(): void {
    if (!this.fixed) return
    Object.assign(this.goal, { yaw: this.pose.yaw, pitch: Math.max(0.1, this.pose.pitch), distance: Math.max(10, this.pose.distance) })
    this.goal.target.copy(this.pose.target)
    this.pose.pitch = this.goal.pitch
    this.pose.distance = this.goal.distance
    this.clearFixed()
  }

  get isFixed(): boolean {
    return this.fixed !== null
  }

  update(dt: number): void {
    if (this.fixed) {
      const { eye, look, fov } = this.fixed
      const d = Math.max(1, eye.distanceTo(look))
      const p = this.pose
      p.target.copy(look)
      p.distance = d
      p.pitch = Math.asin((eye.y - look.y) / d)
      p.yaw = Math.atan2(eye.x - look.x, eye.z - look.z)
      Object.assign(this.goal, { yaw: p.yaw, pitch: p.pitch, distance: d })
      this.goal.target.copy(look)
      this.resolved = clonePose(p)
      this.resolvedEye = this.resolved
      if (this.camera.fov !== fov) {
        this.camera.fov = fov
        this.camera.updateProjectionMatrix()
      }
      this.applyResolved()
      return
    }
    if (this.flight.active) {
      this.flight.update(dt, this.pose)
    } else {
      this.focus.update(dt, this.goal)
      /* 目标点贴地：平移后慢慢落到地面高度 */
      if (!this.holdY) {
        const gy = this.groundAround(this.goal.target.x, this.goal.target.z, 1.5 + this.goal.distance * 0.03)
        this.goal.target.y += (gy - this.goal.target.y) * (1 - Math.exp(-dt * 2))
      }
      const k = 1 - Math.exp(-dt * 9)
      this.pose.target.lerp(this.goal.target, k)
      this.pose.yaw += angleDelta(this.pose.yaw, this.goal.yaw) * k
      this.pose.pitch += (this.goal.pitch - this.pose.pitch) * k
      // 推拉单独用稍慢的阻尼，滚轮一格一格时不顿
      // 每帧最多变 4%（按 60 帧计），连续快滚也是匀匀地推拉，不会一下窜出去
      const kd = 1 - Math.exp(-dt * 4.5)
      const step = (Math.log(this.goal.distance) - Math.log(this.pose.distance)) * kd
      const cap = 0.04 * Math.max(1, dt * 60)
      this.pose.distance = Math.exp(Math.log(this.pose.distance) + Math.max(-cap, Math.min(cap, step)))
    }
    /* 焦段推拉：视场角每帧追一点（约半秒到位），取景距离不变、真实距离随之变——推拉变焦 */
    if (Math.abs(this.lensWant - this.lensFov) > 0.01) {
      this.lensFov += (this.lensWant - this.lensFov) * (1 - Math.exp(-dt * 6))
      if (Math.abs(this.lensWant - this.lensFov) < 0.02) this.lensFov = this.lensWant
      this.applyLens()
    }
    // 避山按真实镜头位置算；给其余系统的姿态换回取景距离
    const k = this.lensScale
    this.resolvedEye = this.collision.resolve({ target: this.pose.target, yaw: this.pose.yaw, pitch: this.pose.pitch, distance: this.pose.distance * k }, dt)
    this.resolved = { ...this.resolvedEye, distance: this.resolvedEye.distance / k }
    this.applyResolved()
  }

  /** 把解算后的姿态写到相机：位置、裁剪面、朝向与三级视角 */
  private applyResolved(): void {
    const eye = this.resolvedEye
    const pos = poseToPosition(eye, this.camera.position)
    /* 远近裁剪随（真实）距离缓变；远裁剪面贴着雾的尽头，雾外的覆盖图块直接被视锥剔除 */
    const near = Math.max(0.3, eye.distance * 0.004)
    const far = Math.max(1500, eye.distance * 3.6 + 1200)
    if (Math.abs(near - this.camera.near) > near * 0.05 || Math.abs(far - this.camera.far) > far * 0.05) {
      this.camera.near = near
      this.camera.far = far
      this.camera.updateProjectionMatrix()
    }
    this.camera.position.copy(pos)
    this.camera.lookAt(eye.target)
    this.updateViewDir()
    this.updateLevel()
  }

  /** 目标点周围几处地面的平均高：平移经过方块台阶时不上下颠 */
  private groundAround(x: number, z: number, r: number): number {
    const s = this.sampler
    return (s.groundHeightAt(x, z) * 2 + s.groundHeightAt(x + r, z) + s.groundHeightAt(x - r, z) + s.groundHeightAt(x, z + r) + s.groundHeightAt(x, z - r)) / 6
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

  /** 镜头朝向的单位向量（走当前姿态算，不依赖相机矩阵的更新时机） */
  readonly viewDir = new THREE.Vector3()

  private updateViewDir(): void {
    const p = this.resolved
    const cp = Math.cos(p.pitch)
    // poseToPosition 的反推：镜头在 target 的 yaw/pitch 方向上，看回 target
    this.viewDir.set(-Math.sin(p.yaw) * cp, -Math.sin(p.pitch), -Math.cos(p.yaw) * cp)
  }
}
