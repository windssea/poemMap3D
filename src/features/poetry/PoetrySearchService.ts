import type { PlaceRepository, PoetryRepository } from './PoetryRepository'
import { fameOf } from './types'

export type SearchResult =
  | { kind: 'poem'; id: string; title: string; subtitle: string; score: number }
  | { kind: 'author'; id: string; title: string; subtitle: string; score: number }
  | { kind: 'place'; id: string; title: string; subtitle: string; score: number }

/** 搜索：诗题、诗人、地名、诗句，按匹配位置与名气排序 */
export class PoetrySearchService {
  constructor(
    private readonly poetry: PoetryRepository,
    private readonly places: PlaceRepository,
  ) {}

  search(q: string, limit = 20): SearchResult[] {
    const s = q.trim()
    if (!s) return []
    const out: SearchResult[] = []
    const score = (text: string, base: number) => {
      const i = text.indexOf(s)
      if (i < 0) return -1
      return base + (i === 0 ? 20 : 0) + (text === s ? 30 : 0) - Math.min(10, text.length - s.length) * 0.5
    }
    for (const p of this.places.all()) {
      const sc = score(p.name, 60)
      if (sc >= 0) out.push({ kind: 'place', id: p.id, title: p.name, subtitle: `${p.region} · ${p.poemIds.length} 首`, score: sc + p.poemIds.length })
    }
    const seenAuthors = new Set<string>()
    for (const poem of this.poetry.all()) {
      if (!seenAuthors.has(poem.author)) {
        const sc = score(poem.author, 55)
        if (sc >= 0) {
          seenAuthors.add(poem.author)
          const n = this.poetry.poemsBy(poem.author).length
          out.push({ kind: 'author', id: poem.author, title: poem.author, subtitle: `${poem.dynasty} · ${n} 首`, score: sc + n })
        }
      }
      const st = score(poem.title, 50)
      if (st >= 0) out.push({ kind: 'poem', id: poem.id, title: `《${poem.title}》`, subtitle: `${poem.dynasty} · ${poem.author} · ${poem.placeName}`, score: st + fameOf(poem) * 2 })
      else {
        const line = poem.lines.find((l) => l.includes(s))
        if (line) out.push({ kind: 'poem', id: poem.id, title: line, subtitle: `《${poem.title}》 ${poem.author}`, score: 20 + fameOf(poem) * 2 })
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit)
  }
}
