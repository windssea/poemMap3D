import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS, QualityManager, VIEW_RANGES } from '../src/engine/rendering/QualityManager'

describe('渲染视距', () => {
  it('标准档与原预设一致（默认行为不变）', () => {
    const q = new QualityManager('mid')
    expect(q.preset).toBe(QUALITY_PRESETS.mid)
    expect(q.preset.viewK).toBe(1)
  })

  it('各档把近景半径、远景片半径按倍数放大，其余预设项不动', () => {
    for (let i = 1; i < VIEW_RANGES.length; i++) {
      const q = new QualityManager('mid', i as 1 | 2 | 3)
      const base = QUALITY_PRESETS.mid
      const k = VIEW_RANGES[i].k
      expect(q.preset.chunkRadius).toBe(Math.round(base.chunkRadius * k))
      expect(q.preset.coarseRadius).toBe(Math.round(base.coarseRadius * k))
      expect(q.preset.viewK).toBe(k)
      expect(q.preset.shadowSize).toBe(base.shadowSize)
      expect(q.preset.farFactor).toBe(base.farFactor)
    }
  })

  it('切换视距通知订阅者，且画质不变', () => {
    const q = new QualityManager('high')
    const seen: number[] = []
    q.onChange((level, p) => seen.push(level === 'high' ? p.chunkRadius : -1))
    q.setViewRange(2)
    q.setViewRange(2) // 同一档不重复通知
    q.setViewRange(0)
    expect(seen).toEqual([34, 17])
  })
})
