import * as THREE from 'three'
import type { WorkerPool } from '../../engine/core/WorkerPool'
import type { MaterialLibrary } from '../../engine/rendering/MaterialLibrary'
import type { SceneManager } from '../../engine/rendering/SceneManager'
import type { ChunkResult, MeshResult } from '../../workers/protocol'
import { CHUNK_SIZE, WORLD_HEIGHT } from '../coordinate/constants'
import { chunkKey } from '../coordinate/coords'
import { REGION_CHUNKS } from '../generation/CoarseGenerator'
import type { OverviewGrid } from '../overview/OverviewBuilder'
import type { MeshLayerData } from '../voxel/MeshBuffer'
import type { World } from '../World'
import { Chunk, ChunkState } from './Chunk'
import { createChunkMeshes } from './ChunkMeshFactory'

/** 近景（原分辨率）、远景（2×2×2 合并）、远景片（4×4 区块一片，4×4×4 合并）三级 */
export type ChunkTier = 1 | 2 | 4

export interface ChunkRecord {
  /** 区块坐标；远景片为片坐标 */
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
  regionVisible: number
  regionTriangles: number
  avgGenMs: number
  avgMeshMs: number
  uploadsPending: number
}

/** 掩膜取值：近景 / 远景区块已显示；只有远景片 */
const MASK_FINE = 255
const MASK_REGION = 128
const RC = REGION_CHUNKS

/**
 * 区块管理：流式加载、生成队列、网格队列、Worker 调度、缓存与卸载、脏区传播与重建、GPU 上传节流、覆盖图掩膜。
 *
 * 三级，由近及远：
 *  - 近景：焦点周围半径 R 内的原分辨率区块；
 *  - 远景：R 到 F 之间，同一份生成结果按 2×2×2 合并；
 *  - 远景片：F 到 C 之间，每 4×4 区块一片、每 4 方块取一列地形，树与建筑按格合并——铺满整个画面；
 *  - 再外面才由全国覆盖图补上。
 * 每级在更细一级已显示处按掩膜让位（片内按区块镂空），装好即整块显示，不淡入，拖动时不露天色。
 *
 * 调度：视锥内的一律先做（先近景、再远景、再远景片），视锥外的随后；
 * 焦点按镜头移动速度前移（预读前方），飞行时目的地周围提前排队。
 */
export class ChunkManager {
  /** 近景区块 */
  readonly records = new Map<number, ChunkRecord>()
  /** 远景区块 */
  readonly far = new Map<number, ChunkRecord>()
  /** 远景片 */
  readonly regions = new Map<number, ChunkRecord>()
  private readonly uploads: { rec: ChunkRecord; layers: MeshLayerData[] }[] = []
  private readonly dirty = new Set<number>()
  private focusCx = 0
  private focusCz = 0
  private radius = 0
  private farRadius = 0
  private coarseRadius = 0
  /** 预读：飞行目的地（区块坐标）与半径 */
  private pre: { cx: number; cz: number; r: number } | null = null
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
  maxRegionCached = 1200

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

  /** 焦点（方块坐标）与三级半径（区块）；radius 为 0 表示全国视角 */
  setFocus(x: number, z: number, radius: number, farRadius: number, coarseRadius: number, camera?: THREE.Camera): void {
    this.focusCx = Math.floor(x / CHUNK_SIZE)
    this.focusCz = Math.floor(z / CHUNK_SIZE)
    this.radius = radius
    this.farRadius = radius > 0 ? Math.max(radius, farRadius) : 0
    this.coarseRadius = radius > 0 ? Math.max(this.farRadius, coarseRadius) : 0
    if (camera) {
      camera.updateMatrixWorld()
      this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    }
  }

  /** 预读目的地（方块坐标）；null 取消 */
  prefetch(x: number, z: number, radius: number): void
  prefetch(off: null): void
  prefetch(x: number | null, z = 0, radius = 0): void {
    this.pre = x === null || radius <= 0 ? null : { cx: Math.floor(x / CHUNK_SIZE), cz: Math.floor(z / CHUNK_SIZE), r: radius }
  }

