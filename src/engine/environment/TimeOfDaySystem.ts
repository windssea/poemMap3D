import * as THREE from 'three'
import { SkyTokens } from '../../config/palette'
import type { TimeOfDay } from './types'

interface Look {
  sunDir: THREE.Vector3
  sun: THREE.Color
  sunI: number
  ambientSky: THREE.Color
  ambientGround: THREE.Color
  ambientI: number
  fog: THREE.Color
  top: THREE.Color
  horizon: THREE.Color
  cloud: THREE.Color
  night: number
  exposure: number
}

const PRESET: Record<TimeOfDay, { dir: [number, number, number]; sunI: number; ambientI: number; night: number; exposure: number }> = {
  dawn: { dir: [0.8, 0.38, 0.3], sunI: 1.8, ambientI: 0.95, night: 0, exposure: 1.05 },
  day: { dir: [0.3, 0.85, 0.55], sunI: 2.6, ambientI: 1.05, night: 0, exposure: 1.02 },
  dusk: { dir: [-0.75, 0.33, 0.3], sunI: 2.1, ambientI: 0.85, night: 0.25, exposure: 1.1 },
  // 夜：满月当空（约 35° 高），月光银白、投下清楚的影子；星光与天光一起托底（环境光偏冷）
  night: { dir: [0.4, 0.5, -0.6], sunI: 1.3, ambientI: 1.0, night: 1, exposure: 1.38 },
}

const lookOf = (t: TimeOfDay): Look => {
  const s = SkyTokens[t]
  const p = PRESET[t]
  return {
    sunDir: new THREE.Vector3(...p.dir).normalize(),
    sun: new THREE.Color(s.sun),
    sunI: p.sunI,
    ambientSky: new THREE.Color(s.ambientSky),
    ambientGround: new THREE.Color(s.ambientGround),
    ambientI: p.ambientI,
    fog: new THREE.Color(s.fog),
    top: new THREE.Color(s.top),
    horizon: new THREE.Color(s.horizon),
    cloud: new THREE.Color(s.cloud),
    night: p.night,
    exposure: p.exposure,
  }
}

/** 时辰：晨 · 昼 · 暮 · 夜，切换时 2 秒平滑过渡 */
export class TimeOfDaySystem {
  key: TimeOfDay
  readonly cur: Look
  private from: Look
  private to: Look
  private t = 1

  constructor(initial: TimeOfDay) {
    this.key = initial
    this.cur = lookOf(initial)
    this.from = lookOf(initial)
    this.to = lookOf(initial)
  }

  set(key: TimeOfDay, instant = false): void {
    this.key = key
    this.from = { ...this.cur, sunDir: this.cur.sunDir.clone(), sun: this.cur.sun.clone(), ambientSky: this.cur.ambientSky.clone(), ambientGround: this.cur.ambientGround.clone(), fog: this.cur.fog.clone(), top: this.cur.top.clone(), horizon: this.cur.horizon.clone(), cloud: this.cur.cloud.clone() }
    this.to = lookOf(key)
    this.t = instant ? 1 : 0
    if (instant) this.apply(1)
  }

  update(dt: number): void {
    if (this.t >= 1) return
    this.t = Math.min(1, this.t + dt / 1.4)
    this.apply(this.t * this.t * (3 - 2 * this.t))
  }

  private apply(k: number): void {
    const a = this.from
    const b = this.to
    const c = this.cur
    c.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize()
    c.sun.lerpColors(a.sun, b.sun, k)
    c.ambientSky.lerpColors(a.ambientSky, b.ambientSky, k)
    c.ambientGround.lerpColors(a.ambientGround, b.ambientGround, k)
    c.fog.lerpColors(a.fog, b.fog, k)
    c.top.lerpColors(a.top, b.top, k)
    c.horizon.lerpColors(a.horizon, b.horizon, k)
    c.cloud.lerpColors(a.cloud, b.cloud, k)
    c.sunI = a.sunI + (b.sunI - a.sunI) * k
    c.ambientI = a.ambientI + (b.ambientI - a.ambientI) * k
    c.night = a.night + (b.night - a.night) * k
    c.exposure = a.exposure + (b.exposure - a.exposure) * k
  }
}
