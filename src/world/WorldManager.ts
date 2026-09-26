import * as THREE from 'three'
import { WorkerPool } from '../engine/core/WorkerPool'
import type { MaterialLibrary } from '../engine/rendering/MaterialLibrary'
import type { QualityPreset } from '../engine/rendering/QualityManager'
import type { SceneManager } from '../engine/rendering/SceneManager'
import type { SharedUniforms } from '../engine/rendering/SharedUniforms'
import type { WorkerResponse } from '../workers/protocol'
import { ChunkManager } from './chunk/ChunkManager'
import { ChunkWarmer } from './ChunkWarmer'
import type { MacroGridData } from './generation/geography/MacroGeography'
import { WorldContext } from './generation/WorldContext'
import type { CameraPreset, PlaceAnchor } from './landmark/LandmarkDefinition'
import { designCamera, type DesignedView } from './landmark/CameraDesigner'
import { buildFogMap, type FogMap, fogBounds } from './overview/EdgeFog'
import { type OverviewGrid, overviewGrid } from './overview/OverviewBuilder'
import { OverviewRenderer } from './overview/OverviewRenderer'
import { World } from './World'
import { WorldConfig } from './WorldConfig'
import { WorldSampler } from './WorldSampler'

export interface LandmarkView {
  target: THREE.Vector3
  preset: CameraPreset
  name: string
  radius: number
}

/**
 * 世界管理：主线程上的世界总入口。
 *  - 启动 Worker（第一个算宏观地势，再分发给其余），主线程自建一份同样的世界上下文；
 *  - 按镜头距离决定近景区块半径，驱动 ChunkManager 流式加载；
 *  - 维护全国覆盖图；
 *  - 对外提供 WorldSampler 与地标取景。
 */
export class WorldManager {
  readonly world = new World()
  readonly ctx: WorldContext
  readonly sampler: WorldSampler
  readonly chunks: ChunkManager
  readonly overview: OverviewRenderer
  readonly grid: OverviewGrid
  /** 边缘雾图：着色器混雾、区块跳过全隐处、镜头可去的范围 */
  readonly fog: FogMap
  readonly fogTexture: THREE.DataTexture
  private quality: QualityPreset
  private readonly shared: SharedUniforms
  /** 空闲时把名胜周围的区块预先生成进浏览器缓存 */
  private readonly warmer: ChunkWarmer
  /** 焦点移动速度（方块/秒，平滑）与上一帧焦点：按速度预读前方 */
  private readonly vel = new THREE.Vector2()
  private readonly last = new THREE.Vector3(Number.NaN, 0, 0)
  /** 当前近景半径（带回差：变化够两圈才换，缩放时不来回重排） */
  private curR = -1
  /** 设计好的地点机位（按地标下标缓存） */
  private readonly designed = new Map<number, DesignedView>()

  private constructor(
    ctx: WorldContext,
    readonly generators: WorkerPool,
    readonly mesher: WorkerPool,
    scene: SceneManager,
    materials: MaterialLibrary,
    shared: SharedUniforms,
    quality: QualityPreset,
  ) {
    this.ctx = ctx
    this.quality = quality
    this.shared = shared
    this.warmer = new ChunkWarmer(ctx, generators)
    this.sampler = new WorldSampler(ctx, this.world)
    this.grid = overviewGrid(ctx)
    this.fog = buildFogMap(ctx.macro)
    this.fogTexture = new THREE.DataTexture(this.fog.data, this.fog.w, this.fog.h, THREE.RedFormat, THREE.UnsignedByteType)
    this.fogTexture.magFilter = THREE.LinearFilter
    this.fogTexture.minFilter = THREE.LinearFilter
    this.fogTexture.needsUpdate = true
    shared.uFogMap.value = this.fogTexture
    shared.uFogRect.value.set(this.fog.x0, this.fog.z0, this.fog.w * this.fog.cell, this.fog.h * this.fog.cell)
    this.chunks = new ChunkManager(this.world, generators, mesher, scene, materials, this.grid, this.fog)
    this.chunks.uploadsPerFrame = quality.uploadsPerFrame
    shared.uChunkMask.value = this.chunks.mask
    shared.uChunkMaskRect.value.copy(this.chunks.maskRect)
    this.overview = new OverviewRenderer(ctx, this.grid, materials, scene)
  }

  static async create(opts: {
    landmask: ArrayBuffer
    anchors: PlaceAnchor[]
    scene: SceneManager
    materials: MaterialLibrary
    shared: SharedUniforms
    quality: QualityPreset
    onProgress?: (label: string, p: number) => void
  }): Promise<WorldManager> {
    const seed = WorldConfig.seed
    const gen = new WorkerPool(() => new Worker(new URL('../workers/chunk-generator.worker.ts', import.meta.url), { type: 'module' }), opts.quality.workers)
    const mesher = new WorkerPool(() => new Worker(new URL('../workers/chunk-mesher.worker.ts', import.meta.url), { type: 'module' }), 1)
    opts.onProgress?.('铺纸 · 勾勒海岸与山河', 0.2)
    let macro: MacroGridData | null = null
    const first = gen.first()
    await new Promise<void>((resolve, reject) => {
      let gotReady = false
      gen
        .direct(first, { type: 'init', landmask: opts.landmask, anchors: opts.anchors, seed }, [], (r: WorkerResponse) => {
          if (r.type === 'macro') macro = r.macro
          if (r.type === 'ready') gotReady = true
          return gotReady
        })
        .then(() => resolve(), reject)
    })
    if (!macro) throw new Error('宏观地势生成失败')
    opts.onProgress?.('起笔 · 群山与江河', 0.45)
    const others = Array.from({ length: gen.size - 1 }, (_, i) => i + 1)
    const ready = others.length
      ? Promise.all(others.map((i) => gen.direct(gen.at(i), { type: 'init', macro: macro as MacroGridData, anchors: opts.anchors, seed }, [], (r) => r.type === 'ready')))
      : Promise.resolve([])
    const ctx = new WorldContext({ macro, anchors: opts.anchors, seed })
    opts.onProgress?.('点景 · 城池与草木', 0.7)
    await ready
    gen.activate()
    mesher.activate()
    return new WorldManager(ctx, gen, mesher, opts.scene, opts.materials, opts.shared, opts.quality)
  }

