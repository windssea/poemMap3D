import * as THREE from 'three'
import type { WorkerPool } from '../../engine/core/WorkerPool'
import { MaterialLibrary } from '../../engine/rendering/MaterialLibrary'
import type { SceneManager } from '../../engine/rendering/SceneManager'
import type { ChunkResult, MeshResult } from '../../workers/protocol'
import { CHUNK_SIZE } from '../coordinate/constants'
import { chunkKey } from '../coordinate/coords'
import type { OverviewGrid } from '../overview/OverviewBuilder'
import type { MeshLayerData } from '../voxel/MeshBuffer'
import type { World } from '../World'
import { Chunk, ChunkState } from './Chunk'
import { createChunkMeshes } from './ChunkMeshFactory'

export interface ChunkRecord {
  cx: number
  cz: number
  key: number
  state: ChunkState
  cancel?: () => void
  meshes: THREE.Mesh[]
  fade: { value: number }
  target: number
  lastSeen: number
  triangles: number
  genMs: number
  meshMs: number
  blocks: number
}

export interface ChunkManagerStats {
  requested: number
  generating: number
  visible: number
  cached: number
  dirty: number
  triangles: number
  avgGenMs: number
  avgMeshMs: number
  uploadsPending: number
}

const FADE_TIME = 0.45

/**
 * 区块管理：流式加载（按离焦点距离与视锥排优先级）、生成队列、网格队列、Worker 调度、
 * 缓存与卸载、脏区传播与重建、GPU 上传节流、覆盖图掩膜。
 */
export class ChunkManager {
  readonly records = new Map<number, ChunkRecord>()
  private readonly uploads: { rec: ChunkRecord; layers: MeshLayerData[] }[] = []
  private readonly dirty = new Set<number>()
  private focusCx = 0
  private focusCz = 0
  private radius = 0
  private frame = 0
  private readonly frustum = new THREE.Frustum()
  private readonly box = new THREE.Box3()
  private genSum = 0
  private meshSum = 0
  private genCount = 0
  readonly maskData: Uint8Array
  readonly mask: THREE.DataTexture
  private maskDirty = false
  uploadsPerFrame = 4
  maxCached = 900

  constructor(
    private readonly world: World,
    private readonly generators: WorkerPool,
    private readonly mesher: WorkerPool,
    private readonly scene: SceneManager,
    private readonly materials: MaterialLibrary,
    private readonly grid: OverviewGrid,
  ) {
    const w = (grid.tilesX * grid.n * grid.cell) / CHUNK_SIZE
    const h = (grid.tilesZ * grid.n * grid.cell) / CHUNK_SIZE
    this.maskData = new Uint8Array(w * h)
    this.mask = new THREE.DataTexture(this.maskData, w, h, THREE.RedFormat, THREE.UnsignedByteType)
    this.mask.magFilter = THREE.NearestFilter
    this.mask.minFilter = THREE.NearestFilter
    this.mask.needsUpdate = true
    world.onDirty = (cx, cz) => this.dirty.add(chunkKey(cx, cz))
  }

  get maskRect(): THREE.Vector4 {
    return new THREE.Vector4(this.grid.x0, this.grid.z0, this.mask.image.width * CHUNK_SIZE, this.mask.image.height * CHUNK_SIZE)
  }

  /** 设定焦点（方块坐标）与物化半径（区块）；radius 0 表示全国视角，不物化近景 */
  setFocus(x: number, z: number, radius: number, camera?: THREE.Camera): void {
    this.focusCx = Math.floor(x / CHUNK_SIZE)
    this.focusCz = Math.floor(z / CHUNK_SIZE)
    this.radius = radius
    if (camera) {
      camera.updateMatrixWorld()
      this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    }
  }

  private priority(rec: ChunkRecord): number {
    const dx = rec.cx - this.focusCx
    const dz = rec.cz - this.focusCz
    const d = dx * dx + dz * dz
    this.box.min.set(rec.cx * CHUNK_SIZE, 0, rec.cz * CHUNK_SIZE)
    this.box.max.set(rec.cx * CHUNK_SIZE + CHUNK_SIZE, 256, rec.cz * CHUNK_SIZE + CHUNK_SIZE)
    return this.frustum.intersectsBox(this.box) ? d : d * 4 + 64
  }

