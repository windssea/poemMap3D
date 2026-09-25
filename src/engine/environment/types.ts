export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
/** 雨在冬季即为雪；也可直接指定 snow */
export type Weather = 'clear' | 'rain' | 'snow'

export const TIME_NAMES: Record<TimeOfDay, string> = { dawn: '晨', day: '昼', dusk: '暮', night: '夜' }
export const SEASON_NAMES: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }
export const WEATHER_NAMES: Record<Weather, string> = { clear: '晴', rain: '雨', snow: '雪' }
export const TIMES: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night']
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
