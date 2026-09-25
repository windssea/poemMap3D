import type { ChunkData } from '../world/chunk/Chunk'
import type { MacroGridData } from '../world/generation/geography/MacroGeography'
import type { PlaceAnchor } from '../world/landmark/LandmarkDefinition'
import type { OverviewTileData } from '../world/overview/OverviewBuilder'
import type { MeshLayerData } from '../world/voxel/MeshBuffer'

/* ============ 主线程 → Worker ============ */

export interface InitRequest {
  type: 'init'
  /** 有宏观网格就直接用；否则由这个 Worker 从掩膜算出并回传 */
  macro?: MacroGridData
  landmask?: ArrayBuffer
  anchors: PlaceAnchor[]
  seed: number
}

export interface ChunkRequest {
  type: 'chunk'
  id: number
  cx: number
  cz: number
  /** 1 = 近景原分辨率；2 = 远景（2×2×2 合并）；4 = 远景片（4×4 区块、4×4×4 合并，cx/cz 为片坐标） */
  lod: 1 | 2 | 4
}

export interface OverviewRequest {
  type: 'overview'
  id: number
  tx: number
  tz: number
}

export interface MeshRequest {
  type: 'mesh'
  id: number
  cx: number
  cz: number
  volume: { ox: number; oy: number; oz: number; sx: number; sy: number; sz: number; data: Uint16Array; tint: Uint8Array }
}

export type WorkerRequest = InitRequest | ChunkRequest | OverviewRequest | MeshRequest

/* ============ Worker → 主线程 ============ */

export interface ChunkResult {
  type: 'chunk'
  id: number
  cx: number
  cz: number
  /** 远景区块不回传方块数据 */
  data: ChunkData | null
  lod: 1 | 2 | 4
  layers: MeshLayerData[]
  stats: { genMs: number; meshMs: number; quads: number; trees: number; structures: number }
}

export interface MeshResult {
  type: 'mesh'
  id: number
  cx: number
  cz: number
  layers: MeshLayerData[]
  stats: { meshMs: number; quads: number }
}

export interface OverviewResult {
  type: 'overview'
  id: number
  tile: OverviewTileData
}

export type WorkerResponse =
  | { type: 'macro'; macro: MacroGridData }
  | { type: 'ready'; ms: number }
  | { type: 'error'; id?: number; message: string }
  | ChunkResult
  | MeshResult
  | OverviewResult
