import type { TourSettings } from '../../app/AppStore'
import type { Season, TimeOfDay, Weather } from '../../engine/environment/types'
import { hashString, Random } from '../../utils/math'
import type { PoetryRepository } from '../poetry/PoetryRepository'

export interface TourPlanData {
  segments: {
    region: string
    season: Season
    time: TimeOfDay
    weather: 'clear' | 'rain'
    stops: { poemIds: string[]; note: string; extra: boolean }[]
  }[]
}

export interface TourStop {
  region: string
  note: string
  poemId: string
  placeId: string
  season: Season
  time: TimeOfDay
  weather: Weather
  /** 是否与上一站同一片区（片区内短距滑移，片区间升高远渡） */
  sameRegion: boolean
}

const TIMES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night']
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
const WET_P: Record<Season, number> = { spring: 0.4, summer: 0.3, autumn: 0.2, winter: 0.5 }

/**
 * 巡游编排：江南 → 洛阳 → 长安 → 三峡 → 川蜀 → 边塞。
 *  - 季节：每片区一季，每巡一轮顺移一季，每个地方都会轮到四季；
 *  - 时辰：诗意优先（夜 / 月 → 夜，朝 / 晓 → 晨，暮 / 夕 → 暮），其余段内错开；
 *  - 天气：诗里有雨雪就下，其余按季节概率取固定种子伪随机，雨雪不超过一半；
 *  - 选诗：每站配两首（多为一唐一宋），轮流展示。
 */
export function planTour(plan: TourPlanData, poetry: PoetryRepository, round: number, s: TourSettings): TourStop[] {
  const out: TourStop[] = []
  const rng = new Random(hashString(`tour-${round}`))
  plan.segments.forEach((seg, si) => {
    const season = SEASONS[(SEASONS.indexOf(seg.season) + round) % 4]
    const stops = seg.stops.filter((st) => !st.extra || s.count !== 'normal')
    let wet = 0
    stops.forEach((st, k) => {
      const poemId = st.poemIds[round % st.poemIds.length]
      const poem = poetry.get(poemId)
      if (!poem) return
      const text = poem.title + poem.lines.join('')
      let time: TimeOfDay = TIMES[(k + si + round) % 3]
      if (/[夜月]/.test(text)) time = 'night'
      else if (/[朝晓晨旦]/.test(text)) time = 'dawn'
      else if (/[暮夕晚]/.test(text)) time = 'dusk'
      let weather: Weather = 'clear'
      const poemWet = /[雨雪]/.test(text)
      const cap = s.rain === 'none' ? 0 : s.rain === 'less' ? 1 : Math.ceil(stops.length / 2)
      if (s.rain !== 'none' && (poemWet || rng.chance(WET_P[season] * (s.rain === 'often' ? 1.6 : 0.7))) && wet < cap) {
        weather = season === 'winter' ? 'snow' : 'rain'
        wet++
      }
      out.push({ region: seg.region, note: st.note, poemId, placeId: poem.placeId, season, time, weather, sameRegion: k > 0 })
    })
  })
  return out
}
