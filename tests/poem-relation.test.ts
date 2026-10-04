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
