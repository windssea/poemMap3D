import { clamp, lerp, smoothstep } from '../../../utils/math'
import { createSimplex2D, fbm, ridged } from '../../../utils/noise'
import { pointInPolygon, segmentDistance, type Vec2 } from '../../../utils/geometry2d'
import { type FocusProjection, getProjection } from '../../coordinate/GeoProjection'
import { WorldConfig, metersToY } from '../../WorldConfig'
import { ELEVATION_ANCHORS, type GeoLine, PEAKS, RANGES, REGIONS, type RegionKind, SEA_POLYGONS } from './GeographyData'
import type { LandMask } from './LandMask'

export const MacroKind = { Normal: 0, Desert: 1, Loess: 2, Gobi: 3, Plateau: 4, Steppe: 5, Plain: 6 } as const
export type MacroKind = (typeof MacroKind)[keyof typeof MacroKind]
const KIND_OF: Record<RegionKind, MacroKind> = { desert: 1, loess: 2, gobi: 3, plateau: 4, steppe: 5, plain: 6 }

/** 可在 Worker 间传递的宏观地理网格 */
export interface MacroGridData {
  w: number
  h: number
  cell: number
  /** 网格 (0,0) 左上角的世界方块坐标 */
  x0: number
  z0: number
  /** 1 陆地 / 0 海 */
  land: Uint8Array
  /** 柔化后的陆地比例（0–1），方块级海岸线据此插值 */
  landSoft: Float32Array
  /** 地表高度（方块 Y，浮点） */
  height: Float32Array
  /** 局部起伏（方块）：驱动细节噪声幅度 */
  relief: Float32Array
  kind: Uint8Array
}

/**
 * 宏观地理：Geography → Land Mask → Macro Height → Mountain Range → Noise → Erosion。
 * 在粗网格（每格 8 方块）上一次性算出全国地势，区块生成时双线性插值再叠加方块级细节。
 */
