import { useApp } from '../app/AppStore'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

/** 诗人足迹：挑选诗人 → 光带与生平站点 */
export function TrailPanel() {
  const { trails, facade, store } = useServices()
  const state = useApp((s) => s.trailState)
  if (state.picking)
    return (
      <div className="chrome panel trail">
        <header>
          <b>诗人足迹</b>
          <button className="ico" style={{ marginLeft: 'auto' }} onClick={() => store.set({ trailState: { ...state, picking: false } })}>
            <Icon name="close" />
          </button>
        </header>
        <div className="poets">
          {trails.all().map((t) => (
            <button key={t.poet} onClick={() => facade.showPoetTrail(t.poet)}>
              <i style={{ background: t.color }} />
              <b>{t.poet}</b>
              <span>
                {t.years} · {t.stops.length} 站
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  if (!state.poet) return null
  const t = trails.get(state.poet)
  if (!t) return null
  return (
    <div className="chrome panel trail">
      <header>
        <i style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, display: 'inline-block' }} />
        <b>{t.poet}</b>
        <small style={{ color: 'var(--ink3)' }}>{t.years}</small>
        <button className="ico" style={{ marginLeft: 'auto' }} title="收起足迹" onClick={() => facade.hidePoetTrail()}>
          <Icon name="close" />
        </button>
      </header>
      <ol>
        {t.stops.map((s, i) => (
          <li key={i}>
            <button onClick={() => facade.flyToGeo(s.lng, s.lat, 300)}>
              <span className="yr">{s.year}</span>
              <span className="pl">{s.place}</span>
              <span className="nt">{s.note}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
