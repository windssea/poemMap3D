import { useApp } from '../app/AppStore'
import { SEASON_NAMES, SEASONS, TIME_NAMES, TIMES, WEATHER_NAMES } from '../engine/environment/types'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

/** 意境：时辰 × 四季 × 天气，任意叠加；冬季的「雨」即雪 */
export function AmbienceControls() {
  const { facade, store } = useServices()
  const time = useApp((s) => s.time)
  const season = useApp((s) => s.season)
  const weather = useApp((s) => s.weather)
  const open = useApp((s) => s.ui.ambienceOpen)
  const wetName = season === 'winter' ? '雪' : '雨'
  return (
    <div className="panel grp" style={{ position: 'relative' }}>
      <span className="lab">意境</span>
      <button className="chip" data-pop-toggle onClick={() => store.set((s) => ({ ui: { ...s.ui, ambienceOpen: !s.ui.ambienceOpen } }))}>
        {SEASON_NAMES[season]} · {TIME_NAMES[time]} · {WEATHER_NAMES[weather]}
        <span style={{ display: 'inline-block', transform: open ? 'none' : 'rotate(180deg)', marginLeft: 4, verticalAlign: -3 }}>
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div className="panel amb-pop" data-pop>
          <div className="amb-row">
            <span className="lab">时辰</span>
            {TIMES.map((t) => (
              <button key={t} className={`chip ${t === time ? 'on' : ''}`} onClick={() => facade.setTime(t)}>
                {TIME_NAMES[t]}
              </button>
            ))}
          </div>
          <div className="amb-row">
            <span className="lab">四季</span>
            {SEASONS.map((s) => (
              <button key={s} className={`chip ${s === season ? 'on' : ''}`} onClick={() => facade.setSeason(s)}>
                {SEASON_NAMES[s]}
              </button>
            ))}
          </div>
          <div className="amb-row">
            <span className="lab">天气</span>
            <button className={`chip ${weather === 'clear' ? 'on' : ''}`} onClick={() => facade.setWeather('clear')}>
              晴
            </button>
            <button className={`chip ${weather !== 'clear' ? 'on' : ''}`} onClick={() => facade.setWeather(season === 'winter' ? 'snow' : 'rain')}>
              {wetName}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