  /** 记录中心（区块坐标）与跨度 */
  private center(rec: ChunkRecord): [number, number] {
    return rec.tier === 4 ? [rec.cx * RC + RC / 2, rec.cz * RC + RC / 2] : [rec.cx, rec.cz]
  }

  private priority(rec: ChunkRecord): number {
    const [cx, cz] = this.center(rec)
    let d = (cx - this.focusCx) ** 2 + (cz - this.focusCz) ** 2
    if (this.pre) d = Math.min(d, (cx - this.pre.cx) ** 2 + (cz - this.pre.cz) ** 2 + 40)
    const span = rec.tier === 4 ? RC : 1
    const x0 = (rec.tier === 4 ? rec.cx * RC : rec.cx) * CHUNK_SIZE
    const z0 = (rec.tier === 4 ? rec.cz * RC : rec.cz) * CHUNK_SIZE
    this.box.min.set(x0, 0, z0)
    this.box.max.set(x0 + span * CHUNK_SIZE, WORLD_HEIGHT, z0 + span * CHUNK_SIZE)
    const p = d + (rec.tier === 2 ? 3000 : rec.tier === 4 ? 6000 : 0)
    return this.frustum.intersectsBox(this.box) ? p : p * 2 + 100000
  }

  /** 到焦点（或预读点）的平方距离（区块） */
  private dist2(rec: { cx: number; cz: number }): number {
    const dx = rec.cx - this.focusCx
    const dz = rec.cz - this.focusCz
    return dx * dx + dz * dz
  }

  private nearPre(rec: { cx: number; cz: number }, r: number): boolean {
    return !!this.pre && (rec.cx - this.pre.cx) ** 2 + (rec.cz - this.pre.cz) ** 2 <= r * r
  }

  /** 远景片到焦点的最近与最远平方距离（区块） */
  private regionDist(rx: number, rz: number): [number, number] {
    const ax = rx * RC - this.focusCx
    const bx = ax + RC - 1
    const az = rz * RC - this.focusCz
    const bz = az + RC - 1
    const nx = ax > 0 ? ax : bx < 0 ? bx : 0
    const nz = az > 0 ? az : bz < 0 ? bz : 0
    const fx = Math.max(Math.abs(ax), Math.abs(bx))
    const fz = Math.max(Math.abs(az), Math.abs(bz))
    return [nx * nx + nz * nz, fx * fx + fz * fz]
  }

