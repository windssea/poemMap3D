import { useApp } from '../app/AppStore'
import { SEASON_NAMES, SEASONS, TIME_NAMES, TIMES, WEATHER_NAMES } from '../engine/environment/types'
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
      <div className="dseg" role="group" aria-label="时辰">
        <span className="lab">时辰</span>
        {TIMES.map((t) => (
          <button key={t} className={`chip ${t === time ? 'on' : ''}`} aria-pressed={t === time} onClick={() => facade.setTime(t)}>
            {TIME_NAMES[t]}
          </button>
        ))}
      </div>
      <div className="dseg" role="group" aria-label="四季">
        <span className="lab">四季</span>
        {SEASONS.map((s) => (
          <button key={s} className={`chip ${s === season ? 'on' : ''}`} aria-pressed={s === season} onClick={() => facade.setSeason(s)}>
            {SEASON_NAMES[s]}
          </button>
        ))}
      </div>
      <div className="dseg" role="group" aria-label="天气">
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

type PickerKey = 'time' | 'season' | 'weather'

/** 宽屏底栏的一项：只显示当前值（「时辰 昼」），点开在上方弹出这一项的几个选项，选了就收 */
function Picker({ k, label, value, options }: { k: PickerKey; label: string; value: string; options: { key: string; name: string; on: boolean; pick: () => void }[] }) {
  const { store } = useServices()
  const open = useApp((s) => s.ui.sheet === k)
  const close = () => store.set((s) => ({ ui: { ...s.ui, sheet: null } }))
  return (
    <div className="picker">
      <button className={`pk ${open ? 'open' : ''}`} aria-expanded={open} aria-label={`${label}：${value}`} data-pop-toggle onClick={() => store.set((s) => ({ ui: { ...s.ui, sheet: open ? null : k } }))}>
        <span className="pk-l">{label}</span>
        <b>{value}</b>
      </button>
      {open && (
        <div className="pk-pop" data-pop role="group" aria-label={label}>
          {options.map((o) => (
            <button
              key={o.key}
              className={`chip ${o.on ? 'on' : ''}`}
              aria-pressed={o.on}
              onClick={() => {
                o.pick()
                close()
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 宽屏底栏的意境：时辰、四季、天气各一个收起的小按钮 */
export function AmbiencePickers() {
  const { facade } = useServices()
  const time = useApp((s) => s.time)
  const season = useApp((s) => s.season)
  const weather = useApp((s) => s.weather)
  const wet = weather === 'rain' || weather === 'snow'
  return (
    <div className="dseg pickers">
      <Picker k="time" label="时辰" value={TIME_NAMES[time]} options={TIMES.map((t) => ({ key: t, name: TIME_NAMES[t], on: t === time, pick: () => facade.setTime(t) }))} />
      <Picker k="season" label="四季" value={SEASON_NAMES[season]} options={SEASONS.map((s) => ({ key: s, name: SEASON_NAMES[s], on: s === season, pick: () => facade.setSeason(s) }))} />
      <Picker
        k="weather"
        label="天气"
        value={WEATHER_NAMES[weather]}
        options={[
          { key: 'clear', name: '晴', on: weather === 'clear', pick: () => facade.setWeather('clear') },
          { key: 'wet', name: season === 'winter' ? '雪' : '雨', on: wet, pick: () => facade.setWeather(season === 'winter' ? 'snow' : 'rain') },
          { key: 'mist', name: '雾', on: weather === 'mist', pick: () => facade.setWeather('mist') },
        ]}
      />
    </div>
  )
}
