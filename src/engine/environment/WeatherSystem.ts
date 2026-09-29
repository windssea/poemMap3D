import { WeatherTint } from '../../config/palette'
import type { Season, Weather } from './types'

/**
 * 天气：晴 / 雨 / 雪。冬季下雨即为雪。雨雪量平滑增减；雪停后积雪慢慢化去。
 */
export class WeatherSystem {
  key: Weather
  /** 雨量 0–1 */
  rain = 0
  /** 雪量 0–1 */
  snow = 0
  /** 雾 0–1：只加地平线雾，不下雨 */
  mist = 0
  /** 地面积雪 0–1 */
  cover = 0
  private season: Season = 'spring'

  constructor(initial: Weather) {
    this.key = initial
  }

  /** 冬季把雨换成雪 */
  effective(): Weather {
    if (this.key === 'mist') return 'mist'
    if (this.key === 'rain' && this.season === 'winter') return 'snow'
    if (this.key === 'snow' && this.season !== 'winter') return 'rain'
    return this.key
  }

  set(w: Weather, instant = false): void {
    this.key = w
    if (instant) {
      const e = this.effective()
      this.rain = e === 'rain' ? 1 : 0
      this.snow = e === 'snow' ? 1 : 0
      this.mist = e === 'mist' ? 1 : 0
    }
  }

  setSeason(s: Season): void {
    this.season = s
  }

  update(dt: number, baseSnow: number): void {
    const e = this.effective()
    const tr = e === 'rain' ? 1 : 0
    const ts = e === 'snow' ? 1 : 0
    const tm = e === 'mist' ? 1 : 0
    const k = Math.min(1, dt / 1.5)
    this.rain += (tr - this.rain) * k
    this.snow += (ts - this.snow) * k
    this.mist += (tm - this.mist) * k
    const target = Math.max(baseSnow * 0.8, this.snow > 0.3 ? 1 : 0)
    // 积雪与融雪：四季切换时几秒内完成，不拖泥带水
    this.cover += (target - this.cover) * Math.min(1, dt / (target > this.cover ? 3.5 : 4.5))
  }

  /** 光照、雾、饱和度的天气乘子 */
  tint(): { light: number; fog: number; saturation: number } {
    const c = WeatherTint.clear
    const r = WeatherTint.rain
    const s = WeatherTint.snow
    const m = WeatherTint.mist
    const mix = (a: number, b: number, t: number) => a + (b - a) * t
    const light = mix(mix(mix(c.light, r.light, this.rain), s.light, this.snow), m.light, this.mist)
    const fog = mix(mix(mix(c.fog, r.fog, this.rain), s.fog, this.snow), m.fog, this.mist)
    const saturation = mix(mix(mix(c.saturation, r.saturation, this.rain), s.saturation, this.snow), m.saturation, this.mist)
    return { light, fog, saturation }
  }
}
