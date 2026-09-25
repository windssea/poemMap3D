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
 *  - 时辰：以白天为主；题目或首句写明夜色的才入夜（每片区至多一站），晨、暮偶尔点缀；
 *  - 天气：以晴为主；诗里写雨雪的才有机会下，每片区至多一站；
 *  - 选诗：每站配两首（多为一唐一宋），轮流展示。
 */
export function planTour(plan: TourPlanData, poetry: PoetryRepository, round: number, s: TourSettings): TourStop[] {
  const out: TourStop[] = []
  const rng = new Random(hashString(`tour-${round}`))
  plan.segments.forEach((seg, si) => {
    const season = SEASONS[(SEASONS.indexOf(seg.season) + round) % 4]
    const stops = seg.stops.filter((st) => !st.extra || s.count !== 'normal')
    let wet = 0
    let nights = 0
    stops.forEach((st, k) => {
      const poemId = st.poemIds[round % st.poemIds.length]
      const poem = poetry.get(poemId)
      if (!poem) return
      const head = poem.title + (poem.lines[0] ?? '')
      let time: TimeOfDay = 'day'
      if (/夜|宵|月明|明月/.test(head) && nights < 1) {
        time = 'night'
        nights++
      } else if (/[朝晓晨旦]/.test(head) && rng.chance(0.7)) time = 'dawn'
      else if (/[暮夕晚]/.test(head) && rng.chance(0.7)) time = 'dusk'
      else if (rng.chance(0.12)) time = TIMES[(k + si + round) % 2 === 0 ? 0 : 2]
      let weather: Weather = 'clear'
      const poemWet = /[雨雪]/.test(head)
      const cap = s.rain === 'none' ? 0 : s.rain === 'less' ? 1 : 2
      if (s.rain !== 'none' && ((poemWet && rng.chance(0.6)) || rng.chance(WET_P[season] * (s.rain === 'often' ? 0.8 : 0.25))) && wet < cap) {
        weather = season === 'winter' ? 'snow' : 'rain'
        wet++
      }
      out.push({ region: seg.region, note: st.note, poemId, placeId: poem.placeId, season, time, weather, sameRegion: k > 0 })
    })
  })
  return out
}
