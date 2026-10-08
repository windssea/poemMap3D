import { describe, expect, it } from 'vitest'
import { routeTap } from '../src/ui/labelHits'

const hits = [
  { placeId: 'a', x0: 85, y0: 100, x1: 115, y1: 180 },
  { placeId: 'b', x0: 125, y0: 100, x1: 155, y1: 180 },
]

describe('手机上点画面', () => {
  it('点中地名签（含放宽的点按区）直接展开', () => {
    expect(routeTap(100, 150, null, hits)).toEqual({ kind: 'open', placeId: 'a' })
    // 签宽 30，放宽到 44：离签边 6px 仍算点中
    expect(routeTap(80, 150, null, hits)).toEqual({ kind: 'open', placeId: 'a' })
    expect(routeTap(100, 96, null, hits)).toEqual({ kind: 'open', placeId: 'a' })
  })

  it('两个签的放宽区重叠时取横向更近的', () => {
    expect(routeTap(119, 150, null, hits)).toEqual({ kind: 'open', placeId: 'a' })
    expect(routeTap(121, 150, null, hits)).toEqual({ kind: 'open', placeId: 'b' })
  })

  it('没点中签、落在名胜范围里只出预览；空处什么也不做', () => {
    expect(routeTap(300, 300, 'c', hits)).toEqual({ kind: 'peek', placeId: 'c' })
    expect(routeTap(300, 300, null, hits)).toEqual({ kind: 'none' })
    expect(routeTap(100, 200, 'c', hits)).toEqual({ kind: 'peek', placeId: 'c' })
  })
})
