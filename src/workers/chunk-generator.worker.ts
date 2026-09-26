/// <reference lib="webworker" />
import { LandMask } from '../world/generation/geography/LandMask'
import { buildMacroGeography, type MacroGridData } from '../world/generation/geography/MacroGeography'
import { WorldContext } from '../world/generation/WorldContext'
import { buildOverviewTile, overviewGrid, overviewTransferables } from '../world/overview/OverviewBuilder'
import { meshTransferables } from '../world/voxel/MeshBuffer'
import { downsample2 } from '../world/voxel/VoxelDownsampler'
import { generateCoarseRegion } from '../world/generation/CoarseGenerator'
import { meshVolume } from '../world/voxel/VoxelMesher'
import { VoxelVolume } from '../world/voxel/VoxelVolume'
import { WORLD_HEIGHT } from '../world/coordinate/constants'
import { ChunkStore } from './ChunkStore'
import type { ChunkResult, WorkerRequest, WorkerResponse } from './protocol'

/*
 * chunk-generator.worker：地形、生物群系、方块、江河、建筑、植被、地被，并就地网格化。
 * 世界生成是世界坐标的纯函数，Worker 之间无需同步。
 */

declare const self: DedicatedWorkerGlobalScope
let ctx: WorldContext | null = null

const post = (m: WorkerResponse, transfer: Transferable[] = []) => self.postMessage(m, transfer)

/* ============ 区块：先查浏览器缓存，没有才生成（生成完存一份） ============ */

const store = new ChunkStore(typeof __WORLD_BUILD__ === 'string' ? __WORLD_BUILD__ : 'dev')
type Built = Omit<ChunkResult, 'id'>

function transfersOf(r: Built): ArrayBuffer[] {
  const t: ArrayBuffer[] = []
  if (r.data) {
    t.push(r.data.heightmap.buffer as ArrayBuffer, r.data.biomeMap.buffer as ArrayBuffer, r.data.tintMap.buffer as ArrayBuffer)
    for (const s of r.data.sections) if (s?.blocks) t.push(s.blocks.buffer as ArrayBuffer)
  }
  for (const l of r.layers) t.push(...meshTransferables(l))
  return t
}

function build(lod: 1 | 2 | 4, cx: number, cz: number): Built {
  const c = ctx!
  if (lod === 4) {
    // 远景片：cx、cz 为片坐标
    const t0 = performance.now()
    const g = generateCoarseRegion(c.terrain, c.landmarks, c.trees, cx, cz)
    const genMs = performance.now() - t0
    const mesh = meshVolume(g.volume, { skirt: 3 })
    return { type: 'chunk', cx, cz, lod: 4, data: null, layers: mesh.layers, stats: { genMs, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures } }
  }
  if (lod === 2) {
    const t0 = performance.now()
    // 远景：cx、cz 为 2×2 区块一片的片坐标；外扩 2 格，合并后正好 1 格外边
    const g = c.chunks.generateArea(new VoxelVolume(cx * 32 - 2, 0, cz * 32 - 2, 36, WORLD_HEIGHT, 36), false)
    const genMs = performance.now() - t0
    const mesh = meshVolume(downsample2(g.volume), { skirt: 4 })
    return { type: 'chunk', cx, cz, lod: 2, data: null, layers: mesh.layers, stats: { genMs, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures } }
  }
  const g = c.chunks.generate(cx, cz)
  const mesh = meshVolume(g.volume, { skirt: 8 })
  return { type: 'chunk', cx, cz, lod: 1, data: g.chunk.toData(), layers: mesh.layers, stats: { genMs: g.ms, meshMs: mesh.ms, quads: mesh.quads, trees: g.trees, structures: g.structures } }
}

async function serveChunk(id: number, lod: 1 | 2 | 4, cx: number, cz: number): Promise<void> {
  try {
    const key = store.key(lod, cx, cz)
    let r = await store.get<Built>(key)
    if (r) r = { ...r, stats: { ...r.stats, genMs: 0, meshMs: 0 } }
    else {
      r = build(lod, cx, cz)
      await store.put(key, r) // put 时已克隆，之后才能转移缓冲区
    }
    post({ ...r, id }, transfersOf(r))
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}

/** 预热：空闲时把名胜周围的区块先生成好存进缓存（不回传网格） */
async function warmChunk(id: number, lod: 1 | 2 | 4, cx: number, cz: number): Promise<void> {
  try {
    const key = store.key(lod, cx, cz)
    if (!(await store.has(key))) await store.put(key, build(lod, cx, cz))
    post({ type: 'warm', id })
  } catch (err) {
    post({ type: 'error', id, message: err instanceof Error ? err.message : String(err) })
  }
}

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
        void serveChunk(m.id, m.lod, m.cx, m.cz)
        break
      }
      case 'warm': {
        if (!ctx) throw new Error('Worker 未初始化')
        void warmChunk(m.id, m.lod, m.cx, m.cz)
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
