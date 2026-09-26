import * as THREE from 'three'
import { AmbientBaker } from '../rendering/AmbientBaker'
import type { PlaceAnchor } from '../../world/landmark/LandmarkDefinition'
import { WorldManager } from '../../world/WorldManager'
import { CameraController } from '../camera/CameraController'
import { type CameraLevel, type CameraPose, poseToPosition } from '../camera/CameraPose'
import type { FlightOptions } from '../camera/FlightController'
import { NightLanterns } from '../effects/NightLanterns'
import { LifeSystem } from '../effects/LifeSystem'
import { type BuiltTrail, TrailRenderer } from '../effects/TrailRenderer'
import { EnvironmentManager } from '../environment/EnvironmentManager'
import type { Season, TimeOfDay, Weather } from '../environment/types'
import { HoverSystem } from '../interaction/HoverSystem'
import { InputController } from '../interaction/InputController'
import { type RayHit, RaycastSystem } from '../interaction/RaycastSystem'
import { SelectionSystem } from '../interaction/SelectionSystem'
import { ChunkDebugOverlay } from '../../devtools/ChunkDebugOverlay'
import { MaterialLibrary } from '../rendering/MaterialLibrary'
import { type Quality, QualityManager } from '../rendering/QualityManager'
import { RendererManager } from '../rendering/RendererManager'
import { RenderPipeline } from '../rendering/RenderPipeline'
import { SceneManager } from '../rendering/SceneManager'
import { ShadowManager } from '../rendering/ShadowManager'
import { createSharedUniforms } from '../rendering/SharedUniforms'
import { EventBus } from './EventBus'
import type { FrameContext } from './FrameContext'
import { RenderLoop } from './RenderLoop'

export interface EngineEvents {
  frame: FrameContext
  level: CameraLevel
  select: { placeId: string | null; point: THREE.Vector3 | null }
  hover: RayHit | null
  hoverPlace: string | null
  progress: { label: string; value: number }
  ready: void
  interact: void
}

export interface EngineOptions {
  quality?: Quality
  time: TimeOfDay
  season: Season
  weather: Weather
}

/**
 * Three.js 引擎：独立运行时。React 只通过 EngineFacade 与它交互。
 * 负责渲染、镜头、交互、环境、效果与世界管理的组装和每帧调度。
 */
