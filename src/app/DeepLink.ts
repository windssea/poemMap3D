import type { Season, TimeOfDay, Weather } from '../engine/environment/types'

/**
 * 可分享的地址：?p=地点&poem=诗&shot=机位&shs=季节&shw=天气&shm=时辰。
 * 「月夜枫桥」「暮色嘉峪关」这样的画面能直接打开：地点、诗、机位与时令天气一并还原。
 * 解析只做格式与取值范围的校验；地点、诗、机位是否存在由调用方对照数据判断，不存在的静默忽略（回到默认首页）。
 */
export interface DeepLinkState {
  place: string | null
  poem: string | null
  shot: string | null
  season: Season | null
  weather: Weather | null
  time: TimeOfDay | null
}

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter']
const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'mist']
const TIMES: readonly TimeOfDay[] = ['dawn', 'day', 'dusk', 'night']
/** id 只许字母、数字、连字符、下划线（防注入、防超长） */
const ID = /^[A-Za-z0-9_-]{1,64}$/

const pick = <T extends string>(v: string | null, ok: readonly T[]): T | null => (v !== null && (ok as readonly string[]).includes(v) ? (v as T) : null)
const id = (v: string | null): string | null => (v !== null && ID.test(v) ? v : null)

export function parseDeepLink(search: string): DeepLinkState {
  const q = new URLSearchParams(search)
  return {
    place: id(q.get('p')),
    poem: id(q.get('poem')),
    shot: id(q.get('shot')),
    season: pick(q.get('shs'), SEASONS),
    weather: pick(q.get('shw'), WEATHERS),
    time: pick(q.get('shm'), TIMES),
  }
}

/**
 * 由当前状态生成地址参数。保留与分享无关的其他参数（q 画质、开发调试位），只改写这六个键；
 * 没选地点时不带 p / poem / shot。返回以 ? 开头的查询串（为空时返回空串）。
 */
export function encodeDeepLink(s: DeepLinkState, base = ''): string {
  const q = new URLSearchParams(base)
  const set = (k: string, v: string | null) => (v ? q.set(k, v) : q.delete(k))
  set('p', s.place)
  set('poem', s.place ? s.poem : null)
  set('shot', s.place ? s.shot : null)
  set('shs', s.season)
  set('shw', s.weather)
  set('shm', s.time)
  const out = q.toString()
  return out ? `?${out}` : ''
}

/** 地点与诗是否相同：只换机位、时令、天气时用 replaceState，不往浏览器历史里塞一条（拖动镜头清掉机位也不算一步） */
export function sameView(a: DeepLinkState, b: DeepLinkState): boolean {
  return a.place === b.place && a.poem === b.poem
}
