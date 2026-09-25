import * as THREE from 'three'
import { WorkerPool } from '../engine/core/WorkerPool'
import type { MaterialLibrary } from '../engine/rendering/MaterialLibrary'
import type { QualityPreset } from '../engine/rendering/QualityManager'
import type { SceneManager } from '../engine/rendering/SceneManager'
import type { SharedUniforms } from '../engine/rendering/SharedUniforms'
import type { WorkerResponse } from '../workers/protocol'
import { ChunkManager } from './chunk/ChunkManager'
import type { MacroGridData } from './generation/geography/MacroGeography'
import { WorldContext } from './generation/WorldContext'
import type { CameraPreset, PlaceAnchor } from './landmark/LandmarkDefinition'
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
  private quality: QualityPreset

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
    this.sampler = new WorldSampler(ctx, this.world)
    this.grid = overviewGrid(ctx)
    this.chunks = new ChunkManager(this.world, generators, mesher, scene, materials, this.grid)
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
    const r = Math.round(distance / 16 / 1.6) + 4
    return Math.max(4, Math.min(this.quality.chunkRadius, r))
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, distance: number): void {
    this.chunks.setFocus(focus.x, focus.z, this.radiusFor(distance), camera)
    this.chunks.update(dt)
    this.overview.update(distance)
  }

  landmarkView(placeId: string): LandmarkView | null {
    const lm = this.ctx.landmarks.byPlaceId(placeId)
    if (!lm) return null
    return { target: new THREE.Vector3(lm.x, lm.level + 1, lm.z), preset: lm.camera, name: lm.def.name, radius: lm.def.radius }
  }

  /** 名胜瀑布（粒子水雾用） */
  waterfalls(): { x: number; y: number; z: number; width: number }[] {
    return this.ctx.landmarks.landmarks.filter((l) => l.waterfall).map((l) => ({ x: l.waterfall!.x, y: l.waterfall!.bottom + 1, z: l.waterfall!.z, width: l.waterfall!.width }))
  }

  dispose(): void {
    this.chunks.dispose()
    this.overview.dispose()
    this.generators.dispose()
    this.mesher.dispose()
  }
}