export class Engine {
  readonly events = new EventBus<EngineEvents>()
  readonly quality: QualityManager
  readonly renderer: RendererManager
  readonly scene = new SceneManager()
  readonly shared = createSharedUniforms()
  readonly materials: MaterialLibrary
  readonly shadows: ShadowManager
  readonly trail = new TrailRenderer()
  hover!: HoverSystem
  lanterns!: NightLanterns
  life!: LifeSystem
  world!: WorldManager
  camera!: CameraController
  env!: EnvironmentManager
  raycast!: RaycastSystem
  /** 重点建筑的天空可见度烘焙（只乘间接光） */
  baker!: AmbientBaker
  private bakeAt: { x: number; z: number; t: number; n: number } | null = null
  private readonly tmpDir = new THREE.Vector3()
  selection!: SelectionSystem
  chunkDebug: ChunkDebugOverlay | null = null
  private input: InputController | null = null
  private pipeline!: RenderPipeline
  private readonly loop: RenderLoop
  private hoverPending: { x: number; y: number } | null = null
  private ready = false

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: EngineOptions,
  ) {
    this.quality = new QualityManager(opts.quality)
    const q = this.quality.preset
    this.renderer = new RendererManager(container, q.pixelRatio)
    this.materials = new MaterialLibrary(this.shared, q.anisotropy)
    this.shadows = new ShadowManager(this.renderer.renderer, q.shadowSize)
    this.shadows.setEnabled(q.shadows, q.shadowSize, q.shadowCascades)
    this.scene.attach('effects', this.trail.group)
    this.loop = new RenderLoop(() => this.ready && this.pipeline.render())
    this.loop.add((dt, t) => this.tick(dt, t))
  }

  async init(data: { landmask: ArrayBuffer; anchors: PlaceAnchor[] }): Promise<void> {
    const q = this.quality.preset
    this.world = await WorldManager.create({
      landmask: data.landmask,
      anchors: data.anchors,
      scene: this.scene,
      materials: this.materials,
      shared: this.shared,
      quality: q,
      onProgress: (label, value) => this.events.emit('progress', { label, value }),
    })
    // 镜头止于雾边：南到海南，西、北、东不进边雾
    const bounds = this.world.cameraBounds()
    const home = this.initialPose()
    this.camera = new CameraController(this.world.sampler, bounds, home)
    this.camera.onLevelChange = (l) => this.events.emit('level', l)
    this.camera.setAspect(this.renderer.width / this.renderer.height)
    this.shadows.attach(this.camera.camera, this.scene.scene)
    this.baker = new AmbientBaker(this.shared)
    ;(this as unknown as { __shadowToggle: (on: boolean) => void }).__shadowToggle = (on: boolean) => {
      const p = this.quality.preset
      this.shadows.setEnabled(on && p.shadows, p.shadowSize, p.shadowCascades)
    }
    this.renderer.onResize((w, h) => this.camera.setAspect(w / h))
    this.pipeline = new RenderPipeline(this.renderer.renderer, this.scene.scene, this.camera.camera)
    this.pipeline.setQuality(this.quality.quality)
    // 衡、高：软阴影（边缘有半影，不再是一刀切的锯齿）
    this.renderer.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.onResize((w, h) => this.pipeline.setSize(w, h))
    this.env = new EnvironmentManager(this.shared, this.scene, this.shadows, this.renderer.renderer, { time: this.opts.time, season: this.opts.season, weather: this.opts.weather }, this.world.waterfalls())
    this.env.setQuality(q.particles)
    this.raycast = new RaycastSystem(this.world.world, this.world.sampler)
    this.hover = new HoverSystem(this.renderer.canvas)
    const terrain = this.world.ctx.terrain
    this.lanterns = new NightLanterns(
      (x, z) => this.world.sampler.groundHeightAt(x, z),
      (x, z) => {
        const c = terrain.column(Math.floor(x), Math.floor(z))
        return c.waterY > c.height && c.waterKind !== 1 ? c.waterY : -1
      },
    )
    this.scene.attach('effects', this.lanterns.group)
    this.life = new LifeSystem(this.world.ctx)
    this.scene.attach('effects', this.life.group)
    this.selection = new SelectionSystem(this.world.ctx.landmarks)
    this.input = new InputController(this.renderer.canvas, {
      onStart: () => {
        this.camera.interrupt()
        this.events.emit('interact', undefined)
      },
      rotate: (dx, dy) => this.camera.orbit.rotate(dx, dy),
      pan: (dx, dy) => this.camera.pan(dx, dy, this.renderer.height),
      zoom: (delta, x, y) => this.camera.zoom(delta, this.pick(x, y)?.point ?? null),
      tap: (x, y) => {
        const hit = this.pick(x, y)
        this.events.emit('select', { placeId: this.selection.pick(hit), point: hit?.point ?? null })
      },
      hover: (x, y) => (this.hoverPending = { x, y }),
    })
    this.quality.onChange((q, p) => {
      this.renderer.setPixelRatio(p.pixelRatio)
      this.pipeline.setQuality(q)
      this.pipeline.setSize(this.renderer.width, this.renderer.height)
      this.renderer.renderer.shadowMap.type = THREE.PCFShadowMap
      this.shadows.setEnabled(p.shadows, p.shadowSize, p.shadowCascades)
      this.world.setQuality(p)
      this.env.setQuality(p.particles)
    })
    this.events.emit('progress', { label: '展卷', value: 0.9 })
    void this.world.overview.requestAll(this.world.generators, () => this.camera.pose.target)
    this.ready = true
    this.loop.start()
    this.events.emit('ready', undefined)
  }

  private initialPose(): CameraPose {
    const P = this.world.sampler
    const c = P.project(113.2, 30.6)
    return { target: new THREE.Vector3(c.x, P.groundHeightAt(c.x, c.z), c.z), yaw: 0.42, pitch: 0.98, distance: 2700 }
  }

  private pick(x: number, y: number): RayHit | null {
    const nx = (x / this.renderer.width) * 2 - 1
    const ny = -(y / this.renderer.height) * 2 + 1
    return this.raycast.fromScreen(this.camera.camera, nx, ny)
  }

  private tick(dt: number, time: number): void {
    if (!this.ready) return
    this.camera.update(dt)
    const cam = this.camera.camera
    const pose = this.camera.effective
    this.world.update(dt, cam, pose.target, pose.distance, this.camera.destination)
    this.env.update(dt, time, cam, pose.target, pose.distance, this.renderer.renderer.getPixelRatio())
    this.trail.update(time)
    this.lanterns.update(dt, time, pose.target, pose.distance, this.shared.uNight.value)
    // 晨暮（太阳低）调色更暖
    const sunY = this.shared.uSunDir.value.y
    /* 地标的天空可见度烘焙：到了之后等近景载入再烘（再补烘一次）；走远了撤掉 */
    if (this.bakeAt) {
      const bk = this.bakeAt
      const dd = Math.hypot(pose.target.x - bk.x, pose.target.z - bk.z)
      if (dd > 140) {
        this.baker.clear()
        this.bakeAt = null
      } else if ((bk.t -= dt) <= 0 && bk.n < 2 && !this.camera.destination) {
        this.baker.bake(this.world.world, bk.x, bk.z)
        bk.n++
        bk.t = 5
      }
    }
    this.pipeline.setLight(this.shared.uNight.value, (1 - this.shared.uNight.value) * (1 - Math.min(1, Math.max(0, (sunY - 0.3) / 0.35))))
    this.life.update(dt, time, pose.target, pose.distance, this.shared.uNight.value, Math.min(1, Math.max(0, this.shared.uSunDir.value.y * 2)))
    if (this.hoverPending && this.loop.frame % 3 === 0) {
      const h = this.hoverPending
      this.hoverPending = null
      const hit = this.pick(h.x, h.y)
      if (this.hover.set(hit, this.selection.pick(hit))) this.events.emit('hoverPlace', this.hover.placeId)
      this.events.emit('hover', hit)
    }
    this.chunkDebug?.update(this.world.chunks)
    this.events.emit('frame', { dt, time, frame: this.loop.frame, camera: cam, focus: pose.target, distance: pose.distance })
  }

  /* ================= 对外能力（由 EngineFacade 调用） ================= */

  focusPlace(placeId: string, opts?: FlightOptions & { shot?: number }): Promise<void> {
    const v = this.world.landmarkView(placeId)
    if (!v) return Promise.resolve()
    this.life.setPlace(placeId)
    this.bakeAt = { x: v.target.x, z: v.target.z, t: 2.5, n: 0 }
    return this.camera.focusLandmark(v, opts)
  }

  flyToView(key: string, opts?: FlightOptions): Promise<void> {
    return this.camera.flyToPreset(key, opts)
  }

  /** 经纬度 → 世界坐标（含地表高度） */
  geoToWorld(lng: number, lat: number): THREE.Vector3 {
    const c = this.world.sampler.project(lng, lat)
    return new THREE.Vector3(c.x, this.world.sampler.groundHeightAt(c.x, c.z), c.z)
  }

  /** 地点的标签锚点：地标中心上方 */
  /** 地名签的锚点：主体建筑屋脊之上（签挂在楼顶，不贴在楼身上） */
  placeAnchor(placeId: string): THREE.Vector3 | null {
    const lm = this.world.ctx.landmarks.byPlaceId(placeId)
    if (!lm) return null
    let top = this.world.sampler.surfaceHeightAt(lm.x, lm.z) + 3
    for (const p of lm.placements) if (Math.hypot(p.x - lm.x, p.z - lm.z) < 16 && !/^(wall|gate|corner)/.test(p.id)) top = Math.max(top, p.world.maxY + 3)
    return new THREE.Vector3(lm.x + 0.5, top, lm.z + 0.5)
  }

  /** 镜头到这一点之间有没有山体或方块挡着（地名签被近处建筑、山挡住就不显示） */
  isOccluded(p: THREE.Vector3): boolean {
    const cam = this.camera.camera.position
    const dir = this.tmpDir.copy(p).sub(cam)
    const d = dir.length()
    if (d < 6) return false
    const hit = this.raycast.cast(cam, dir, d - 2)
    return !!hit && hit.distance < d - 4
  }

  setTime(t: TimeOfDay): void {
    this.env.setTime(t)
  }
  setSeason(s: Season): void {
    this.env.setSeason(s)
  }
  setWeather(w: Weather): void {
    this.env.setWeather(w)
  }
  setQuality(q: Quality): void {
    this.quality.set(q)
  }
  setThemeFog(k: number): void {
    this.env.fog.extra = k
  }

  /** 诗人足迹光带：返回各站位置与在线上的进度位置 */
  buildTrail(points: { lng: number; lat: number }[], color: string): BuiltTrail {
    return this.trail.build(
      points.map((p) => this.geoToWorld(p.lng, p.lat)),
      color,
      (x, z) => this.world.sampler.groundHeightAt(x, z),
    )
  }

  setTrailProgress(frac: number): void {
    this.trail.setProgress(frac)
  }

  trailHead(frac: number): THREE.Vector3 {
    return this.trail.headAt(frac)
  }

  hideTrail(): void {
    this.trail.clear()
  }

  /** 跟随镜头：直接写目标姿态（仍经平滑与避山） */
  follow(pose: CameraPose): void {
    this.camera.follow(pose)
  }

  /** 镜头由程序驱动时关掉拖动与滚轮 */
  setUserCamera(enabled: boolean): void {
    this.camera.orbit.enabled = enabled
  }

  /** 取景：斜俯视装下一组点，并为左侧面板让出 leftPad 像素 */
  framePoints(points: THREE.Vector3[], leftPad: number): CameraPose {
    const yaw = 0.25
    const pitch = 0.6
    const W = this.renderer.width
    const H = this.renderer.height
    const L = leftPad + 16
    const Rr = W - 120
    const T = 110
    const B = H - 90
    const cam = this.camera.camera.clone()
    const c = new THREE.Vector3()
    for (const p of points) c.add(p)
    c.divideScalar(points.length)
    const v = new THREE.Vector3()
    const box = (tgt: THREE.Vector3, dist: number) => {
      poseToPosition({ target: tgt, yaw, pitch, distance: dist }, cam.position)
      cam.lookAt(tgt)
      cam.updateMatrixWorld()
      let x0 = Infinity
      let x1 = -Infinity
      let y0 = Infinity
      let y1 = -Infinity
      for (const p of points) {
        v.copy(p).project(cam)
        const sx = (v.x * 0.5 + 0.5) * W
        const sy = (-v.y * 0.5 + 0.5) * H
        x0 = Math.min(x0, sx)
        x1 = Math.max(x1, sx)
        y0 = Math.min(y0, sy)
        y1 = Math.max(y1, sy)
      }
      return { x0, x1, y0, y1 }
    }
    const tgt = c.clone()
    let dist = 1000
    for (let it = 0; it < 5; it++) {
      let lo = 100
      let hi = 6000
      for (let q = 0; q < 20; q++) {
        const m = (lo + hi) / 2
        const b = box(tgt, m)
        if (b.x1 - b.x0 <= Rr - L && b.y1 - b.y0 <= B - T) hi = m
        else lo = m
      }
      dist = hi * 1.04
      const b = box(tgt, dist)
      const dx = (L + Rr) / 2 - (b.x0 + b.x1) / 2
      const dy = (T + B) / 2 - (b.y0 + b.y1) / 2
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).setY(0).normalize()
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).setY(0).normalize()
      const wpp = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / H
      tgt.addScaledVector(right, -dx * wpp).addScaledVector(fwd, (-dy * wpp) / Math.sin(pitch) * 0.9)
    }
    return { target: tgt, yaw, pitch, distance: dist }
  }

  isFlying(): boolean {
    return this.camera.flight.active
  }

  startOrbit(speed?: number): void {
    this.camera.focus.startOrbit(speed)
  }

  stopOrbit(): void {
    this.camera.focus.stopOrbit()
  }

  setChunkDebug(on: boolean): void {
    if (on && !this.chunkDebug) {
      this.chunkDebug = new ChunkDebugOverlay()
      this.scene.attach('debug', this.chunkDebug.lines)
    } else if (!on && this.chunkDebug) {
      this.scene.detach(this.chunkDebug.lines)
      this.chunkDebug.dispose()
      this.chunkDebug = null
    }
  }

  get frameMs(): number {
    return this.loop.frameMs
  }

  screenshot(): string {
    return this.pipeline.capture()
  }

  dispose(): void {
    this.loop.stop()
    this.input?.dispose()
    this.world?.dispose()
    this.env?.dispose()
    this.trail.clear()
    this.materials.dispose()
    this.renderer.dispose()
    this.events.clear()
    void this.container
  }
}