export function buildMacroGeography(mask: LandMask, seed: number = WorldConfig.seed): MacroGridData {
  const P = getProjection()
  const B = WorldConfig.bounds
  const cell = WorldConfig.macroCell
  const x0 = Math.floor(P.projectLng(B.lngMin) / cell) * cell
  const x1 = Math.ceil(P.projectLng(B.lngMax) / cell) * cell
  const z0 = Math.floor(P.projectLat(B.latMax) / cell) * cell
  const z1 = Math.ceil(P.projectLat(B.latMin) / cell) * cell
  const w = (x1 - x0) / cell
  const h = (z1 - z0) / cell
  const N = w * h
  const cxOf = (i: number) => x0 + (i + 0.5) * cell
  const czOf = (j: number) => z0 + (j + 0.5) * cell
  const lngs = Float64Array.from({ length: w }, (_, i) => P.lngOf(cxOf(i)))
  const lats = Float64Array.from({ length: h }, (_, j) => P.latOf(czOf(j)))
  const deg2cells = (d: number) => (d * WorldConfig.projection.blocksPerDegree * 0.8) / cell

  const nA = createSimplex2D(seed + 11)
  const nB = createSimplex2D(seed + 23)
  const nC = createSimplex2D(seed + 37)
  const nD = createSimplex2D(seed + 51)

  /* —— 陆地 —— */
  const land = new Uint8Array(N)
  const seaPolys = SEA_POLYGONS.map((poly) => projectLine(P, poly))
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const m = mask.sample(lngs[i], lats[j])
      if (m === 1) land[j * w + i] = 1
      else {
        const x = cxOf(i)
        const z = czOf(j)
        land[j * w + i] = seaPolys.some((p) => pointInPolygon(x, z, p)) ? 0 : 1
      }
    }
  const landSoft = blur(Float32Array.from(land), w, h, deg2cells(0.12))
  const landBlur = blur(Float32Array.from(land), w, h, deg2cells(0.5))
  const coastFade = blur(Float32Array.from(land), w, h, deg2cells(1.1))

  /* —— 区域：高原、盆地、平原、荒漠 —— */
  const base = new Float32Array(N).fill(160)
  const amp = new Float32Array(N).fill(430)
  const kind = new Uint8Array(N)
  const kindW = new Float32Array(N)
  const caps: [Float32Array, number][] = []
  for (const r of REGIONS) {
    const poly = projectLine(P, r.polygon)
    const raw = rasterPolygon(poly, w, h, x0, z0, cell)
    const m = blur(Float32Array.from(raw), w, h, deg2cells(r.blur))
    if (r.kind === 'plain' || (r.elevation != null && r.elevation < 500 && !r.kind)) caps.push([blur(Float32Array.from(raw), w, h, deg2cells(0.12)), r.elevation ?? 0])
    for (let k = 0; k < N; k++) {
      const t = m[k]
      if (t <= 0) continue
      if (r.elevation != null) base[k] = lerp(base[k], r.elevation, t)
      if (r.relief != null) amp[k] = lerp(amp[k], r.relief, t)
      if (r.kind && raw[k] > 0.5 && t > kindW[k] * 0.9) {
        kind[k] = KIND_OF[r.kind]
        kindW[k] = t
      }
    }
  }

  /* —— 起伏噪声 —— */
  const E = new Float32Array(N)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      const x = cxOf(i)
      const z = czOf(j)
      let n = fbm(nA, x * 0.0027, z * 0.0027, 5) * 0.5 + 0.5
      n = Math.pow(clamp(n, 0, 1), 1.35)
      let e = base[k] + amp[k] * n * 1.25 - amp[k] * 0.18
      if (kind[k] === MacroKind.Desert) e += 90 * Math.pow(1 - Math.abs(nB(x * 0.012 + nC(x * 0.004, z * 0.004) * 1.5, z * 0.027)), 3)
      if (kind[k] === MacroKind.Gobi || kind[k] === MacroKind.Steppe) e += 110 * Math.pow(0.5 + 0.5 * nB(x * 0.0085 + nC(x * 0.003, z * 0.003), z * 0.01), 2)
      if (base[k] < 600) e += 38 * nA(x * 0.038, z * 0.038) * (1 - smoothstep(300, 600, base[k]))
      E[k] = e
    }

  /* —— 山脉与名山：沿折线的高斯隆起 × 脊状噪声 —— */
  const ridgeN = (x: number, z: number) => ridged(nB, x * 0.0046, z * 0.0046, 3)
  for (const r of RANGES) {
    const mid = r.line[r.line.length >> 1]
    const hw = r.halfWidth * WorldConfig.projection.blocksPerDegree * P.scaleAt(mid[0], mid[1])
    forPolyline(projectLine(P, r.line), hw * 2.6, w, h, x0, z0, cell, (k, d) => {
      const x = cxOf(k % w)
      const z = czOf((k / w) | 0)
      const fall = Math.exp(-(d / hw) * (d / hw) * 1.1)
      const along = 0.62 + 0.38 * (0.5 + 0.5 * nD(x * 0.0038, z * 0.0038))
      E[k] += r.height * fall * along * (0.38 + 0.8 * ridgeN(x, z))
    })
  }
  for (const p of PEAKS) {
    const hw = Math.max(0.3, p.halfWidth * 1.6) * WorldConfig.projection.blocksPerDegree * 0.62 * P.scaleAt(p.lng, p.lat)
    const c = P.project(p.lng, p.lat)
    forPolyline(
      [
        [c.x, c.z],
        [c.x + 0.01, c.z],
      ],
      hw * 2.6,
      w,
      h,
      x0,
      z0,
      cell,
      (k, d) => {
        const x = cxOf(k % w)
        const z = czOf((k / w) | 0)
        E[k] += p.height * 0.8 * Math.exp(-(d / hw) * (d / hw) * 1.3) * (0.55 + 0.6 * ridgeN(x * 1.3, z * 1.3))
      },
    )
  }
  /* 平原与盆地压住山势，山前界线分明 */
  for (const [m, eh] of caps) for (let k = 0; k < N; k++) if (m[k] > 0) E[k] = lerp(E[k], Math.min(E[k], eh + 140 + amp[k] * 0.3), m[k])
  /* 去掉单格尖柱 */
  {
    const T = Float32Array.from(E)
    for (let j = 1; j < h - 1; j++)
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i
        const a = (T[k - 1] + T[k + 1] + T[k - w] + T[k + w]) * 0.1 + (T[k - w - 1] + T[k - w + 1] + T[k + w - 1] + T[k + w + 1]) * 0.05
        E[k] = T[k] * 0.4 + a
      }
  }

  /* —— 海拔 → 方块高度；近海地势渐低成滩 —— */
  const el = WorldConfig.elevation
  const height = new Float32Array(N)
  for (let k = 0; k < N; k++) {
    if (land[k]) {
      const f = smoothstep(0.45, 0.9, coastFade[k])
      const m = E[k] * (0.08 + 0.92 * f) + 20 * (1 - f)
      height[k] = Math.min(el.maxY, metersToY(m))
    } else {
      const x = cxOf(k % w)
      const z = czOf((k / w) | 0)
      height[k] = el.seaLevel - el.seaDepthMin - (1 - landBlur[k]) * (el.seaDepthMax - el.seaDepthMin) - 2 * Math.abs(nC(x * 0.006, z * 0.006))
    }
  }

  /* —— 热侵蚀：相邻格落差超过安息角时削高补低；安息角随噪声变化，保留少量陡崖 —— */
  const talus = new Float32Array(N)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) talus[j * w + i] = cell * lerp(0.9, 2.2, 0.5 + 0.5 * nD(cxOf(i) * 0.004, czOf(j) * 0.004))
  for (let it = 0; it < 6; it++) {
    for (let j = 1; j < h - 1; j++)
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i
        if (!land[k]) continue
        for (const nk of [k - 1, k + 1, k - w, k + w]) {
          const d = height[k] - height[nk]
          if (d > talus[k] && land[nk]) {
            const mv = (d - talus[k]) * 0.25
            height[k] -= mv
            height[nk] += mv
          }
        }
      }
  }

  /* —— 海拔校准：名山主峰与城市盆地对齐实测海拔（高斯加权，迭代收敛） —— */
  {
    const anchors = ELEVATION_ANCHORS.map((a) => {
      const c = P.project(a.lng, a.lat)
      return { gi: (c.x - x0) / cell - 0.5, gj: (c.z - z0) / cell - 0.5, y: metersToY(a.meters), r: Math.max(1.5, (a.radius * WorldConfig.projection.blocksPerDegree * P.scaleAt(a.lng, a.lat)) / cell) }
    })
    const sampleH = (gi: number, gj: number) => {
      const i = clamp(Math.floor(gi), 0, w - 2)
      const j = clamp(Math.floor(gj), 0, h - 2)
      const fx = clamp(gi - i, 0, 1)
      const fz = clamp(gj - j, 0, 1)
      const k = j * w + i
      return lerp(lerp(height[k], height[k + 1], fx), lerp(height[k + w], height[k + w + 1], fx), fz)
    }
    const corr = new Float32Array(N)
    for (let it = 0; it < 6; it++) {
      corr.fill(0)
      for (const a of anchors) {
        const delta = a.y - sampleH(a.gi, a.gj)
        if (Math.abs(delta) < 0.05) continue
        const R = Math.ceil(a.r * 2.6)
        for (let j = Math.max(0, Math.floor(a.gj) - R); j <= Math.min(h - 1, Math.floor(a.gj) + R); j++)
          for (let i = Math.max(0, Math.floor(a.gi) - R); i <= Math.min(w - 1, Math.floor(a.gi) + R); i++) {
            const d = Math.hypot(i - a.gi, j - a.gj) / a.r
            corr[j * w + i] += delta * Math.exp(-d * d)
          }
      }
      for (let k = 0; k < N; k++) if (land[k]) height[k] = Math.min(el.maxY, Math.max(el.seaLevel + 1, height[k] + corr[k] * 0.85))
    }
  }

  /* —— 局部起伏：3×3 邻域高差 —— */
  const relief = new Float32Array(N)
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const k = j * w + i
      let lo = height[k]
      let hi = height[k]
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = clamp(i + di, 0, w - 1)
          const jj = clamp(j + dj, 0, h - 1)
          const v = height[jj * w + ii]
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      relief[k] = land[k] ? (hi - lo) * 0.5 : 0
    }

  return { w, h, cell, x0, z0, land, landSoft, height, relief, kind }
}

