import type { WorkerPool } from '../engine/core/WorkerPool'
import type { WorkerResponse } from '../workers/protocol'
import { CHUNK_SIZE } from './coordinate/constants'
import type { WorldContext } from './generation/WorldContext'

/**
 * 预热：Worker 空闲时，把名胜周围的区块先生成好存进浏览器缓存——
 * 第一次点到这些地方也能很快出来，之后放大缩小都是直接从缓存取。
 * 顺序：手工营造的名楼名城在前，其余按诗作多少；每处近景半径 3 区块、远景半径 4 片。
 * 任何真实请求一来，预热就让开（只在队列空时投，且至多与 Worker 数相同的几件在做）。
 */
export class ChunkWarmer {
  private readonly jobs: { lod: 1 | 2; cx: number; cz: number }[] = []
  private inflight = 0
  private idleT = 0
  private started = false

  constructor(
    ctx: WorldContext,
    private readonly pool: WorkerPool,
  ) {
    const lms = [...ctx.landmarks.landmarks].sort((a, b) => {
      const ha = a.def.id.startsWith('place-') ? 1 : 0
      const hb = b.def.id.startsWith('place-') ? 1 : 0
      return ha - hb || (b.def.major ? 1 : 0) - (a.def.major ? 1 : 0) || b.def.radius - a.def.radius
    })
    const seen = new Set<string>()
    const add = (lod: 1 | 2, cx: number, cz: number) => {
      const k = `${lod}:${cx}:${cz}`
      if (seen.has(k)) return
      seen.add(k)
      this.jobs.push({ lod, cx, cz })
    }
    for (const lm of lms.slice(0, 48)) {
      const cx = Math.floor(lm.x / CHUNK_SIZE)
      const cz = Math.floor(lm.z / CHUNK_SIZE)
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz <= 10) add(1, cx + dx, cz + dz)
      const gx = Math.floor(cx / 2)
      const gz = Math.floor(cz / 2)
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= 17) add(2, gx + dx, gz + dz)
    }
  }

  /** 每帧：队列空闲一阵子后才投预热件 */
  update(dt: number): void {
    if (!this.jobs.length) return
    const st = this.pool.stats()
    if (st.queued > 0) {
      this.idleT = 0
      return
    }
    this.idleT += dt
    if (this.idleT < (this.started ? 0.3 : 2.5)) return
    this.started = true
    while (this.inflight < Math.max(1, st.workers - 1) && this.jobs.length) {
      const j = this.jobs.shift()!
      this.inflight++
      const job = this.pool.submit<WorkerResponse>((id) => ({ type: 'warm', id, lod: j.lod, cx: j.cx, cz: j.cz }), () => 1e9)
      job.promise.then(
        () => this.inflight--,
        () => this.inflight--,
      )
    }
  }

  get remaining(): number {
    return this.jobs.length
  }
}
