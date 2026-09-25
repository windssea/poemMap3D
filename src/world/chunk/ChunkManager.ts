import * as THREE from 'three'
import type { WorkerPool } from '../../engine/core/WorkerPool'
import type { MaterialLibrary } from '../../engine/rendering/MaterialLibrary'
import type { SceneManager } from '../../engine/rendering/SceneManager'
import type { ChunkResult, MeshResult } from '../../workers/protocol'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../coordinate/constants'
import { chunkKey } from '../coordinate/coords'
import type { OverviewGrid } from '../overview/OverviewBuilder'
import type { MeshLayerData } from '../voxel/MeshBuffer'
import type { World } from '../World'
import { Chunk, ChunkState } from './Chunk'
import { createChunkMeshes } from './ChunkMeshFactory'

/** 近景（原分辨率）与远景（2×2×2 合并）两级 */
export type ChunkTier = 1 | 2

export interface ChunkRecord {
  cx: number
  cz: number
  key: number
  tier: ChunkTier
  state: ChunkState
  cancel?: () => void
  meshes: THREE.Mesh[]
  lastSeen: number
  triangles: number
  genMs: number
  meshMs: number
}

export interface ChunkManagerStats {
  requested: number
  generating: number
  visible: number
  cached: number
  dirty: number
  triangles: number
  farVisible: number
  farTriangles: number
  avgGenMs: number
  avgMeshMs: number
  uploadsPending: number
}

/**
 * 区块管理：流式加载、生成队列、网格队列、Worker 调度、缓存与卸载、脏区传播与重建、GPU 上传节流、覆盖图掩膜。
 *
 * 两级：
 *  - 近景：焦点周围半径 R 内的原分辨率区块；
 *  - 远景：R 到 F 之间的一圈，同一份生成结果按 2×2×2 合并（树、建筑、江河都在，三角形约四分之一）；
 *  - 再外面才由全国覆盖图补上。
 * 区块装好即整块显示、覆盖图同时让位，没有淡入镂空（那会让两层之间透出天色，拖动时满屏白闪）。
 */
export class ChunkManager {
  /** 近景区块 */
  readonly records = new Map<number, ChunkRecord>()
  /** 远景区块 */
  readonly far = new Map<number, ChunkRecord>()
  private readonly uploads: { rec: ChunkRecord; layers: MeshLayerData[] }[] = []
  private readonly dirty = new Set<number>()
  private focusCx = 0
  private focusCz = 0
  private radius = 0
  private farRadius = 0
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
  maxFarCached = 2600

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

  /** 焦点（方块坐标）、近景半径与远景半径（区块）；0 表示全国视角 */
  setFocus(x: number, z: number, radius: number, farRadius: number, camera?: THREE.Camera): void {
    this.focusCx = Math.floor(x / CHUNK_SIZE)
    this.focusCz = Math.floor(z / CHUNK_SIZE)
    this.radius = radius
    this.farRadius = Math.max(radius, farRadius)
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
    this.box.max.set(rec.cx * CHUNK_SIZE + CHUNK_SIZE, WORLD_HEIGHT, rec.cz * CHUNK_SIZE + CHUNK_SIZE)
    const p = this.frustum.intersectsBox(this.box) ? d : d * 4 + 64
    return rec.tier === 1 ? p : p + 20000
  }

  private dist2(rec: { cx: number; cz: number }): number {
    const dx = rec.cx - this.focusCx
    const dz = rec.cz - this.focusCz
    return dx * dx + dz * dz
  }

