import type { TourSettings } from '../app/AppStore'
import { useApp } from '../app/AppStore'
import { famousLines } from '../features/poetry/types'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

const OPTIONS: { key: keyof TourSettings; label: string; values: [TourSettings[keyof TourSettings], string][] }[] = [
  { key: 'speed', label: '速度', values: [[1, '普通'], [1.5, '快'], [2, '特快']] },
  { key: 'count', label: '数量', values: [['normal', '普通'], ['more', '多'], ['endless', '无尽']] },
  { key: 'dwell', label: '停留', values: [['short', '短'], ['mid', '中'], ['long', '长']] },
  { key: 'shot', label: '镜头', values: [['near', '近景'], ['mid', '中景'], ['far', '远景']] },
  { key: 'rain', label: '雨雪', values: [['less', '少'], ['often', '常'], ['none', '无']] },
  { key: 'ambience', label: '意境', values: [['change', '随站变化'], ['keep', '保持当前']] },
  { key: 'caption', label: '题诗', values: [[true, '显示'], [false, '隐藏']] },
]

/** 巡游：开始 / 停止 / 暂停、设置、当前站与题诗立轴 */
export function TourControls() {
  const { facade, tour, store } = useServices()
  const ts = useApp((s) => s.tourState)
  const open = useApp((s) => s.ui.tourSettingsOpen)
  return (
    <div className="panel grp" style={{ position: 'relative' }}>
      <button className={`ico ${ts.active ? 'on' : ''}`} title={ts.active ? '停止巡游' : '开始巡游'} onClick={() => (ts.active ? facade.stopTour() : facade.startTour())}>
        <Icon name={ts.active ? 'stop' : 'play'} />
      </button>
      {ts.active && (
        <button className="ico" title={ts.paused ? '继续' : '暂停'} onClick={() => tour.togglePause()}>
          <Icon name={ts.paused ? 'play' : 'pause'} />
        </button>
      )}
      <button className={`ico ${open ? 'on' : ''}`} title="巡游设置" onClick={() => store.set((s) => ({ ui: { ...s.ui, tourSettingsOpen: !s.ui.tourSettingsOpen } }))}>
        <Icon name="gear" />
      </button>
      {open && (
        <div className="panel settings-pop">
          {OPTIONS.map((o) => (
            <div key={o.key} className="amb-row">
              <span className="lab">{o.label}</span>
              {o.values.map(([v, name]) => (
                <button key={String(v)} className={`chip ${ts.settings[o.key] === v ? 'on' : ''}`} onClick={() => tour.updateSettings({ [o.key]: v } as Partial<TourSettings>)}>
                  {name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 巡游中的站名条与题诗立轴 */
export function TourCaption() {
  const { poetry } = useServices()
  const ts = useApp((s) => s.tourState)
  if (!ts.active) return null
  const poem = ts.poemId ? poetry.get(ts.poemId) : null
  return (
    <>
      <div className="chrome panel tour-bar">
        <span className="where">
          {ts.region}
          {ts.stopName && ` · ${ts.stopName}`}
          <small>
            {ts.index + 1} / {ts.total}
          </small>
        </span>
      </div>
      {poem && ts.settings.caption && (
        <div className="chrome hanging" key={poem.id}>
          <div className="v">
            <span className="tt">{poem.title}</span>
            <span className="au">
              {poem.dynasty} · {poem.author}
            </span>
            {famousLines(poem).map((l, i) => (
              <span className="ln" key={i}>
                {l}
              </span>
            ))}
          </div>
          <div className="stamp">{poem.author.slice(0, 1)}</div>
        </div>
      )}
    </>
  )
}
