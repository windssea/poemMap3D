/** 诗词领域模型：与 Three.js 完全无关；世界只通过 placeId 与之关联 */
export interface Poem {
  id: string
  title: string
  dynasty: string
  author: string
  form: string
  placeId: string
  placeName: string
  region: string
  lat: number
  lng: number
  lines: string[]
  origin?: string
  preface?: string
  translation?: string
  appreciation?: string
  story?: string
  notes?: { term: string; gloss: string }[]
  tags: string[]
  /** 写作年份（公元，前为负）；yearApprox 为约数（按作者行迹推定） */
  year?: number
  yearApprox?: boolean
  /** 名句：起句下标、名气（1–5，≥4 为名篇）、句数 */
  fame?: { line: number; score: number; count: number }
}

export interface Place {
  id: string
  name: string
  lat: number
  lng: number
  region: string
  poemIds: string[]
}

export interface Author {
  name: string
  years: string
  bio: string
}

export interface PoetryData {
  version: number
  poems: Poem[]
  authors: Author[]
  places: Place[]
}

export const fameOf = (p: Poem): number => p.fame?.score ?? 2
export const isMasterpiece = (p: Poem): boolean => fameOf(p) >= 4
/** 最有名的上下句（没有打标的用末两句） */
export const famousLines = (p: Poem): string[] => (p.fame ? p.lines.slice(p.fame.line, p.fame.line + p.fame.count) : p.lines.slice(-2))
