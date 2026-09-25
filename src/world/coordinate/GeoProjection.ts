import { clamp, smoothstep } from '../../utils/math'
import { WorldConfig } from '../WorldConfig'

export interface GeoPoint {
  lng: number
  lat: number
}

export interface WorldXZ {
  x: number
  z: number
}

export interface GeoProjection {
  project(lng: number, lat: number): WorldXZ
  unproject(x: number, z: number): GeoPoint
  /** 某地的相对比例（腹地 1，边远约 0.42） */
  scaleAt(lng: number, lat: number): number
}

const STEP = 0.01
const LNG0 = 60
const TABLE_N = 9001 // 经 60–150、纬 0–90，每 0.01° 一格

/**
 * 聚焦投影：经、纬各自独立积分「密度」得到方块坐标。
 * 东部诗词密集区密度为 1，西部、北部与南海逐渐降到 floor。
 * 由于可分离，x 只依赖经度、z 只依赖纬度，反投影是两个一维查表。
 */
export class FocusProjection implements GeoProjection {
  private readonly X = new Float64Array(TABLE_N)
  private readonly Z = new Float64Array(TABLE_N)
  private readonly cfg = WorldConfig.projection

  constructor() {
    const c = this.cfg
    const cos = Math.cos((c.referenceLatitude * Math.PI) / 180)
    for (let i = 1; i < TABLE_N; i++) {
      this.X[i] = this.X[i - 1] + this.denX(LNG0 + (i - 0.5) * STEP) * STEP * cos * c.blocksPerDegree
      this.Z[i] = this.Z[i - 1] + this.denZ((i - 0.5) * STEP) * STEP * c.blocksPerDegree
    }
    const x0 = this.lookup(this.X, (c.originLng - LNG0) / STEP)
    const z0 = this.lookup(this.Z, c.originLat / STEP)
    for (let i = 0; i < TABLE_N; i++) {
      this.X[i] -= x0
      this.Z[i] = z0 - this.Z[i] // 北在 -Z
    }
  }

  private core(v: number, [a, b, c, d]: readonly number[]): number {
    return smoothstep(a, b, v) * (1 - smoothstep(c, d, v))
  }
  private denX(lng: number): number {
    return this.cfg.floor + (1 - this.cfg.floor) * this.core(lng, this.cfg.coreLng)
  }
  private denZ(lat: number): number {
    return this.cfg.floor + (1 - this.cfg.floor) * this.core(lat, this.cfg.coreLat)
  }

  private lookup(T: Float64Array, f: number): number {
    const v = clamp(f, 0, TABLE_N - 1.000001)
    const i = Math.floor(v)
    return T[i] + (T[i + 1] - T[i]) * (v - i)
  }

  private inverse(T: Float64Array, v: number, decreasing: boolean): number {
    let lo = 0
    let hi = TABLE_N - 1
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1
      if (T[m] < v !== decreasing) lo = m
      else hi = m
    }
    return lo + (v - T[lo]) / (T[hi] - T[lo] || 1)
  }

  projectLng(lng: number): number {
    return this.lookup(this.X, (lng - LNG0) / STEP)
  }
  projectLat(lat: number): number {
    return this.lookup(this.Z, lat / STEP)
  }
  lngOf(x: number): number {
    return LNG0 + this.inverse(this.X, x, false) * STEP
  }
  latOf(z: number): number {
    return this.inverse(this.Z, z, true) * STEP
  }

  project(lng: number, lat: number): WorldXZ {
    return { x: this.projectLng(lng), z: this.projectLat(lat) }
  }

  unproject(x: number, z: number): GeoPoint {
    return { lng: this.lngOf(x), lat: this.latOf(z) }
  }

  scaleAt(lng: number, lat: number): number {
    return (this.denX(lng) + this.denZ(lat)) / 2
  }
}

let shared: FocusProjection | null = null
export const getProjection = (): FocusProjection => (shared ??= new FocusProjection())
