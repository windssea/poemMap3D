import { useApp } from '../app/AppStore'
import { SEASON_NAMES, SEASONS, TIME_NAMES, TIMES } from '../engine/environment/types'
import { useServices } from './ServicesContext'

/**
 * 意境：时辰 × 四季 × 天气，三组平铺，点一下就换，可任意叠加；冬季的「雨」即雪。
 * 宽屏放在底栏里（一组一格），手机放在意境抽屉里（一组一行）。
 */
export function AmbienceControls() {
  const { facade } = useServices()
  const time = useApp((s) => s.time)
  const season = useApp((s) => s.season)
  const weather = useApp((s) => s.weather)
  const wet = weather === 'rain' || weather === 'snow'
  return (
    <>
      <div className="seg" role="group" aria-label="时辰">
        <span className="lab">时辰</span>
        {TIMES.map((t) => (
          <button key={t} className={`chip ${t === time ? 'on' : ''}`} aria-pressed={t === time} onClick={() => facade.setTime(t)}>
            {TIME_NAMES[t]}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="四季">
        <span className="lab">四季</span>
        {SEASONS.map((s) => (
          <button key={s} className={`chip ${s === season ? 'on' : ''}`} aria-pressed={s === season} onClick={() => facade.setSeason(s)}>
            {SEASON_NAMES[s]}
          </button>
        ))}
      </div>
      <div className="seg" role="group" aria-label="天气">
        <span className="lab">天气</span>
        <button className={`chip ${weather === 'clear' ? 'on' : ''}`} aria-pressed={weather === 'clear'} onClick={() => facade.setWeather('clear')}>
          晴
        </button>
        <button className={`chip ${wet ? 'on' : ''}`} aria-pressed={wet} onClick={() => facade.setWeather(season === 'winter' ? 'snow' : 'rain')}>
          {season === 'winter' ? '雪' : '雨'}
        </button>
        <button className={`chip ${weather === 'mist' ? 'on' : ''}`} aria-pressed={weather === 'mist'} onClick={() => facade.setWeather('mist')}>
          雾
        </button>
      </div>
    </>
  )
}
