import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { TimeOfDaySystem } from '../src/engine/environment/TimeOfDaySystem'
import { acesFilmic } from '../src/engine/rendering/DisplayColor'

const l2s = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
/** 场景色在该曝光下的屏幕饱和度（天空色是按屏幕色反解的 HDR 场景色，直接量场景色的饱和度没有意义） */
const shownSat = (c: THREE.Color, exposure: number): number => {
  const d = acesFilmic([c.r, c.g, c.b], exposure).map(l2s)
  return new THREE.Color(d[0], d[1], d[2]).getHSL({ h: 0, s: 0, l: 0 }).s
}
const near = (a: THREE.Color, b: THREE.Color) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b)) < 1e-6
const settle = (t: TimeOfDaySystem, seconds: number) => {
  for (let s = 0; s < seconds; s += 1 / 60) t.update(1 / 60)
}

/** 暮 / 晨 ↔ 夜的过渡途中经过薄暮（红粉—紫—靛），不在两端之间直插成偏粉的暖灰 */
describe('薄暮过渡', () => {
  it('暮 → 夜：半途的地平线在屏幕上比两端直插更饱和', () => {
    const dusk = new TimeOfDaySystem('dusk').cur
    const night = new TimeOfDaySystem('night').cur
    const naive = dusk.horizon.clone().lerp(night.horizon, 0.5)
    const t = new TimeOfDaySystem('dusk')
    t.set('night')
    settle(t, 1.2) // 总长 2.4 s，半途
    expect(shownSat(t.cur.horizon, t.cur.exposure)).toBeGreaterThan(shownSat(naive, (dusk.exposure + night.exposure) / 2) + 0.1)
  })

  it('走完之后与夜景一致；瞬时切换不经过薄暮', () => {
    const night = new TimeOfDaySystem('night').cur
    const t = new TimeOfDaySystem('dusk')
    t.set('night')
    settle(t, 3)
    expect(near(t.cur.horizon, night.horizon)).toBe(true)
    expect(t.cur.exposure).toBeCloseTo(night.exposure, 6)

    const u = new TimeOfDaySystem('dusk')
    u.set('night', true)
    expect(near(u.cur.horizon, night.horizon)).toBe(true)
  })

  it('昼 ↔ 暮不经过薄暮', () => {
    const t = new TimeOfDaySystem('day')
    t.set('dusk')
    settle(t, 0.7) // 仍是 1.4 s 的过渡，半途
    const mid = new TimeOfDaySystem('day').cur.horizon.clone().lerp(new TimeOfDaySystem('dusk').cur.horizon, 0.5)
    expect(Math.abs(t.cur.horizon.r - mid.r)).toBeLessThan(0.02)
    expect(Math.abs(t.cur.horizon.b - mid.b)).toBeLessThan(0.02)
  })
})
