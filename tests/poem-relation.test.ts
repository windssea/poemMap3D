import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { relationHeading } from '../src/features/poetry/types'

describe('诗与地点的关系', () => {
  const data = JSON.parse(fs.readFileSync('public/data/poems.json', 'utf8')) as { poems: { id: string; relation?: string; relationNote?: string; placeId: string }[]; places: { id: string }[] }

  it('关系取值合法；意象关联必须附说明（交代空间压缩）', () => {
    const ok = new Set(['written', 'depicted', 'visited', 'motif'])
    for (const p of data.poems) {
      if (p.relation === undefined) continue
      expect(ok.has(p.relation), `${p.id} relation=${p.relation}`).toBe(true)
      if (p.relation === 'motif') expect(p.relationNote, `${p.id} 缺说明`).toBeTruthy()
    }
  })

  it('月牙泉的《碛中作》标为意象关联', () => {
    const p = data.poems.find((q) => q.id === 'qi-zhong-zuo')!
    expect(p.relation).toBe('motif')
    expect(relationHeading('motif', '月牙泉')).toBe('以月牙泉写意')
    expect(relationHeading(undefined, '兰亭')).toBe('写于兰亭')
  })
})

describe('诗词文本', () => {
  it('不含控制字符与扩展区生僻字（扩展区的字几乎没有字体收录，会显示成方块）', () => {
    const data = JSON.parse(fs.readFileSync('public/data/poems.json', 'utf8')) as { poems: { id: string }[] }
    const bad: string[] = []
    // 逐个字符串值检查（JSON.stringify 会把控制字符转义成 \u0001 这样的 ASCII，查不出来）
    const walk = (v: unknown, id: string): void => {
      if (typeof v === 'string') {
        for (const ch of v) {
          const c = ch.codePointAt(0) ?? 0
          if (c > 0xffff || (c < 0x20 && ch !== '\n')) bad.push(`${id} U+${c.toString(16)}`)
        }
      } else if (Array.isArray(v)) for (const x of v) walk(x, id)
      else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x, id)
    }
    for (const p of data.poems) walk(p, p.id)
    expect(bad).toEqual([])
  })

  it('不用有规范简体的异体字（鴈→雁等；维基文库原文常带异体，繁简转换不改）', () => {
    const VARIANTS = '鴈慙廻罇甞諠懽谿駇驩厓僊濛淩'
    const text = fs.readFileSync('public/data/poems.json', 'utf8')
    expect([...VARIANTS].filter((c) => text.includes(c))).toEqual([])
  })
})

describe('文字校订', () => {
  it('岳阳楼记：其必曰「先天下之忧而忧，后天下之乐而乐」乎', () => {
    const raw = fs.readFileSync('public/data/poems.json', 'utf8')
    expect(raw).toContain('后天下之乐而乐」乎')
    expect(raw).not.toContain('后天下之乐而乐」欤')
  })
})
