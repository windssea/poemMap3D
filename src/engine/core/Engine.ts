import { WaterReflection } from '../rendering/WaterReflection'
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
import { type Quality, QualityManager, type ViewRange } from '../rendering/QualityManager'
import { RendererManager } from '../rendering/RendererManager'
import { RenderPipeline } from '../rendering/RenderPipeline'
import { SceneManager } from '../rendering/SceneManager'
import { ShadowManager } from '../rendering/ShadowManager'
import { createSharedUniforms } from '../rendering/SharedUniforms'
import { defaultLighting, type LightingTweaks } from '../rendering/LightingDebug'
import { GROUND_CAMERAS, groundCameraPose, type GroundCameraId } from '../camera/GroundTestCameras'
import { EventBus } from './EventBus'
import type { FrameContext } from './FrameContext'
import { RenderLoop } from './RenderLoop'

export interface EngineEvents {
  frame: FrameContext
  level: CameraLevel
  select: { placeId: string | null; point: THREE.Vector3 | null; x: number; y: number; touch: boolean }
  hover: RayHit | null
  hoverPlace: string | null
  progress: { label: string; value: number }
  ready: void
  interact: void
}

export interface EngineOptions {
  quality?: Quality
  viewRange?: ViewRange
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
  /** 水面倒影（调试面板读它的 info） */
  readonly reflection = new WaterReflection(this.shared)
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
  /** 光照调试。默认就是平衡后的白天参数，滑条只做对照 */
  readonly lighting: LightingTweaks
  private shadowOn: boolean
  /** 世界图层调试是否正在强制显隐（退回 'all' 时据此恢复一次） */
  private debugWorldActive = false

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: EngineOptions,
  ) {
    this.quality = new QualityManager(opts.quality, opts.viewRange)
    const q = this.quality.preset
    this.renderer = new RendererManager(container, q.pixelRatio)
    this.materials = new MaterialLibrary(this.shared, q.anisotropy)
    this.shadows = new ShadowManager(this.renderer.renderer, q.shadowSize)
    this.lighting = defaultLighting(q.shadows)
    this.shadowOn = q.shadows
    this.shadows.setEnabled(q.shadows, q.shadowSize, q.shadowCascades)
    this.scene.attach('effects', this.trail.group)
    this.trail.setResolution(this.renderer.width * this.renderer.renderer.getPixelRatio(), this.renderer.height * this.renderer.renderer.getPixelRatio())
    this.renderer.onResize((w, h) => this.trail.setResolution(w * this.renderer.renderer.getPixelRatio(), h * this.renderer.renderer.getPixelRatio()))
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
    this.env = new EnvironmentManager(this.shared, this.scene, this.shadows, this.renderer.renderer, this.camera, { time: this.opts.time, season: this.opts.season, weather: this.opts.weather }, this.world.waterfalls())
    this.env.lighting = this.lighting
    this.env.setQuality(q.particles)
    this.env.clouds.groundAt = (x, z) => this.world.sampler.groundHeightAt(x, z)
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
      tap: (x, y, touch) => {
        const hit = this.pick(x, y)
        this.events.emit('select', { placeId: this.selection.pick(hit), point: hit?.point ?? null, x, y, touch })
      },
      hover: (x, y) => (this.hoverPending = { x, y }),
    })
    this.quality.onChange((q, p) => {
      this.renderer.setPixelRatio(p.pixelRatio)
      this.pipeline.setQuality(q)
      this.pipeline.setSize(this.renderer.width, this.renderer.height)
      this.renderer.renderer.shadowMap.type = THREE.PCFShadowMap
      this.lighting.shadow = p.shadows
      this.shadowOn = p.shadows
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

  /** 倒影水面的取样缓存：注视点挪动不到 10 格、镜头距离变化不大就沿用 */
  private reflPick: { x: number; z: number; d: number; area: { x: number; z: number; y: number; r: number } | null } | null = null

  /**
   * 水面倒影（衡、高画质，镜头近时）：自动选注视点附近的水——在以注视点为心、随镜头距离放大的范围里按格取样，
   * 取「离注视点近、面积大」的那个水位作反射平面（一张反射图只能对一个平面；别的水位在着色器里渐回天光倒影）。
   * 地标声明了 reflection 的（枫桥）优先用它的圆心与半径。范围里没有水就不渲反射图，不白花一遍场景渲染
   */
  private updateReflection(focus: THREE.Vector3, distance: number): void {
    let area: { x: number; z: number; y: number; r: number } | null = null
    if (this.quality.quality !== 'low' && distance < 320) {
      const c = this.reflPick
      if (c && Math.hypot(c.x - focus.x, c.z - focus.z) < 10 && Math.abs(c.d - distance) < distance * 0.25) area = c.area
      else {
        area = this.pickReflection(focus, distance)
        this.reflPick = { x: focus.x, z: focus.z, d: distance, area }
      }
    }
    this.reflection.setArea(area)
    // 反射图上限：衡 512、高 1024（轻画质不开）
    this.reflection.update(this.renderer.renderer, this.scene.scene, this.camera.camera as THREE.PerspectiveCamera, !!area, this.quality.quality === 'high' ? 1024 : 512)
  }

  private pickReflection(focus: THREE.Vector3, distance: number): { x: number; z: number; y: number; r: number } | null {
    const t = this.world.ctx.terrain
    for (const lm of this.world.ctx.landmarks.landmarks) {
      const r = lm.def.reflection
      if (!r) continue
      const x = lm.x + r.x
      const z = lm.z + r.z
      if (Math.hypot(focus.x - x, focus.z - z) > r.r + 60) continue
      for (let d = 0; d <= r.r; d += 2)
        for (let k = 0; k < 16; k++) {
          const col = t.column(Math.round(x + Math.cos((k / 16) * Math.PI * 2) * d), Math.round(z + Math.sin((k / 16) * Math.PI * 2) * d))
          if (col.waterY >= 0 && col.height < col.waterY) return { x, z, y: col.waterY + 14 / 16, r: r.r }
        }
    }
    // 自动：范围半径随镜头距离（近看 40 格、远到 120 格），步长随之放大，取样不超过约 40×40
    const R = Math.max(40, Math.min(120, distance * 0.9))
    const step = Math.max(2, Math.round(R / 20))
    const score = new Map<number, { w: number; sx: number; sz: number; n: number }>()
    for (let dz = -R; dz <= R; dz += step)
      for (let dx = -R; dx <= R; dx += step) {
        const d = Math.hypot(dx, dz)
        if (d > R) continue
        const x = Math.round(focus.x + dx)
        const z = Math.round(focus.z + dz)
        const col = t.column(x, z)
        if (!(col.waterY >= 0 && col.height < col.waterY)) continue
        const e = score.get(col.waterY) ?? { w: 0, sx: 0, sz: 0, n: 0 }
        e.w += 1 / (1 + d / 20) // 近处的水权重大
        e.sx += x
        e.sz += z
        e.n++
        score.set(col.waterY, e)
      }
    let best: [number, { w: number; sx: number; sz: number; n: number }] | null = null
    for (const kv of score) if (!best || kv[1].w > best[1].w) best = kv
    if (!best || best[1].n < 3) return null
    return { x: focus.x, z: focus.z, y: best[0] + 14 / 16, r: R * 1.1 }
  }

  private tick(dt: number, time: number): void {
    if (!this.ready) return
    this.camera.update(dt)
    const cam = this.camera.camera
    const pose = this.camera.effective
    this.world.update(dt, cam, pose.target, pose.distance, this.camera.destination)
    this.applyDebugWorld()
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
    this.pipeline.setIsolated(this.lighting.view !== 'final')
    this.pipeline.setAoScale(this.lighting.ao)
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
    this.updateReflection(pose.target, pose.distance)
    this.events.emit('frame', { dt, time, frame: this.loop.frame, camera: cam, focus: pose.target, distance: pose.distance })
  }

  /* ================= 对外能力（由 EngineFacade 调用） ================= */

  focusPlace(placeId: string, opts?: FlightOptions & { shot?: number; shotId?: string }): Promise<void> {
    const v = this.world.landmarkView(placeId, opts?.shotId)
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
  /** 渲染视距：近景 / 远景 / 远景片的半径与缓存一起放大（见 VIEW_RANGES） */
  setViewRange(v: ViewRange): void {
    this.quality.setViewRange(v)
  }
  setThemeFog(k: number): void {
    this.env.fog.extra = k
  }

  /** 地面人视验收机位（见 GroundTestCameras）；传 null 放开，回到环绕镜头 */
  groundTestCamera(id: GroundCameraId | null): boolean {
    if (!id) {
      this.camera.clearFixed()
      return true
    }
    const spec = GROUND_CAMERAS[id]
    const view = this.world.landmarkView(spec.place)
    if (!view) return false
    const { eye, look } = groundCameraPose(spec, view.target, (x, z) => this.world.sampler.groundHeightAt(x, z))
    this.camera.setFixed(eye, look, spec.fov)
    return true
  }

  setLighting(patch: Partial<LightingTweaks>): void {
    Object.assign(this.lighting, patch)
    this.syncShadow()
  }

  resetLighting(): void {
    Object.assign(this.lighting, defaultLighting(this.quality.preset.shadows))
    this.syncShadow()
  }

  /** 阴影开关真正关掉级联灯。无光的调试视图不投影，省掉一轮阴影通道 */
  private syncShadow(): void {
    const L = this.lighting
    const unlit = L.view === 'albedo' || L.view === 'ao' || L.view === 'face' || L.view === 'fog' || L.world === 'none'
    const on = L.shadow && L.sun > 0.001 && !unlit
    if (on === this.shadowOn) return
    this.shadowOn = on
    const p = this.quality.preset
    this.shadows.setEnabled(on, p.shadowSize, on ? p.shadowCascades : 1)
  }

  /**
   * Phase 0 调试：按 lighting.world 保留哪一层世界几何。'all' 时完全不干预，
   * 其余模式在 world.update 之后逐帧强制，盖过流式加载的 show/hide；全国覆盖图跟远景一起显隐。
   */
  private applyDebugWorld(): void {
    const mode = this.lighting.world
    if (mode === 'all') {
      // 只在刚从调试模式退回的那一帧恢复区块与覆盖图的可见性；平时什么都不做
      if (!this.debugWorldActive) return
      this.debugWorldActive = false
      this.world.chunks.restoreVisibility()
      this.world.overview.group.visible = true
      return
    }
    this.debugWorldActive = true
    this.world.chunks.applyTierVisibility((tier) => mode === 'near' ? tier === 1 : mode === 'far' && tier !== 1)
    this.world.overview.group.visible = mode === 'far'
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
    this.pipeline.dispose()
    this.reflection.dispose()
    this.baker.dispose()
    this.renderer.dispose()
    this.events.clear()
    void this.container
  }
}
