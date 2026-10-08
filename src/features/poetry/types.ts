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
  /**
   * 诗与地点的关系（缺省为写作地）：written 写于此地；depicted 写此地（不一定在此写成）；
   * visited 途经此地时所作；motif 意象关联——诗不写于此、也不专写此地，借此地的景致呈现诗意（图上是空间压缩）
   */
  relation?: PoemPlaceRelation
  /** 关系说明（意象关联、空间压缩时交代清楚） */
  relationNote?: string
}

export type PoemPlaceRelation = 'written' | 'depicted' | 'visited' | 'motif'

/** 诗卷上「出处」一节的标题 */
export function relationHeading(rel: PoemPlaceRelation | undefined, place: string): string {
  switch (rel) {
    case 'depicted':
      return `诗写${place}`
    case 'visited':
      return `途经${place}`
    case 'motif':
      return `以${place}写意`
    default:
      return `写于${place}`
  }
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

/** 朝代先后（品牌副标题「先秦至清」按数据里最早、最晚的朝代取） */
const DYNASTY_ORDER = ['先秦', '秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '辽', '金', '元', '明', '清', '近代']

/** 「最早至最晚」；只有一个朝代时就是它；不认识的朝代不计 */
export function dynastySpan(dynasties: Iterable<string>): string {
  let lo = Infinity
  let hi = -1
  for (const d of dynasties) {
    const i = DYNASTY_ORDER.indexOf(d)
    if (i < 0) continue
    lo = Math.min(lo, i)
    hi = Math.max(hi, i)
  }
  if (hi < 0) return '历代'
  return lo === hi ? DYNASTY_ORDER[lo] : `${DYNASTY_ORDER[lo]}至${DYNASTY_ORDER[hi]}`
}
