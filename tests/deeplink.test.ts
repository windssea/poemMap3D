import { describe, expect, it } from 'vitest'
import { encodeDeepLink, parseDeepLink, sameView } from '../src/app/DeepLink'

describe('分享地址', () => {
  it('解析地点、诗、机位与时令天气', () => {
    const l = parseDeepLink('?p=fengqiao&poem=fengqiao-ye-bo&shot=temple&shs=autumn&shw=clear&shm=night')
    expect(l).toEqual({ place: 'fengqiao', poem: 'fengqiao-ye-bo', shot: 'temple', view: null, season: 'autumn', weather: 'clear', time: 'night' })
  })

  it('非法取值安全回退为空（不抛错、不注入）', () => {
    const l = parseDeepLink('?p=<script>&poem=' + 'x'.repeat(200) + '&shot=a%20b&shs=monsoon&shw=&shm=noon')
    expect(l).toEqual({ place: null, poem: null, shot: null, view: null, season: null, weather: null, time: null })
    expect(parseDeepLink('')).toEqual({ place: null, poem: null, shot: null, view: null, season: null, weather: null, time: null })
  })

  it('编码往返一致，并保留与分享无关的其他参数', () => {
    const s = { place: 'jiayuguan', poem: null, shot: 'hero', view: null, season: 'summer' as const, weather: 'clear' as const, time: 'dusk' as const }
    const url = encodeDeepLink(s, '?q=mid')
    expect(url).toContain('q=mid')
    expect(parseDeepLink(url)).toEqual(s)
  })

  it('没选地点时不带诗与机位', () => {
    const url = encodeDeepLink({ place: null, poem: 'x', shot: 'hero', view: null, season: 'spring', weather: 'clear', time: 'day' }, '?p=old&poem=old&shot=old')
    const l = parseDeepLink(url)
    expect(l.place).toBeNull()
    expect(l.poem).toBeNull()
    expect(l.shot).toBeNull()
  })

  it('只换机位、时令不算一步历史；换地点、换诗算', () => {
    const a = { place: 'a', poem: 'p', shot: 'hero', view: null as string | null, season: 'spring' as const, weather: 'clear' as const, time: 'day' as const }
    expect(sameView(a, { ...a, shot: 'detail', time: 'night' })).toBe(true)
    expect(sameView(a, { ...a, poem: 'q' })).toBe(false)
    expect(sameView(a, { ...a, place: 'b' })).toBe(false)
    expect(sameView(a, { ...a, view: 'home' })).toBe(false)
  })

  it('在视角预设上：地址带 view、不带机位（诗卷照留）', () => {
    const url = encodeDeepLink({ place: 'fengqiao', poem: 'fengqiao-ye-bo', shot: 'hero', view: 'home', season: 'autumn', weather: 'clear', time: 'night' })
    const l = parseDeepLink(url)
    expect(l.view).toBe('home')
    expect(l.shot).toBeNull()
    expect(l.place).toBe('fengqiao')
  })
})
