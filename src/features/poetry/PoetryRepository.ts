import { type Author, fameOf, type Place, type Poem, type PoetryData } from './types'

/** 诗词仓库：按 id、作者、地点取诗 */
export class PoetryRepository {
  private readonly poems = new Map<string, Poem>()
  private readonly authors = new Map<string, Author>()
  private readonly byAuthor = new Map<string, Poem[]>()

  constructor(data: PoetryData) {
    for (const p of data.poems) {
      this.poems.set(p.id, p)
      const list = this.byAuthor.get(p.author) ?? []
      list.push(p)
      this.byAuthor.set(p.author, list)
    }
    for (const a of data.authors) this.authors.set(a.name, a)
    for (const list of this.byAuthor.values()) list.sort((a, b) => fameOf(b) - fameOf(a))
  }

  get(id: string): Poem | undefined {
    return this.poems.get(id)
  }

  all(): Poem[] {
    return [...this.poems.values()]
  }

  author(name: string): Author | undefined {
    return this.authors.get(name)
  }

  poemsBy(author: string): Poem[] {
    return this.byAuthor.get(author) ?? []
  }

  get count(): number {
    return this.poems.size
  }
}

/** 地点仓库 */
export class PlaceRepository {
  private readonly places = new Map<string, Place>()

  constructor(data: PoetryData) {
    for (const p of data.places) this.places.set(p.id, p)
  }

  get(id: string): Place | undefined {
    return this.places.get(id)
  }

  all(): Place[] {
    return [...this.places.values()]
  }

  get count(): number {
    return this.places.size
  }
}
