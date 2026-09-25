import type * as THREE from 'three'
import type { Engine } from '../engine/core/Engine'
import type { FrameContext } from '../engine/core/FrameContext'
import type { Season, TimeOfDay, Weather } from '../engine/environment/types'
import type { Quality } from '../engine/rendering/QualityManager'
import { type TrailRepository, trailFraming } from '../features/poetTrail/TrailService'
import type { TourPort, TourService } from '../features/tour/TourService'
import type { AppStore } from './AppStore'

/**
 * React 操作引擎的唯一接口。
 * UI 不接触 Scene / Mesh / Camera；诗词导航只调用 focusLandmark(id)。
 */
export interface EngineFacade {
  focusLandmark(id: string): void

  setTime(time: TimeOfDay): void
  setSeason(season: Season): void
  setWeather(weather: Weather): void

  startTour(): void
  stopTour(): void

  showPoetTrail(poetId: string): void

  setQuality(level: Quality): void

  /* —— 以下为 UI 需要的补充能力 —— */
  hidePoetTrail(): void
  flyToView(key: string): void
  flyToGeo(lng: number, lat: number, distance?: number): void
  onFrame(fn: (f: FrameContext) => void): () => void
  /** 世界坐标 → 屏幕像素；不可见返回 null */
  project(v: THREE.Vector3, out: { x: number; y: number; depth: number }): boolean
  placeAnchor(placeId: string): THREE.Vector3 | null
  geoAnchor(lng: number, lat: number): THREE.Vector3
  screenshot(): string
  setDebugChunks(on: boolean): void
  onHover(fn: (info: HoverInfo | null) => void): () => void
  stats(): EngineStats
  setThemeFog(k: number): void
}

export interface HoverInfo {
  x: number
  y: number
  z: number
  chunk: string
  block: string
  height: number
  slope: number
  biome: string
  waterDistance: number
  occupancy: number
  treeCandidate: string
}

export interface EngineStats {
  fps: number
  chunks: ReturnType<Engine['world']['chunks']['stats']>
  workers: ReturnType<Engine['world']['generators']['stats']>
  overview: number
  worldTriangles: number
  overviewTriangles: number
}

export class EngineFacadeImpl implements EngineFacade, TourPort {
  tour: TourService | null = null

  constructor(
    private readonly engine: Engine,
    private readonly store: AppStore,
    private readonly trails: TrailRepository,
  ) {}

  focusLandmark(id: string): void {
    void this.engine.focusPlace(id)
  }

  setTime(time: TimeOfDay): void {
    this.engine.setTime(time)
    this.store.set({ time })
  }
  setSeason(season: Season): void {
    this.engine.setSeason(season)
    const w = this.store.get().weather
    // 冬季的雨即雪；离开冬季时雪换回雨
    const weather = w === 'rain' && season === 'winter' ? 'snow' : w === 'snow' && season !== 'winter' ? 'rain' : w
    this.engine.setWeather(weather)
    this.store.set({ season, weather })
  }
  setWeather(weather: Weather): void {
    const w = weather === 'rain' && this.store.get().season === 'winter' ? 'snow' : weather
    this.engine.setWeather(w)
    this.store.set({ weather: w })
  }

  startTour(): void {
    this.hidePoetTrail()
    this.tour?.start()
  }
  stopTour(): void {
    this.tour?.stop()
  }

  showPoetTrail(poetId: string): void {
    const t = this.trails.get(poetId)
    if (!t) return
    this.engine.showTrail(t.stops, t.color)
    const f = trailFraming(t, (lng, lat) => this.engine.world.sampler.project(lng, lat))
    const target = this.engine.world.sampler
    void this.engine.camera.flyTo({ target: this.engine.geoToWorld(target.geo(f.x, f.z).lng, target.geo(f.x, f.z).lat), yaw: 0.2, pitch: 1.05, distance: f.distance })
    this.store.set({ trailState: { poet: poetId, picking: false } })
  }

