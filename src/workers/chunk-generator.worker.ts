/// <reference lib="webworker" />
import { LandMask } from '../world/generation/geography/LandMask'
import { buildMacroGeography, type MacroGridData } from '../world/generation/geography/MacroGeography'
import { WorldContext } from '../world/generation/WorldContext'
import { buildOverviewTile, overviewGrid, overviewTransferables } from '../world/overview/OverviewBuilder'
import { meshTransferables } from '../world/voxel/MeshBuffer'
import { downsample2 } from '../world/voxel/VoxelDownsampler'
import { generateCoarseRegion } from '../world/generation/CoarseGenerator'
import { meshVolume } from '../world/voxel/VoxelMesher'
import type { WorkerRequest, WorkerResponse } from './protocol'

/*
 * chunk-generator.worker：地形、生物群系、方块、江河、建筑、植被、地被，并就地网格化。
 * 世界生成是世界坐标的纯函数，Worker 之间无需同步。
 */

declare const self: DedicatedWorkerGlobalScope
let ctx: WorldContext | null = null

const post = (m: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer)

const cloneMacro = (m: MacroGridData): MacroGridData => ({
  ...m,
  land: m.land.slice(),
  landSoft: m.landSoft.slice(),
  height: m.height.slice(),
  relief: m.relief.slice(),
  kind: m.kind.slice(),
})

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const m = e.data
  try {
    switch (m.type) {
      case 'init': {
        const t0 = performance.now()
        let macro = m.macro
        if (!macro) {
          macro = buildMacroGeography(LandMask.decode(m.landmask!), m.seed)
          const copy = cloneMacro(macro)
          post({ type: 'macro', macro: copy }, [copy.land.buffer, copy.landSoft.buffer, copy.height.buffer, copy.relief.buffer, copy.kind.buffer] as ArrayBuffer[])
        }
        ctx = new WorldContext({ macro, anchors: m.anchors, seed: m.seed })
        post({ type: 'ready', ms: performance.now() - t0 })
        break
      }
      case 'chunk': {
        if (!ctx) throw new Error('Worker 未初始化')
        if (m.lod === 4) {
          // 远景片：cx、cz 为片坐标（4×4 区块）
          const t0 = performance.now()
          const g = generateCoarseRegion(ctx.terrain, ctx.landmarks, ctx.trees, m.cx, m.cz)
          const genMs = performance.now() - t0
          const mesh = meshVolume(g.volume)
          const transfer: ArrayBuffer[] = []
          for (const l of mesh.layers) transfer.push(...meshTransferables(l))
          post({ type: 'chunk', id: m.id, cx: m.cx, cz: m.cz, lod: 4, data: null, layers: mesh.layers, stats: { genMs, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures } }, transfer)
          break
        }
        if (m.lod === 2) {
          const t0 = performance.now()
          const g = ctx.chunks.generateVolume(m.cx, m.cz, 2, false)
          const genMs = performance.now() - t0
          const mesh = meshVolume(downsample2(g.volume))
          const transfer: ArrayBuffer[] = []
          for (const l of mesh.layers) transfer.push(...meshTransferables(l))
          post({ type: 'chunk', id: m.id, cx: m.cx, cz: m.cz, lod: 2, data: null, layers: mesh.layers, stats: { genMs, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures } }, transfer)
          break
        }
        const g = ctx.chunks.generate(m.cx, m.cz)
        const mesh = meshVolume(g.volume)
        const data = g.chunk.toData()
        const transfer: ArrayBuffer[] = [data.heightmap.buffer as ArrayBuffer, data.biomeMap.buffer as ArrayBuffer, data.tintMap.buffer as ArrayBuffer]
        for (const s of data.sections) if (s?.blocks) transfer.push(s.blocks.buffer as ArrayBuffer)
        for (const l of mesh.layers) transfer.push(...meshTransferables(l))
        post(
          {
            type: 'chunk',
            id: m.id,
            cx: m.cx,
            cz: m.cz,
            lod: 1,
            data,
            layers: mesh.layers,
            stats: { genMs: g.ms, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures },
          },
          transfer,
        )
        break
      }
      case 'overview': {
        if (!ctx) throw new Error('Worker 未初始化')
        const tile = buildOverviewTile(ctx, overviewGrid(ctx), m.tx, m.tz)
        post({ type: 'overview', id: m.id, tile }, overviewTransferables(tile))
        break
      }
      case 'mesh': {
        throw new Error('网格重建请发给 chunk-mesher.worker')
      }
    }
  } catch (err) {
    post({ type: 'error', id: 'id' in m ? m.id : undefined, message: err instanceof Error ? err.message : String(err) })
  }
}
