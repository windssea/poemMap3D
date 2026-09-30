import { describe, expect, it } from 'vitest'
import { testWorld } from './helpers'

describe('新城山', () => {
  it('山包整体削低，无直崖，山脚厅堂不被埋', () => {
    const t = testWorld().terrain
    /* 镇子本身的高度不变 */
    expect(Math.round(t.column(702, 330).height)).toBe(48)
    /* 西侧山嘴整体削低：峰高六成半上下，不再是 80 上下；仍是山（高于河岸平地） */
    for (const [x, z] of [[668, 296], [676, 300], [664, 288]] as const) {
      const h = Math.round(t.column(x, z).height)
      expect(h).toBeGreaterThan(50)
      expect(h).toBeLessThan(70)
    }
    /* 不再有大坎：同一行自西向东，相邻两格的落差都不超过 14（原先的直崖一步超过 18） */
    const row = Array.from({ length: 12 }, (_, i) => Math.round(t.column(656 + i * 4, 296).height))
    let jump = 0
    for (let i = 1; i < row.length; i++) jump = Math.max(jump, Math.abs(row[i] - row[i - 1]))
    expect(jump).toBeLessThanOrEqual(14)
    /* 山脚厅堂 footprint（杭州西 hall 684..696 × 300..314）：都在 58 以下，且整片平缓——
       削低若排在杭州的压平与造山之前，这里会抬到 46–53、高差近十格，台面不再平 */
    const hs: number[] = []
    for (let x = 684; x <= 696; x += 2)
      for (let z = 300; z <= 314; z += 2) hs.push(Math.round(t.column(x, z).height))
    expect(Math.max(...hs)).toBeLessThanOrEqual(58)
    expect(Math.max(...hs) - Math.min(...hs)).toBeLessThanOrEqual(6)
    /* 旧峰不再被削平 */
    const old = [327, 331, 335].map((z) => Math.round(t.column(563, z).height))
    expect(old[0] === 96 && old[1] === 96 && old[2] === 96).toBe(false)
  })
})
