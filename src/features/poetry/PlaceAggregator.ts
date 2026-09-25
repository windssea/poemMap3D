import type { PlaceRepository, PoetryRepository } from './PoetryRepository'
import { fameOf, isMasterpiece, type Place, type Poem } from './types'

export interface PlaceSummary {
  place: Place
  poems: Poem[]
  masterpieces: number
  /** 标签排序用的优先级：诗多、名篇多在前 */
  priority: number
  dynasties: string[]
}

/** 地点聚合：每处的诗目（名气高的在前）、名篇数、朝代与标签优先级 */
export class PlaceAggregator {
  private readonly summaries = new Map<string, PlaceSummary>()

  constructor(places: PlaceRepository, poetry: PoetryRepository, major: ReadonlySet<string>) {
    for (const place of places.all()) {
      const poems = place.poemIds.map((id) => poetry.get(id)).filter((p): p is Poem => !!p)
      poems.sort((a, b) => fameOf(b) - fameOf(a))
      const masterpieces = poems.filter(isMasterpiece).length
      const top = poems.reduce((m, p) => Math.max(m, fameOf(p)), 0)
      this.summaries.set(place.id, {
        place,
        poems,
        masterpieces,
        priority: poems.length * 2 + masterpieces * 3 + top + (major.has(place.id) ? 40 : 0),
        dynasties: [...new Set(poems.map((p) => p.dynasty))],
      })
    }
  }

  get(id: string): PlaceSummary | undefined {
    return this.summaries.get(id)
  }

  all(): PlaceSummary[] {
    return [...this.summaries.values()].sort((a, b) => b.priority - a.priority)
  }
}