  update(_dt: number): void {
    this.frame++
    const R = this.radius
    const F = this.farRadius

    /* 1. 需要的区块：近景圆内、远景环内（与近景重叠一圈，不留缝） */
    if (F > 0)
      for (let dz = -F; dz <= F; dz++)
        for (let dx = -F; dx <= F; dx++) {
          const d2 = dx * dx + dz * dz
          if (d2 > F * F) continue
          const cx = this.focusCx + dx
          const cz = this.focusCz + dz
          if (!this.inBounds(cx, cz)) continue
          const k = chunkKey(cx, cz)
          if (d2 <= R * R) this.want(this.records, k, cx, cz, 1)
          if (d2 >= (R - 1) * (R - 1)) this.want(this.far, k, cx, cz, 2)
        }

    /* 2. 超出范围：隐藏（保留缓存）；仍在排队的直接取消 */
    this.retire(this.records, R > 0 ? (R + 2) * (R + 2) : -1)
    this.retire(this.far, F > 0 ? (F + 3) * (F + 3) : -1)

    /* 3. GPU 上传节流：近景优先 */
    this.uploads.sort((a, b) => a.rec.tier - b.rec.tier)
    // 按时间预算上传：至少 uploadsPerFrame 块，远景块很小，时间允许就多传一些
    const t0 = performance.now()
    for (let i = 0; this.uploads.length && (i < this.uploadsPerFrame || performance.now() - t0 < 5); i++) {
      const u = this.uploads.shift()!
      const map = u.rec.tier === 1 ? this.records : this.far
      if (map.get(u.rec.key) !== u.rec) continue
      this.install(u.rec, u.layers)
    }

    /* 4. 远景让位给已显示的近景；覆盖图让位给任一级 */
    for (const f of this.far.values()) {
      if (f.state !== ChunkState.VISIBLE && f.state !== ChunkState.READY) continue
      const inRange = F > 0 && this.dist2(f) <= (F + 3) * (F + 3)
      const d = this.records.get(f.key)
      const covered = !!d && d.state === ChunkState.VISIBLE
      const show = inRange && !covered
      for (const m of f.meshes) m.visible = show
      f.state = show ? ChunkState.VISIBLE : ChunkState.READY
    }
    for (const r of this.records.values()) this.setMask(r.cx, r.cz, r.state === ChunkState.VISIBLE || this.far.get(r.key)?.state === ChunkState.VISIBLE)
    for (const f of this.far.values()) this.setMask(f.cx, f.cz, f.state === ChunkState.VISIBLE || this.records.get(f.key)?.state === ChunkState.VISIBLE)
    if (this.maskDirty) {
      this.mask.needsUpdate = true
      this.maskDirty = false
    }

    /* 5. 缓存上限：最久未见的先释放 */
    this.trim(this.records, this.maxCached)
    this.trim(this.far, this.maxFarCached)

    /* 6. 脏区块重建（只有近景存方块数据） */
    for (const k of this.dirty) {
      const rec = this.records.get(k)
      this.dirty.delete(k)
      if (!rec || (rec.state !== ChunkState.VISIBLE && rec.state !== ChunkState.READY)) continue
      this.remesh(rec)
    }
  }

  private want(map: Map<number, ChunkRecord>, k: number, cx: number, cz: number, tier: ChunkTier): void {
    let rec = map.get(k)
    if (!rec) {
      rec = { cx, cz, key: k, tier, state: ChunkState.REQUESTED, meshes: [], lastSeen: this.frame, triangles: 0, genMs: 0, meshMs: 0 }
      map.set(k, rec)
      this.request(rec)
      return
    }
    rec.lastSeen = this.frame
    if (tier === 1 && rec.state === ChunkState.READY) this.show(rec)
  }

  private retire(map: Map<number, ChunkRecord>, out2: number): void {
    for (const rec of map.values()) {
      if (this.dist2(rec) <= out2) continue
      if (rec.state === ChunkState.REQUESTED || rec.state === ChunkState.GENERATING) {
        rec.cancel?.()
        map.delete(rec.key)
      } else if (rec.state === ChunkState.VISIBLE && rec.tier === 1) {
        // 远景替身装好之前近景先别撤，免得露出底下的覆盖图
        const f = this.far.get(rec.key)
        const farReady = !!f && f.meshes.length > 0
        const beyondFar = this.dist2(rec) > (this.farRadius + 3) * (this.farRadius + 3)
        if (farReady || beyondFar || this.radius === 0) this.hide(rec)
      }
    }
  }

  private trim(map: Map<number, ChunkRecord>, max: number): void {
    let cached = 0
    for (const r of map.values()) if (r.state === ChunkState.READY) cached++
    if (cached <= max) return
    const list = [...map.values()].filter((r) => r.state === ChunkState.READY).sort((a, b) => a.lastSeen - b.lastSeen)
    for (let i = 0; i < cached - max; i++) this.evict(list[i])
  }

  private inBounds(cx: number, cz: number): boolean {
    const x = cx * CHUNK_SIZE - this.grid.x0
    const z = cz * CHUNK_SIZE - this.grid.z0
    return x >= 0 && z >= 0 && x < this.mask.image.width * CHUNK_SIZE && z < this.mask.image.height * CHUNK_SIZE
  }

