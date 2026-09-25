import { clamp } from './math'

export type Vec2 = readonly [number, number]

export interface SegmentHit {
  dist: number
  /** 在该段上的参数 0..1 */
  t: number
}

export function segmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): SegmentHit {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 > 0 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0
  const ex = ax + dx * t - px
  const ez = az + dz * t - pz
  return { dist: Math.sqrt(ex * ex + ez * ez), t }
}

/** 非零环绕规则的点在多边形内判定 */
export function pointInPolygon(x: number, z: number, poly: readonly Vec2[]): boolean {
  let wn = 0
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zj <= z) {
      if (zi > z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) > 0) wn++
    } else if (zi <= z && (xi - xj) * (z - zj) - (x - xj) * (zi - zj) < 0) wn--
  }
  return wn !== 0
}

/** 折线的累积长度表 */
export function polylineLengths(pts: readonly Vec2[]): number[] {
  const L = [0]
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  return L
}

/** 按固定间距重采样折线 */
export function resamplePolyline(pts: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = []
  for (let s = 1; s < pts.length; s++) {
    const [ax, az] = pts[s - 1]
    const [bx, bz] = pts[s]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
    for (let q = 0; q < n; q++) {
      const t = q / n
      out.push([ax + (bx - ax) * t, az + (bz - az) * t])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}