  hidePoetTrail(): void {
    this.engine.hideTrail()
    this.store.set({ trailState: { poet: null, picking: false } })
  }

  setQuality(level: Quality): void {
    this.engine.setQuality(level)
    this.store.set({ quality: level })
  }

  flyToView(key: string): void {
    void this.engine.flyToView(key)
  }

  flyToGeo(lng: number, lat: number, distance = 260): void {
    void this.engine.camera.flyTo({ target: this.engine.geoToWorld(lng, lat), yaw: this.engine.camera.pose.yaw, pitch: 0.75, distance })
  }

  onFrame(fn: (f: FrameContext) => void): () => void {
    return this.engine.events.on('frame', fn)
  }

  private readonly tmp = { v: null as THREE.Vector3 | null }
  project(v: THREE.Vector3, out: { x: number; y: number; depth: number }): boolean {
    const cam = this.engine.camera.camera
    const p = (this.tmp.v ??= v.clone()).copy(v).project(cam)
    if (p.z > 1 || p.z < -1) return false
    out.x = (p.x * 0.5 + 0.5) * this.engine.renderer.width
    out.y = (-p.y * 0.5 + 0.5) * this.engine.renderer.height
    out.depth = cam.position.distanceTo(v)
    return true
  }

  placeAnchor(placeId: string): THREE.Vector3 | null {
    return this.engine.placeAnchor(placeId)
  }

  geoAnchor(lng: number, lat: number): THREE.Vector3 {
    return this.engine.geoToWorld(lng, lat)
  }

  screenshot(): string {
    return this.engine.screenshot()
  }

  setDebugChunks(on: boolean): void {
    this.engine.setChunkDebug(on)
  }

  setThemeFog(k: number): void {
    this.engine.setThemeFog(k)
  }

  onHover(fn: (info: HoverInfo | null) => void): () => void {
    return this.engine.events.on('hover', (hit) => {
      if (!hit) return fn(null)
      const x = Math.floor(hit.point.x - hit.normal.x * 0.01)
      const z = Math.floor(hit.point.z - hit.normal.z * 0.01)
      const ctx = this.engine.world.ctx
      const s = ctx.terrain.sample(x, z)
      const occ = ctx.landmarks.occupancy.get(x, z)
      const tree = ctx.trees.decide(Math.floor(x / 4), Math.floor(z / 4))
      fn({
        x,
        y: hit.block ? hit.block.y : Math.floor(hit.point.y),
        z,
        chunk: `${x >> 4}, ${z >> 4}`,
        block: hit.block ? `#${hit.block.state & 255}` : '（覆盖图）',
        height: s.surfaceY,
        slope: s.slope,
        biome: this.engine.world.sampler.biomeName(s.biome),
        waterDistance: s.waterDistance,
        occupancy: occ,
        treeCandidate: tree ? `${tree.type}#${tree.variant} h${tree.height} @${tree.x},${tree.z}` : '—',
      })
    })
  }

  stats(): EngineStats {
    const e = this.engine
    return {
      fps: 1000 / Math.max(1, e.frameMs),
      chunks: e.world.chunks.stats(),
      workers: e.world.generators.stats(),
      overview: e.world.overview.progress,
      worldTriangles: e.scene.stats('world').triangles,
      overviewTriangles: e.scene.stats('overview').triangles,
    }
  }

  /* —— TourPort —— */
  flyToPlace(placeId: string, opts: { speed: number; shot: number }): Promise<void> {
    return this.engine.focusPlace(placeId, { speed: opts.speed, shot: opts.shot })
  }
  flyHome(speed: number): Promise<void> {
    return this.engine.flyToView('home', { speed })
  }
  setAmbience(a: { season: Season; time: TimeOfDay; weather: Weather }): void {
    this.setSeason(a.season)
    this.setTime(a.time)
    this.setWeather(a.weather)
  }
  startOrbit(): void {
    this.engine.startOrbit(0.045)
  }
  stopOrbit(): void {
    this.engine.stopOrbit()
  }
}
