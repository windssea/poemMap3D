import { clamp, lerp } from '../../utils/math'
import { resamplePolyline, segmentDistance, type Vec2 } from '../../utils/geometry2d'
import { SEA_LEVEL } from '../coordinate/constants'
import { getProjection } from '../coordinate/GeoProjection'
import { RIVERS, type RiverDef } from '../generation/geography/GeographyData'
import { type MacroSampler, projectLine } from '../generation/geography/MacroGeography'
import { metersToY } from '../WorldConfig'

export interface River {
  def: RiverDef
  /** 重采样后的中心线（方块坐标） */
  pts: Vec2[]
  /** 每个采样点：半宽（方块）与水位（方块 Y，整数） */
  halfWidth: Float32Array
  level: Int16Array
}

export interface RiverHit {
  river: number
  dist: number
  halfWidth: number
  level: number
  /** 沿河参数 0（源）..1（口） */
  t: number
}

const STEP = 4
const BUCKET = 64
/** 岸坡最宽（方块），决定空间索引的外扩 */
export const BANK_MAX = 14

/**
 * 江河网络：中心线、河宽、沿程单调不升的水位，以及按 64 方块分桶的线段索引。
 * 纯数据 + 纯函数，Worker 与主线程各建一份，结果一致。
 */
export class RiverManager {
  readonly rivers: River[] = []
  private readonly buckets = new Map<number, number[]>()

  constructor(macro: MacroSampler) {
    const P = getProjection()
    /* 支流接上干流：数据里支流的末点常落在干流旁边几十格（没画到江心），中间留一道土梁把支流堵死。
       内陆收尾、离别的河不到 70 格的，末尾补一点到那条河中心线上最近处，真正汇进去 */
    const raws = RIVERS.map((d) => projectLine(P, d.line))
    const joined = raws.map((raw, i) => {
      const [ex, ez] = raw[raw.length - 1]
      if (!macro.land(ex, ez)) return raw
      let best: Vec2 | null = null
      let bd = 70
      raws.forEach((other, j) => {
        if (j === i) return
        for (let k = 1; k < other.length; k++) {
          const [ax, az] = other[k - 1]
          const [bx, bz] = other[k]
          const h = segmentDistance(ex, ez, ax, az, bx, bz)
          if (h.dist < bd && h.dist > 1.5) {
            bd = h.dist
            best = [ax + (bx - ax) * h.t, az + (bz - az) * h.t]
          }
        }
      })
      return best ? [...raw, best] : raw
    })
    RIVERS.forEach((def, ri0) => {
      const raw = joined[ri0]
      const pts = resamplePolyline(raw, STEP)
      const n = pts.length
      const halfWidth = new Float32Array(n)
      const lvl = new Float32Array(n)
      for (let s = 0; s < n; s++) {
        const t = s / (n - 1)
        const [x, z] = pts[s]
        const g = P.unproject(x, z)
        // 半宽（方块）：自源头向下游渐宽，边远压缩区略收窄
        const hw = lerp(def.widthStart, def.widthEnd, Math.pow(t, 1.5)) * (0.7 + 0.3 * P.scaleAt(g.lng, g.lat))
        halfWidth[s] = Math.max(2.2, hw)
        lvl[s] = macro.land(x, z) ? macro.height(x, z) - 2.5 : SEA_LEVEL
      }
      if (def.levels) {
        /* 有实测水位：锚点落到最近的采样点，其间按沿程线性插值（方块 Y） */
        const ks = def.levels
          .map(([lng, lat, m]) => {
            const c = P.project(lng, lat)
            let bi = 0
            let bd = Infinity
            for (let s = 0; s < n; s++) {
              const d = (pts[s][0] - c.x) ** 2 + (pts[s][1] - c.z) ** 2
              if (d < bd) {
                bd = d
                bi = s
              }
            }
            return [bi, metersToY(m)] as const
          })
          .sort((a, b) => a[0] - b[0])
        for (let s = 0; s < n; s++) {
          let k = 0
          while (k < ks.length - 1 && ks[k + 1][0] <= s) k++
          const [s0, y0] = ks[k]
          const [s1, y1] = ks[Math.min(k + 1, ks.length - 1)]
          lvl[s] = s <= s0 || s1 === s0 ? y0 : lerp(y0, y1, (s - s0) / (s1 - s0))
        }
        for (let s = 1; s < n; s++) lvl[s] = Math.min(lvl[s], lvl[s - 1])
      } else {
        /* 沿流单调不升 + 平滑 + 从河口向上游限制坡度（山里改为下切成谷） */
        for (let s = 1; s < n; s++) lvl[s] = Math.min(lvl[s], lvl[s - 1])
        for (let it = 0; it < 3; it++) for (let s = 1; s < n - 1; s++) lvl[s] = Math.min(lvl[s], (lvl[s - 1] + lvl[s] + lvl[s + 1]) / 3)
        for (let s = n - 2; s >= 0; s--) lvl[s] = Math.min(lvl[s], lvl[s + 1] + 0.6)
      }
      const level = new Int16Array(n)
      for (let s = 0; s < n; s++) level[s] = Math.max(SEA_LEVEL, Math.floor(lvl[s]))
      const ri = this.rivers.length
      this.rivers.push({ def, pts, halfWidth, level })
      const reach = Math.max(...halfWidth) * 1.4 + BANK_MAX
      for (let s = 1; s < n; s++) {
        const [ax, az] = pts[s - 1]
        const [bx, bz] = pts[s]
        const i0 = Math.floor((Math.min(ax, bx) - reach) / BUCKET)
        const i1 = Math.floor((Math.max(ax, bx) + reach) / BUCKET)
        const j0 = Math.floor((Math.min(az, bz) - reach) / BUCKET)
        const j1 = Math.floor((Math.max(az, bz) + reach) / BUCKET)
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const k = ((i + 1024) << 11) | (j + 1024)
            let b = this.buckets.get(k)
            if (!b) this.buckets.set(k, (b = []))
            b.push((ri << 16) | s)
          }
      }
    })
  }

  /** 最近的一条河（在 reach 范围内）；无则 null */
  query(x: number, z: number): RiverHit | null {
    const k = ((Math.floor(x / BUCKET) + 1024) << 11) | (Math.floor(z / BUCKET) + 1024)
    const b = this.buckets.get(k)
    if (!b) return null
    let best: RiverHit | null = null
    let bestEdge = Infinity
    for (const code of b) {
      const ri = code >>> 16
      const s = code & 0xffff
      const r = this.rivers[ri]
      const [ax, az] = r.pts[s - 1]
      const [bx, bz] = r.pts[s]
      const hit = segmentDistance(x, z, ax, az, bx, bz)
      const hw = lerp(r.halfWidth[s - 1], r.halfWidth[s], hit.t)
      const edge = hit.dist - hw
      if (edge < bestEdge) {
        bestEdge = edge
        const n = r.pts.length
        best = {
          river: ri,
          dist: hit.dist,
          halfWidth: hw,
          level: hit.t < 0.5 ? r.level[s - 1] : r.level[s],
          t: clamp((s - 1 + hit.t) / (n - 1), 0, 1),
        }
      }
    }
    return best
  }

  /** 按名称取某条河的中心线（覆盖图墨线、标签用） */
  line(id: string): Vec2[] | null {
    return this.rivers.find((r) => r.def.id === id)?.pts ?? null
  }
}
