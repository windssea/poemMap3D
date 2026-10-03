import { afterEach, describe, expect, it, vi } from 'vitest'
import { isQuality, pickQuality, QualityManager } from '../src/engine/rendering/QualityManager'

/**
 * 画质参数：?q= 与上次记住的 shq 都要校验，不合法（如 ?q=abc）时安全回退到按设备的默认值，
 * 不让一个查不到预设的画质名进入引擎（此前 ?q=abc 会在构造引擎时读 undefined 的预设而启动失败）。
 */
describe('画质参数校验', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('只认 low / mid / high', () => {
    for (const q of ['low', 'mid', 'high']) expect(isQuality(q)).toBe(true)
    for (const q of ['abc', '', 'LOW', 'undefined', null, undefined, 1]) expect(isQuality(q)).toBe(false)
  })

  it('地址栏优先，其次上次的选择，都不合法则交给设备默认', () => {
    expect(pickQuality('high', 'low')).toBe('high')
    expect(pickQuality('abc', 'low')).toBe('low')
    expect(pickQuality('', 'mid')).toBe('mid')
    expect(pickQuality(null, 'high')).toBe('high')
    expect(pickQuality('abc', 'broken')).toBeUndefined()
    expect(pickQuality(null, null)).toBeUndefined()
  })

  it('QualityManager 收到非法画质时回退到合法预设', () => {
    const qm = new QualityManager('abc' as never)
    expect(['low', 'mid', 'high']).toContain(qm.quality)
    expect(qm.preset.chunkRadius).toBeGreaterThan(0)
  })

  it('?q=abc 时应用状态不带非法画质', async () => {
    vi.stubGlobal('location', { search: '?q=abc' })
    vi.stubGlobal('localStorage', { getItem: () => 'broken', setItem: () => undefined })
    const { appStore } = await import('../src/app/AppStore')
    expect(appStore.get().quality).toBeUndefined()
  })

  it('?q=abc 但上次选过「高」时沿用「高」', async () => {
    vi.stubGlobal('location', { search: '?q=abc' })
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'shq' ? 'high' : null), setItem: () => undefined })
    const { appStore } = await import('../src/app/AppStore')
    expect(appStore.get().quality).toBe('high')
  })
})
