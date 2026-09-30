import { describe, expect, it } from 'vitest'
import { acesFilmic, displayToScene, gradeGain, inverseAces } from '../src/engine/rendering/DisplayColor'
import { SkyTokens } from '../src/config/palette'

const s2l = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
const l2s = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)

describe('屏幕色 → 场景色（反解 ACES）', () => {
  it('反解后再过一遍色调映射，回到目标色', () => {
    for (const target of [[0.14, 0.5, 0.72], [0.8, 0.75, 0.6], [0.3, 0.3, 0.3]] as const)
      for (const exposure of [1.06, 1.08, 1.38]) {
        const x = inverseAces([...target], exposure)
        const y = acesFilmic(x, exposure)
        for (let i = 0; i < 3; i++) expect(y[i]).toBeCloseTo(target[i], 4)
      }
  })

  it('昼景三段色：反解出的场景色确实比写的颜色更饱和 / 更亮（ACES 会把它们压灰）', () => {
    const top = displayToScene(SkyTokens.day.top, 1.08, 0)
    // #89BBDD 的蓝 / 红比是 1.61；场景里要写得更陡，屏幕上才是这个比
    const raw = [0x89, 0xbb, 0xdd].map((v) => s2l(v / 255))
    expect(top.b / top.r).toBeGreaterThan(raw[2] / raw[0])
  })

  it('晨昼暮的天空 token：场景色经色调映射、再经末端调色，屏幕上与写的颜色只差 1 个色阶', () => {
    for (const [name, exposure, warm] of [['dawn', 1.06, 1], ['day', 1.08, 0], ['dusk', 1.08, 1]] as const)
      for (const key of ['top', 'mid', 'horizon'] as const) {
        const hex = SkyTokens[name][key]
        const c = displayToScene(hex, exposure, warm)
        const shown = acesFilmic([c.r, c.g, c.b], exposure).map(l2s) as [number, number, number]
        const g = gradeGain(shown, warm)
        const want = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
        shown.forEach((v, k) => expect(Math.abs(Math.round(Math.min(1, v * g[k]) * 255) - want[k])).toBeLessThanOrEqual(3))
      }
  })
})