  update(_dt: number): void {
    this.frame++
    const R = this.radius
    const F = this.farRadius
    const C = this.coarseRadius

    /* 1. 需要的区块：近景圆内、远景环内（与近景重叠一圈，不留缝）、远景片环内 */
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
    if (this.pre) {
      /* 飞行目的地：近景先排上队，到达时已大半就绪 */
      const { cx: px, cz: pz, r } = this.pre
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r || !this.inBounds(px + dx, pz + dz)) continue
          const k = chunkKey(px + dx, pz + dz)
          const old = this.records.get(k)
          if (old) old.lastSeen = this.frame
          else this.want(this.records, k, px + dx, pz + dz, 1)
        }
    }
    if (C > 0) {
      const rr = Math.ceil(C / RC) + 1
      const frx = Math.floor(this.focusCx / RC)
      const frz = Math.floor(this.focusCz / RC)
      for (let dz = -rr; dz <= rr; dz++)
        for (let dx = -rr; dx <= rr; dx++) {
          const rx = frx + dx
          const rz = frz + dz
          const [dmin, dmax] = this.regionDist(rx, rz)
          if (dmin > C * C || dmax < (F - 1) * (F - 1)) continue
          if (!this.inBounds(rx * RC, rz * RC) && !this.inBounds(rx * RC + RC - 1, rz * RC + RC - 1)) continue
          this.want(this.regions, chunkKey(rx, rz), rx, rz, 4)
        }
    }

    /* 2. 超出范围：隐藏（保留缓存）；仍在排队的直接取消 */
    this.retire(this.records, R > 0 ? (R + 2) * (R + 2) : -1)
    this.retire(this.far, F > 0 ? (F + 3) * (F + 3) : -1)
    this.retireRegions()

    /* 3. GPU 上传节流：近景优先，按时间预算，远景小块时间允许就多传 */
    this.uploads.sort((a, b) => a.rec.tier - b.rec.tier)
    const t0 = performance.now()
    for (let i = 0; this.uploads.length && (i < this.uploadsPerFrame || performance.now() - t0 < 5); i++) {
      const u = this.uploads.shift()!
      if (this.mapOf(u.rec.tier).get(u.rec.key) !== u.rec) continue
      this.install(u.rec, u.layers)
    }

    /* 4. 远景让位给已显示的近景；远景片与覆盖图按掩膜让位 */
    for (const f of this.far.values()) {
      if (f.state !== ChunkState.VISIBLE && f.state !== ChunkState.READY) continue
      const inRange = F > 0 && this.dist2(f) <= (F + 3) * (F + 3)
      const d = this.records.get(f.key)
      const covered = !!d && d.state === ChunkState.VISIBLE
      const show = inRange && !covered
      for (const m of f.meshes) m.visible = show
      f.state = show ? ChunkState.VISIBLE : ChunkState.READY
    }
    for (const r of this.records.values()) this.refreshMask(r.cx, r.cz)
    for (const f of this.far.values()) this.refreshMask(f.cx, f.cz)
    for (const g of this.regions.values()) for (let j = 0; j < RC; j++) for (let i = 0; i < RC; i++) this.refreshMask(g.cx * RC + i, g.cz * RC + j)
    if (this.maskDirty) {
      this.mask.needsUpdate = true
      this.maskDirty = false
    }

    /* 5. 缓存上限：最久未见的先释放 */
    this.trim(this.records, this.maxCached)
    this.trim(this.far, this.maxFarCached)
    this.trim(this.regions, this.maxRegionCached)

    /* 6. 脏区块重建（只有近景存方块数据） */
    for (const k of this.dirty) {
      const rec = this.records.get(k)
      this.dirty.delete(k)
      if (!rec || (rec.state !== ChunkState.VISIBLE && rec.state !== ChunkState.READY)) continue
      this.remesh(rec)
    }
  }

  private mapOf(tier: ChunkTier): Map<number, ChunkRecord> {
    return tier === 1 ? this.records : tier === 2 ? this.far : this.regions
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
    if (tier !== 2 && rec.state === ChunkState.READY) this.show(rec)
  }

  private retire(map: Map<number, ChunkRecord>, out2: number): void {
    for (const rec of map.values()) {
      if (this.dist2(rec) <= out2) continue
      // 预读的目的地区块：排着队的留着，已装好的先藏起来
      const pre = rec.tier === 1 && this.nearPre(rec, this.pre?.r ?? 0)
      if (rec.state === ChunkState.REQUESTED || rec.state === ChunkState.GENERATING) {
        if (pre) continue
        rec.cancel?.()
        map.delete(rec.key)
      } else if (rec.state === ChunkState.VISIBLE && rec.tier === 1) {
        // 远景替身装好之前近景先别撤，免得露出底下的远景片或覆盖图
        const f = this.far.get(rec.key)
        const farReady = !!f && f.meshes.length > 0
        const beyondFar = this.dist2(rec) > (this.farRadius + 3) * (this.farRadius + 3)
        if (farReady || beyondFar || this.radius === 0 || pre) this.hide(rec)
      }
    }
  }

  private retireRegions(): void {
    const C = this.coarseRadius
    const F = this.farRadius
    for (const rec of this.regions.values()) {
      const [dmin, dmax] = this.regionDist(rec.cx, rec.cz)
      const out = C === 0 || dmin > (C + 6) * (C + 6)
      // 整片都落在远景环里且那一圈已显示：藏起来省绘制
      const inner = !out && dmax < (F - 3) * (F - 3) && this.covered(rec)
      if (!out && !inner) continue
      if (rec.state === ChunkState.REQUESTED || rec.state === ChunkState.GENERATING) {
        rec.cancel?.()
        this.regions.delete(rec.key)
      } else if (rec.state === ChunkState.VISIBLE) this.hide(rec)
    }
  }

  private covered(rec: ChunkRecord): boolean {
    for (let j = 0; j < RC; j++)
      for (let i = 0; i < RC; i++) {
        const k = chunkKey(rec.cx * RC + i, rec.cz * RC + j)
        if (this.records.get(k)?.state !== ChunkState.VISIBLE && this.far.get(k)?.state !== ChunkState.VISIBLE) return false
      }
    return true
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
    const map = this.mapOf(rec.tier)
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
    // 远景片的网格原点在片的西北角：换算成区块坐标交给工厂
    const ox = rec.tier === 4 ? rec.cx * RC : rec.cx
    const oz = rec.tier === 4 ? rec.cz * RC : rec.cz
    rec.meshes = createChunkMeshes(ox, oz, layers, this.materials, rec.tier)
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
    // 预读装好但还不在近景圈里的：先藏着
    if (rec.tier === 1 && this.dist2(rec) > (this.radius + 2) * (this.radius + 2)) this.hide(rec)
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
    } else if (rec.tier === 2) this.far.delete(rec.key)
    else this.regions.delete(rec.key)
  }

  private disposeMeshes(rec: ChunkRecord): void {
    for (const m of rec.meshes) {
      this.scene.detach(m)
      m.geometry.dispose()
    }
    rec.meshes = []
  }

  /** 一个区块的掩膜：近景 / 远景已显示 → 255；只有远景片 → 128；都没有 → 0 */
  private refreshMask(cx: number, cz: number): void {
    const k = chunkKey(cx, cz)
    let val = 0
    if (this.records.get(k)?.state === ChunkState.VISIBLE || this.far.get(k)?.state === ChunkState.VISIBLE) val = MASK_FINE
    else if (this.regions.get(chunkKey(Math.floor(cx / RC), Math.floor(cz / RC)))?.state === ChunkState.VISIBLE) val = MASK_REGION
    const x = cx - this.grid.x0 / CHUNK_SIZE
    const z = cz - this.grid.z0 / CHUNK_SIZE
    const w = this.mask.image.width
    if (x < 0 || z < 0 || x >= w || z >= this.mask.image.height) return
    if (this.maskData[z * w + x] !== val) {
      this.maskData[z * w + x] = val
      this.maskDirty = true
    }
  }

  /** 当前范围内是否全部就绪 */
  get settled(): boolean {
    for (const map of [this.records, this.far, this.regions])
      for (const r of map.values()) if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING || r.state === ChunkState.REQUESTED) return false
    return this.uploads.length === 0
  }

  stats(): ChunkManagerStats {
    const s: ChunkManagerStats = {
      requested: 0,
      generating: 0,
      visible: 0,
      cached: 0,
      dirty: this.dirty.size,
      triangles: 0,
      farVisible: 0,
      farTriangles: 0,
      regionVisible: 0,
      regionTriangles: 0,
      avgGenMs: 0,
      avgMeshMs: 0,
      uploadsPending: this.uploads.length,
    }
    for (const map of [this.records, this.far, this.regions])
      for (const r of map.values()) {
        if (r.state === ChunkState.REQUESTED) s.requested++
        else if (r.state === ChunkState.GENERATING || r.state === ChunkState.MESHING) s.generating++
        else if (r.state === ChunkState.VISIBLE) {
          if (r.tier === 1) {
            s.visible++
            s.triangles += r.triangles
          } else if (r.tier === 2) {
            s.farVisible++
            s.farTriangles += r.triangles
          } else {
            s.regionVisible++
            s.regionTriangles += r.triangles
          }
        } else if (r.state === ChunkState.READY) s.cached++
      }
    s.avgGenMs = this.genCount ? this.genSum / this.genCount : 0
    s.avgMeshMs = this.genCount ? this.meshSum / this.genCount : 0
    return s
  }

  dispose(): void {
    for (const map of [this.records, this.far, this.regions]) for (const r of map.values()) this.disposeMeshes(r)
    this.records.clear()
    this.far.clear()
    this.regions.clear()
    this.mask.dispose()
  }
}
