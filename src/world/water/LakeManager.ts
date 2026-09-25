import { SEA_LEVEL } from '../coordinate/constants'
import { getProjection } from '../coordinate/GeoProjection'
import { LAKES } from '../generation/geography/GeographyData'
import type { MacroSampler } from '../generation/geography/MacroGeography'

export interface Lake {
  x: number
  z: number
  rx: number
  rz: number
  cos: number
  sin: number
  level: number
}

export interface LakeHit {
  lake: Lake
  /** 归一化椭圆半径：<1 在湖内 */
  r: number
}

/** 湖泊：椭圆湖盆 + 按湖内平均地势定的水位 */
export class LakeManager {
  readonly lakes: Lake[] = []

  constructor(macro: MacroSampler, artUnit = 11) {
    const P = getProjection()
    for (const d of LAKES) {
      const s = 1.25 * P.scaleAt(d.lng, d.lat) * artUnit
      const c = P.project(d.lng, d.lat)
      const rx = d.rx * s
      const rz = d.rz * s
      let sum = 0
      let cnt = 0
      let mn = Infinity
      for (let a = 0; a < 24; a++)
        for (const f of [0, 0.4, 0.8]) {
          const x = c.x + Math.cos(a) * rx * f
          const z = c.z + Math.sin(a) * rz * f
          if (!macro.land(x, z)) continue
          const hgt = macro.height(x, z)
          sum += hgt
          cnt++
          mn = Math.min(mn, hgt)
        }
      if (!cnt) continue
      const avg = sum / cnt
      const level = Math.max(SEA_LEVEL, Math.floor(avg < SEA_LEVEL + 8 ? SEA_LEVEL + 1 : Math.min(mn, avg) - 2))
      this.lakes.push({ x: c.x, z: c.z, rx, rz, cos: Math.cos(d.rotation), sin: Math.sin(d.rotation), level })
    }
  }

  query(x: number, z: number, reach = 2.4): LakeHit | null {
    let best: LakeHit | null = null
    for (const L of this.lakes) {
      const dx = x - L.x
      const dz = z - L.z
      if (Math.abs(dx) > L.rx * reach + L.rz * reach || Math.abs(dz) > L.rx * reach + L.rz * reach) continue
      const u = (dx * L.cos + dz * L.sin) / L.rx
      const v = (-dx * L.sin + dz * L.cos) / L.rz
      const r = Math.sqrt(u * u + v * v)
      if (r < reach && (!best || r < best.r)) best = { lake: L, r }
    }
    return best
  }
}