/* ================= 工具 ================= */

export function projectLine(P: FocusProjection, line: GeoLine): Vec2[] {
  return line.map(([lng, lat]) => [P.projectLng(lng), P.projectLat(lat)] as const)
}

function rasterPolygon(poly: Vec2[], w: number, h: number, x0: number, z0: number, cell: number): Uint8Array {
  const out = new Uint8Array(w * h)
  let minx = Infinity
  let maxx = -Infinity
  let minz = Infinity
  let maxz = -Infinity
  for (const [x, z] of poly) {
    minx = Math.min(minx, x)
    maxx = Math.max(maxx, x)
    minz = Math.min(minz, z)
    maxz = Math.max(maxz, z)
  }
  const i0 = clamp(Math.floor((minx - x0) / cell), 0, w - 1)
  const i1 = clamp(Math.ceil((maxx - x0) / cell), 0, w - 1)
  const j0 = clamp(Math.floor((minz - z0) / cell), 0, h - 1)
  const j1 = clamp(Math.ceil((maxz - z0) / cell), 0, h - 1)
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) if (pointInPolygon(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, poly)) out[j * w + i] = 1
  return out
}

/** 两遍箱式模糊（近似高斯），半径单位为格 */
export function blur(a: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius))
  const tmp = new Float32Array(w * h)
  const inv = 1 / (2 * r + 1)
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < h; j++) {
      const o = j * w
      let s = 0
      for (let i = -r; i <= r; i++) s += a[o + clamp(i, 0, w - 1)]
      for (let i = 0; i < w; i++) {
        tmp[o + i] = s * inv
        s += a[o + Math.min(w - 1, i + r + 1)] - a[o + Math.max(0, i - r)]
      }
    }
    for (let i = 0; i < w; i++) {
      let s = 0
      for (let j = -r; j <= r; j++) s += tmp[clamp(j, 0, h - 1) * w + i]
      for (let j = 0; j < h; j++) {
        a[j * w + i] = s * inv
        s += tmp[Math.min(h - 1, j + r + 1) * w + i] - tmp[Math.max(0, j - r) * w + i]
      }
    }
  }
  return a
}