  private request(rec: ChunkRecord): void {
    const job = this.generators.submit<ChunkResult>((id) => ({ type: 'chunk', id, cx: rec.cx, cz: rec.cz, lod: rec.tier }), () => this.priority(rec))
    rec.cancel = job.cancel
    rec.state = ChunkState.GENERATING
    const map = rec.tier === 1 ? this.records : this.far
    job.promise.then(
      (r) => {
        if (map.get(rec.key) !== rec) return
        rec.state = ChunkState.MESHING
        if (r.data) {
          const chunk = Chunk.fromData(r.data)
          chunk.state = ChunkState.GENERATED
          this.world.putChunk(chunk)
        }
        rec.genMs = r.stats.genMs
        rec.meshMs = r.stats.meshMs
        if (rec.tier === 1) {
          this.genSum += r.stats.genMs
          this.meshSum += r.stats.meshMs
          this.genCount++
        }
        this.uploads.push({ rec, layers: r.layers })
      },
      () => undefined,
    )
  }

  private remesh(rec: ChunkRecord): void {
    rec.state = ChunkState.REMESH
    const vol = this.world.buildVolume(rec.cx, rec.cz)
    const job = this.mesher.submit<MeshResult>(
      (id) => ({ type: 'mesh', id, cx: rec.cx, cz: rec.cz, volume: { ox: vol.ox, oy: vol.oy, oz: vol.oz, sx: vol.sx, sy: vol.sy, sz: vol.sz, data: vol.data, tint: vol.tint } }),
      () => this.priority(rec),
      [vol.data.buffer, vol.tint.buffer],
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
    this.disposeMeshes(rec)
    rec.meshes = createChunkMeshes(rec.cx, rec.cz, layers, this.materials, rec.tier)
    rec.triangles = 0
    for (const m of rec.meshes) {
      rec.triangles += (m.geometry.index?.count ?? 0) / 3
      this.scene.attach('world', m)
    }
    if (rec.tier === 1) {
      const c = this.world.getChunk(rec.cx, rec.cz)
      if (c) c.state = ChunkState.VISIBLE
    }
    rec.state = ChunkState.VISIBLE
  }

  private show(rec: ChunkRecord): void {
    for (const m of rec.meshes) m.visible = true
    rec.state = ChunkState.VISIBLE
  }

  private hide(rec: ChunkRecord): void {
    for (const m of rec.meshes) m.visible = false
    rec.state = ChunkState.READY
  }

  private evict(rec: ChunkRecord): void {
    this.disposeMeshes(rec)
    if (rec.tier === 1) {
      this.world.removeChunk(rec.cx, rec.cz)
      this.records.delete(rec.key)
    } else this.far.delete(rec.key)
  }

  private disposeMeshes(rec: ChunkRecord): void {
    for (const m of rec.meshes) {
      this.scene.detach(m)
      m.geometry.dispose()
    }
    rec.meshes = []
  }

  private setMask(cx: number, cz: number, on: boolean): void {
    const x = cx - this.grid.x0 / CHUNK_SIZE
    const z = cz - this.grid.z0 / CHUNK_SIZE
    const w = this.mask.image.width
    if (x < 0 || z < 0 || x >= w || z >= this.mask.image.height) return
    const val = on ? 255 : 0
    if (this.maskData[z * w + x] !== val) {
      this.maskData[z * w + x] = val
      this.maskDirty = true
    }
  }

  /** 当前范围内是否全部就绪 */
  get settled(): boolean {
    for (const map of [this.records, this.far])
      for (const r of map.values()) if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING || r.state === ChunkState.REQUESTED) return false
    return this.uploads.length === 0
  }

  stats(): ChunkManagerStats {
    const s: ChunkManagerStats = { requested: 0, generating: 0, visible: 0, cached: 0, dirty: this.dirty.size, triangles: 0, farVisible: 0, farTriangles: 0, avgGenMs: 0, avgMeshMs: 0, uploadsPending: this.uploads.length }
    for (const map of [this.records, this.far])
      for (const r of map.values()) {
        if (r.state === ChunkState.REQUESTED) s.requested++
        else if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING) s.generating++
        else if (r.state === ChunkState.VISIBLE) {
          if (r.tier === 1) {
            s.visible++
            s.triangles += r.triangles
          } else {
            s.farVisible++
            s.farTriangles += r.triangles
          }
        } else if (r.state === ChunkState.READY) s.cached++
      }
    s.avgGenMs = this.genCount ? this.genSum / this.genCount : 0
    s.avgMeshMs = this.genCount ? this.meshSum / this.genCount : 0
    return s
  }

  dispose(): void {
    for (const map of [this.records, this.far]) for (const r of map.values()) this.disposeMeshes(r)
    this.records.clear()
    this.far.clear()
    this.mask.dispose()
  }
}