  update(dt: number): void {
    this.frame++
    const R = this.radius
    const R2 = R * R

    /* 1. 需要的区块：圆形范围内缺的就请求 */
    if (R > 0)
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dz * dz > R2) continue
          const cx = this.focusCx + dx
          const cz = this.focusCz + dz
          if (!this.inBounds(cx, cz)) continue
          const k = chunkKey(cx, cz)
          let rec = this.records.get(k)
          if (!rec) {
            rec = { cx, cz, key: k, state: ChunkState.REQUESTED, meshes: [], fade: { value: 0 }, target: 1, lastSeen: this.frame, triangles: 0, genMs: 0, meshMs: 0, blocks: 0 }
            this.records.set(k, rec)
            this.request(rec)
          } else {
            rec.lastSeen = this.frame
            if (rec.state === ChunkState.READY) this.show(rec)
            rec.target = 1
          }
        }

    /* 2. 超出范围：淡出后隐藏（保留缓存）；仍在排队的直接取消 */
    const out = (R + 2) * (R + 2)
    for (const rec of this.records.values()) {
      const dx = rec.cx - this.focusCx
      const dz = rec.cz - this.focusCz
      if (dx * dx + dz * dz <= (R > 0 ? out : -1)) continue
      if (rec.state === ChunkState.REQUESTED || rec.state === ChunkState.GENERATING) {
        rec.cancel?.()
        this.records.delete(rec.key)
      } else rec.target = 0
    }

    /* 3. GPU 上传节流 */
    for (let i = 0; i < this.uploadsPerFrame && this.uploads.length; i++) {
      const u = this.uploads.shift()!
      if (!this.records.has(u.rec.key)) continue
      this.install(u.rec, u.layers)
    }

    /* 4. 淡入淡出 + 覆盖图掩膜 */
    for (const rec of this.records.values()) {
      if (!rec.meshes.length && rec.state !== ChunkState.VISIBLE) continue
      const before = rec.fade.value
      if (rec.target > before) rec.fade.value = Math.min(1, before + dt / FADE_TIME)
      else if (rec.target < before) rec.fade.value = Math.max(0, before - dt / FADE_TIME)
      if (rec.fade.value !== before) this.setMask(rec, rec.fade.value)
      if (rec.fade.value === 0 && rec.target === 0 && rec.state === ChunkState.VISIBLE) this.hide(rec)
    }
    if (this.maskDirty) {
      this.mask.needsUpdate = true
      this.maskDirty = false
    }

    /* 5. 缓存上限：最久未见的先释放 */
    let cached = 0
    for (const r of this.records.values()) if (r.state === ChunkState.READY) cached++
    if (cached > this.maxCached) {
      const list = [...this.records.values()].filter((r) => r.state === ChunkState.READY).sort((a, b) => a.lastSeen - b.lastSeen)
      for (let i = 0; i < cached - this.maxCached; i++) this.evict(list[i])
    }

    /* 6. 脏区块重建 */
    for (const k of this.dirty) {
      const rec = this.records.get(k)
      this.dirty.delete(k)
      if (!rec || (rec.state !== ChunkState.VISIBLE && rec.state !== ChunkState.DIRTY && rec.state !== ChunkState.READY)) continue
      this.remesh(rec)
    }
  }

  private inBounds(cx: number, cz: number): boolean {
    const x = cx * CHUNK_SIZE - this.grid.x0
    const z = cz * CHUNK_SIZE - this.grid.z0
    return x >= 0 && z >= 0 && x < this.mask.image.width * CHUNK_SIZE && z < this.mask.image.height * CHUNK_SIZE
  }

  private request(rec: ChunkRecord): void {
    const job = this.generators.submit<ChunkResult>((id) => ({ type: 'chunk', id, cx: rec.cx, cz: rec.cz }), () => this.priority(rec))
    rec.cancel = job.cancel
    rec.state = ChunkState.GENERATING
    job.promise.then(
      (r) => {
        if (this.records.get(rec.key) !== rec) return
        rec.state = ChunkState.MESHING
        const chunk = Chunk.fromData(r.data)
        chunk.state = ChunkState.GENERATED
        this.world.putChunk(chunk)
        rec.genMs = r.stats.genMs
        rec.meshMs = r.stats.meshMs
        this.genSum += r.stats.genMs
        this.meshSum += r.stats.meshMs
        this.genCount++
        this.uploads.push({ rec, layers: r.layers })
      },
      () => undefined,
    )
  }

  private remesh(rec: ChunkRecord): void {
    rec.state = ChunkState.REMESH
    const vol = this.world.buildVolume(rec.cx, rec.cz)
    const job = this.mesher.submit<MeshResult>(
      (id) => ({ type: 'mesh', id, cx: rec.cx, cz: rec.cz, volume: { ox: vol.ox, oy: vol.oy, oz: vol.oz, sx: vol.sx, sy: vol.sy, sz: vol.sz, data: vol.data, biome: vol.biome } }),
      () => this.priority(rec),
      [vol.data.buffer, vol.biome.buffer],
    )
    job.promise.then(
      (r) => {
        if (this.records.get(rec.key) !== rec) return
        this.uploads.unshift({ rec, layers: r.layers })
      },
      () => undefined,
    )
  }

  private install(rec: ChunkRecord, layers: MeshLayerData[]): void {
    const wasVisible = rec.state === ChunkState.REMESH
    this.disposeMeshes(rec)
    rec.meshes = createChunkMeshes(rec.cx, rec.cz, layers, this.materials)
    rec.triangles = 0
    for (const m of rec.meshes) {
      MaterialLibrary.attachFade(m, rec)
      rec.triangles += (m.geometry.index?.count ?? 0) / 3
      this.scene.attach('world', m)
    }
    const c = this.world.getChunk(rec.cx, rec.cz)
    if (c) c.state = ChunkState.VISIBLE
    rec.state = ChunkState.VISIBLE
    if (!wasVisible) rec.fade.value = 0
    rec.target = 1
  }

  private show(rec: ChunkRecord): void {
    for (const m of rec.meshes) m.visible = true
    rec.state = ChunkState.VISIBLE
    rec.target = 1
  }

  private hide(rec: ChunkRecord): void {
    for (const m of rec.meshes) m.visible = false
    rec.state = ChunkState.READY
    this.setMask(rec, 0)
  }

  private evict(rec: ChunkRecord): void {
    this.disposeMeshes(rec)
    this.setMask(rec, 0)
    this.world.removeChunk(rec.cx, rec.cz)
    this.records.delete(rec.key)
  }

  private disposeMeshes(rec: ChunkRecord): void {
    for (const m of rec.meshes) {
      this.scene.detach(m)
      m.geometry.dispose()
    }
    rec.meshes = []
  }

  private setMask(rec: ChunkRecord, v: number): void {
    const x = rec.cx - this.grid.x0 / CHUNK_SIZE
    const z = rec.cz - this.grid.z0 / CHUNK_SIZE
    const w = this.mask.image.width
    if (x < 0 || z < 0 || x >= w || z >= this.mask.image.height) return
    const val = Math.round(v * 255)
    if (this.maskData[z * w + x] !== val) {
      this.maskData[z * w + x] = val
      this.maskDirty = true
    }
  }

  /** 当前半径内是否全部就绪 */
  get settled(): boolean {
    for (const r of this.records.values()) if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING || r.state === ChunkState.REQUESTED) return false
    return this.uploads.length === 0
  }

  stats(): ChunkManagerStats {
    const s: ChunkManagerStats = { requested: 0, generating: 0, visible: 0, cached: 0, dirty: this.dirty.size, triangles: 0, avgGenMs: 0, avgMeshMs: 0, uploadsPending: this.uploads.length }
    for (const r of this.records.values()) {
      if (r.state === ChunkState.REQUESTED) s.requested++
      else if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING) s.generating++
      else if (r.state === ChunkState.VISIBLE) {
        s.visible++
        s.triangles += r.triangles
      } else if (r.state === ChunkState.READY) s.cached++
    }
    s.avgGenMs = this.genCount ? this.genSum / this.genCount : 0
    s.avgMeshMs = this.genCount ? this.meshSum / this.genCount : 0
    return s
  }

  dispose(): void {
    for (const r of this.records.values()) this.disposeMeshes(r)
    this.records.clear()
    this.mask.dispose()
  }
}
