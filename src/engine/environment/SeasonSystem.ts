import * as THREE from 'three'
import { SeasonTint } from '../../config/palette'
import type { Season } from './types'

interface SeasonLook {
  grass: THREE.Color
  foliage: THREE.Color
  autumn: number
  snow: number
  blossom: number
}

const lookOf = (s: Season): SeasonLook => ({
  grass: new THREE.Color(SeasonTint[s].grass),
  foliage: new THREE.Color(SeasonTint[s].foliage),
  autumn: SeasonTint[s].autumn,
  snow: SeasonTint[s].snow,
  blossom: s === 'spring' ? 1 : 0,
})

/** 四季：草与阔叶的季节乘子、秋色、花期、冬季底雪，1.5 秒过渡 */
export class SeasonSystem {
  key: Season
  readonly cur: SeasonLook
  private from: SeasonLook
  private to: SeasonLook
  private t = 1

  constructor(initial: Season) {
    this.key = initial
    this.cur = lookOf(initial)
    this.from = lookOf(initial)
    this.to = lookOf(initial)
  }

  set(s: Season, instant = false): void {
    this.key = s
    this.from = { ...this.cur, grass: this.cur.grass.clone(), foliage: this.cur.foliage.clone() }
    this.to = lookOf(s)
    this.t = instant ? 1 : 0
    if (instant) this.apply(1)
  }

  update(dt: number): void {
    if (this.t >= 1) return
    this.t = Math.min(1, this.t + dt / 1.5)
    this.apply(this.t * this.t * (3 - 2 * this.t))
  }

  private apply(k: number): void {
    this.cur.grass.lerpColors(this.from.grass, this.to.grass, k)
    this.cur.foliage.lerpColors(this.from.foliage, this.to.foliage, k)
    this.cur.autumn = this.from.autumn + (this.to.autumn - this.from.autumn) * k
    this.cur.snow = this.from.snow + (this.to.snow - this.from.snow) * k
    this.cur.blossom = this.from.blossom + (this.to.blossom - this.from.blossom) * k
  }
}