function forPolyline(
  pts: Vec2[],
  reach: number,
  w: number,
  h: number,
  x0: number,
  z0: number,
  cell: number,
  fn: (k: number, dist: number) => void,
): void {
  let minx = Infinity
  let maxx = -Infinity
  let minz = Infinity
  let maxz = -Infinity
  for (const [x, z] of pts) {
    minx = Math.min(minx, x)
    maxx = Math.max(maxx, x)
    minz = Math.min(minz, z)
    maxz = Math.max(maxz, z)
  }
  const i0 = clamp(Math.floor((minx - reach - x0) / cell), 0, w - 1)
  const i1 = clamp(Math.ceil((maxx + reach - x0) / cell), 0, w - 1)
  const j0 = clamp(Math.floor((minz - reach - z0) / cell), 0, h - 1)
  const j1 = clamp(Math.ceil((maxz + reach - z0) / cell), 0, h - 1)
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const x = x0 + (i + 0.5) * cell
      const z = z0 + (j + 0.5) * cell
      let best = Infinity
      for (let s = 1; s < pts.length; s++) {
        const d = segmentDistance(x, z, pts[s - 1][0], pts[s - 1][1], pts[s][0], pts[s][1]).dist
        if (d < best) best = d
      }
      if (best < reach) fn(j * w + i, best)
    }
}

/** 宏观网格的双线性取样器 */
export class MacroSampler {
  readonly d: MacroGridData
  constructor(d: MacroGridData) {
    this.d = d
  }

  private bilinear(arr: Float32Array, x: number, z: number): number {
    const d = this.d
    const gx = clamp((x - d.x0) / d.cell - 0.5, 0, d.w - 1.001)
    const gz = clamp((z - d.z0) / d.cell - 0.5, 0, d.h - 1.001)
    const i = Math.floor(gx)
    const j = Math.floor(gz)
    const fx = gx - i
    const fz = gz - j
    const k = j * d.w + i
    const a = arr[k] + (arr[k + 1] - arr[k]) * fx
    const b = arr[k + d.w] + (arr[k + d.w + 1] - arr[k + d.w]) * fx
    return a + (b - a) * fz
  }

  height(x: number, z: number): number {
    return this.bilinear(this.d.height, x, z)
  }
  relief(x: number, z: number): number {
    return this.bilinear(this.d.relief, x, z)
  }
  landSoft(x: number, z: number): number {
    return this.bilinear(this.d.landSoft, x, z)
  }
  private index(x: number, z: number): number {
    const d = this.d
    const i = clamp(Math.floor((x - d.x0) / d.cell), 0, d.w - 1)
    const j = clamp(Math.floor((z - d.z0) / d.cell), 0, d.h - 1)
    return j * d.w + i
  }
  kind(x: number, z: number): MacroKind {
    return this.d.kind[this.index(x, z)] as MacroKind
  }
  land(x: number, z: number): boolean {
    return this.d.land[this.index(x, z)] === 1
  }
  inBounds(x: number, z: number): boolean {
    const d = this.d
    return x >= d.x0 && z >= d.z0 && x < d.x0 + d.w * d.cell && z < d.z0 + d.h * d.cell
  }
}

export function macroTransferables(d: MacroGridData): ArrayBuffer[] {
  return [d.land, d.landSoft, d.height, d.relief, d.kind].map((a) => a.buffer as ArrayBuffer)
}