  setQuality(q: QualityPreset): void {
    this.quality = q
    this.chunks.uploadsPerFrame = q.uploadsPerFrame
  }

  /** 按镜头距离取近景半径：全国视角不物化区块，越近越小越密 */
  radiusFor(distance: number): number {
    if (distance > 1500) return 0
    // 推近时随视距放大；拉远到五六百格以外，近处也看不清方块细节了，交给远景一级，近景圈反而收小
    const grow = Math.round(distance / 16 / 1.6) + 4
    const shrink = distance > 520 ? Math.round((distance - 520) / 90) : 0
    return Math.max(4, Math.min(this.quality.chunkRadius - shrink, grow))
  }

  /**
   * @param dest 飞行目的地（有则提前排队那里的近景区块）
   */
  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, distance: number, dest?: { target: THREE.Vector3; distance: number } | null): void {
    this.shared.uLitFar.value = Math.max(80, distance + Math.max(1, this.curR) * 16 * 0.85)
    this.warmer.update(dt)
    /* 近景半径按镜头视距定，带回差 */
    const want = this.radiusFor(distance)
    if (this.curR < 0 || (want === 0) !== (this.curR === 0) || Math.abs(want - this.curR) >= 2) this.curR = want
    const r = this.curR
    /* 预读：焦点沿移动方向前移约 0.8 秒的路程（不超过近景半径的六成） */
    if (Number.isFinite(this.last.x) && dt > 0) {
      const k = Math.min(1, dt * 4)
      this.vel.x += ((focus.x - this.last.x) / dt - this.vel.x) * k
      this.vel.y += ((focus.z - this.last.z) / dt - this.vel.y) * k
    }
    this.last.copy(focus)
    const lead = this.vel.clone().multiplyScalar(0.8)
    const maxLead = r * 16 * 0.6
    if (lead.length() > maxLead) lead.setLength(maxLead)
    /* 细节圈的中心从注视点往镜头方向挪三成：画面下方（离镜头最近处）才是最该精细的地方 */
    const cx = focus.x + (camera.position.x - focus.x) * 0.3
    const cz = focus.z + (camera.position.z - focus.z) * 0.3
    const back = Math.hypot(cx - focus.x, cz - focus.z)
    const k = back > r * 16 * 0.5 ? (r * 16 * 0.5) / back : 1
    this.chunks.setFocus(focus.x + (cx - focus.x) * k + lead.x, focus.z + (cz - focus.z) * k + lead.y, r, Math.round(r * this.quality.farFactor), this.quality.coarseRadius, camera)
    const dr = dest ? this.radiusFor(dest.distance) : 0
    if (dest && dr > 0 && dest.target.distanceTo(focus) > r * 16) this.chunks.prefetch(dest.target.x, dest.target.z, Math.min(8, Math.ceil(dr * 0.6)))
    else this.chunks.prefetch(null)
    this.chunks.update(dt)
    this.overview.update(distance, camera.position, { data: this.chunks.maskData, width: this.chunks.mask.image.width, version: this.chunks.maskVersion })
  }

  /**
   * 地点取景：手工营造的名胜用定稿的机位；其余地点由 CameraDesigner 按地形、树冠、水面与朝向设计（算一次缓存）。
   */
  landmarkView(placeId: string): LandmarkView | null {
    const lm = this.ctx.landmarks.byPlaceId(placeId)
    if (!lm) return null
    if (lm.def.cameraPreset && !lm.def.id.startsWith('place-')) return { target: new THREE.Vector3(lm.x, lm.level + 1, lm.z), preset: lm.camera, name: lm.def.name, radius: lm.def.radius }
    let d = this.designed.get(lm.index)
    if (!d) {
      d = designCamera(lm, this.ctx.terrain, this.ctx.trees, this.fog)
      this.designed.set(lm.index, d)
    }
    return { target: new THREE.Vector3(d.targetX, d.targetY, d.targetZ), preset: d.preset, name: lm.def.name, radius: lm.def.radius }
  }

  /** 名胜瀑布（粒子水雾用） */
  waterfalls(): { x: number; y: number; z: number; width: number }[] {
    return this.ctx.landmarks.landmarks.filter((l) => l.waterfall).map((l) => ({ x: l.waterfall!.x, y: l.waterfall!.bottom + 1, z: l.waterfall!.z, width: l.waterfall!.width }))
  }

  /** 镜头目标点可去的范围（不进入全隐的雾里） */
  cameraBounds(): { minX: number; minZ: number; maxX: number; maxZ: number } {
    return fogBounds(this.fog)
  }

  dispose(): void {
    this.fogTexture.dispose()
    this.chunks.dispose()
    this.overview.dispose()
    this.generators.dispose()
    this.mesher.dispose()
  }
}
