import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { dynastySpan } from '../src/features/poetry/types'

describe('品牌副标题的年代范围', () => {
  const data = JSON.parse(fs.readFileSync('public/data/poems.json', 'utf8')) as { poems: { id: string; dynasty: string }[] }

  it('按先后取最早与最晚', () => {
    expect(dynastySpan(['宋', '先秦', '唐'])).toBe('先秦至宋')
    expect(dynastySpan(['唐'])).toBe('唐')
    expect(dynastySpan([])).toBe('历代')
  })

  it('数据里的朝代都认得，副标题与数据一致（现有清代诗）', () => {
    const span = dynastySpan(data.poems.map((p) => p.dynasty))
    for (const p of data.poems) expect(dynastySpan([p.dynasty]), `${p.id} 朝代「${p.dynasty}」未列入先后表`).toBe(p.dynasty)
    expect(span).toBe('先秦至清')
  })

  it('页面描述不再写死「先秦至宋」', () => {
    expect(fs.readFileSync('index.html', 'utf8')).not.toContain('先秦至宋')
  })
})
