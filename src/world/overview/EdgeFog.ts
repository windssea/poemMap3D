import { smoothstep } from '../../utils/math'
import { getProjection } from '../coordinate/GeoProjection'
import { type MacroSampler, SOUTH_LIMIT_LAT } from '../generation/geography/MacroGeography'

/** 海面离岸多远开始起雾、多远全隐（方块） */
const SEA_CLEAR = 50
const SEA_GONE = 210
/** 地图四边向内的雾带宽（方块） */
const EDGE_BAND = 380

export interface FogMap {
  data: Uint8Array
  w: number
  h: number
  x0: number
  z0: number
  cell: number
}

/**
 * 边缘雾：让画面像一幅手卷，只留一小段海岸，四周渐隐入雾。
 *  - 海：按离最近陆地的距离（倒角距离变换），岸边清楚，离岸约两百格全隐；
 *  - 地图四边：向内一段雾带，西、北的境外与图边都化进雾里。
 * 以宏观网格分辨率存成一张图：着色器取样混雾，区块流式加载据此跳过全隐处。
 */
export function buildFogMap(M: MacroSampler): FogMap {
  const { w, h, cell, x0, z0 } = M.d
  const INF = 1e9
  const dist = new Float32Array(w * h)
  for (let k = 0; k < w * h; k++) dist[k] = M.d.land[k] ? 0 : INF
  /* 两遍倒角距离（1 与 √2） */
  const D2 = Math.SQRT2
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      let v = dist[k]
      if (i > 0) v = Math.min(v, dist[k - 1] + 1)
      if (j > 0) {
        v = Math.min(v, dist[k - w] + 1)
        if (i > 0) v = Math.min(v, dist[k - w - 1] + D2)
        if (i < w - 1) v = Math.min(v, dist[k - w + 1] + D2)
      }
      dist[k] = v
    }
  for (let j = h - 1; j >= 0; j--)
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i
      let v = dist[k]
      if (i < w - 1) v = Math.min(v, dist[k + 1] + 1)
      if (j < h - 1) {
        v = Math.min(v, dist[k + w] + 1)
        if (i < w - 1) v = Math.min(v, dist[k + w + 1] + D2)
        if (i > 0) v = Math.min(v, dist[k + w - 1] + D2)
      }
      dist[k] = v
    }
  const P = getProjection()
  const southClear = P.project(110, SOUTH_LIMIT_LAT + 0.25).z
  const southGone = P.project(110, SOUTH_LIMIT_LAT - 0.55).z
  const data = new Uint8Array(w * h)
  const W = w * cell
  const H = h * cell
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      const sea = smoothstep(SEA_CLEAR, SEA_GONE, dist[k] * cell)
      const bx = Math.min(i * cell, W - (i + 1) * cell)
      const bz = Math.min(j * cell, H - (j + 1) * cell)
      const edge = 1 - smoothstep(0, EDGE_BAND, Math.min(bx, bz))
      // 海南以南：整片入雾
      const south = smoothstep(southClear, southGone, z0 + (j + 0.5) * cell)
      data[k] = Math.round(255 * Math.max(sea, edge, south))
    }
  return { data, w, h, x0, z0, cell }
}

/**
 * 镜头可去的范围：雾量低于一半的格子的外包矩形（再收一点），镜头目标点夹在其中，
 * 南边止于海南，西、北不进边雾。
 */
export function fogBounds(f: FogMap): { minX: number; minZ: number; maxX: number; maxZ: number } {
  let i0 = f.w
  let i1 = -1
  let j0 = f.h
  let j1 = -1
  for (let j = 0; j < f.h; j++)
    for (let i = 0; i < f.w; i++)
      if (f.data[j * f.w + i] < 128) {
        if (i < i0) i0 = i
        if (i > i1) i1 = i
        if (j < j0) j0 = j
        if (j > j1) j1 = j
      }
  return { minX: f.x0 + i0 * f.cell, minZ: f.z0 + j0 * f.cell, maxX: f.x0 + (i1 + 1) * f.cell, maxZ: f.z0 + (j1 + 1) * f.cell }
}

/** 取某点的雾量 0..1（最近格，供流式加载判断） */
export function fogAt(f: FogMap, x: number, z: number): number {
  const i = Math.floor((x - f.x0) / f.cell)
  const j = Math.floor((z - f.z0) / f.cell)
  if (i < 0 || j < 0 || i >= f.w || j >= f.h) return 1
  return f.data[j * f.w + i] / 255
}
