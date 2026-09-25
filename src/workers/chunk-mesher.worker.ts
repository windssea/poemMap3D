/// <reference lib="webworker" />
import { meshTransferables } from '../world/voxel/MeshBuffer'
import { meshVolume } from '../world/voxel/VoxelMesher'
import { VoxelVolume } from '../world/voxel/VoxelVolume'
import type { WorkerRequest, WorkerResponse } from './protocol'

/*
 * chunk-mesher.worker：只做网格化（六面剔除、贪心合并、AO、类型化数组）。
 * 用于区块内容改动后的重建（DIRTY → REMESH），输入由主线程用已加载区块拼成。
 */

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data
  if (m.type !== 'mesh') return
  try {
    const v = m.volume
    const vol = new VoxelVolume(v.ox, v.oy, v.oz, v.sx, v.sy, v.sz, v.data, v.tint)
    const r = meshVolume(vol, { skirt: 8 })
    const transfer: ArrayBuffer[] = []
    for (const l of r.layers) transfer.push(...meshTransferables(l))
    const out: WorkerResponse = { type: 'mesh', id: m.id, cx: m.cx, cz: m.cz, layers: r.layers, stats: { meshMs: r.ms, quads: r.quads } }
    self.postMessage(out, transfer)
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse)
  }
}
