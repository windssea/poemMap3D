import { describe, expect, it } from 'vitest'
import { getProjection } from '../src/world/coordinate/GeoProjection'
import { ELEVATION_ANCHORS } from '../src/world/generation/geography/GeographyData'
import { yToMeters } from '../src/world/WorldConfig'
import { testWorld } from './helpers'

describe('海拔校准', () => {
  const w = testWorld()
  const P = getProjection()
  const rows = ELEVATION_ANCHORS.map((a) => {
    const c = P.project(a.lng, a.lat)
    // 峰取周围最高处（主峰可能偏一两格），城市取周围中位
    const hs: number[] = []
    const r = a.kind === 'peak' ? 6 : 4
    for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
        const col = w.terrain.column(Math.round(c.x) + dx, Math.round(c.z) + dz)
        // 城市只量陆地（江心不算）
        if (a.kind === 'peak' || col.waterY < 0 || col.height >= col.waterY) hs.push(col.height)
      }
    if (!hs.length) hs.push(w.terrain.column(Math.round(c.x), Math.round(c.z)).height)
    hs.sort((x, y) => x - y)
    const y = a.kind === 'peak' ? hs[hs.length - 1] : hs[hs.length >> 1]
    return { ...a, ours: Math.round(yToMeters(y)) }
  })

  it('名山与城市海拔接近实测（峰 ±18%，城市 ±150 米或 ±15%）', () => {
    for (const r of rows) {
      const tol = r.kind === 'peak' ? r.meters * 0.18 : Math.max(150, r.meters * 0.15)
      expect(Math.abs(r.ours - r.meters), `${r.name} 实测 ${r.meters} 米，生成 ${r.ours} 米`).toBeLessThanOrEqual(tol)
    }
  })

  it('高低次序：珠峰 > 贡嘎 > 太白 > 峨眉 > 华山 > 黄山 > 泰山 > 庐山；西安 > 洛阳 > 开封', () => {
    const m = Object.fromEntries(rows.map((r) => [r.name, r.ours]))
    const order = ['珠穆朗玛峰', '贡嘎山', '太白山', '峨眉山', '华山', '黄山', '泰山', '庐山']
    for (let i = 1; i < order.length; i++) expect(m[order[i - 1]], `${order[i - 1]} 应高于 ${order[i]}`).toBeGreaterThan(m[order[i]])
    expect(m['西安']).toBeGreaterThan(m['洛阳'])
    expect(m['洛阳']).toBeGreaterThan(m['开封'])
  })
})
