import { useEffect } from 'react'
import type { TourSettings } from '../app/AppStore'
import { useApp } from '../app/AppStore'
import { Icon } from './icons'
import { useServices } from './ServicesContext'
import { VerseScroll } from './VerseScroll'

const OPTIONS: { key: keyof TourSettings; label: string; values: [TourSettings[keyof TourSettings], string][] }[] = [
  { key: 'speed', label: '速度', values: [[1, '普通'], [1.5, '快'], [2, '特快']] },
  { key: 'count', label: '数量', values: [['normal', '普通'], ['more', '多'], ['endless', '无尽']] },
  { key: 'dwell', label: '停留', values: [['short', '短'], ['mid', '中'], ['long', '长']] },
  { key: 'shot', label: '镜头', values: [['near', '近景'], ['mid', '中景'], ['far', '远景']] },
  { key: 'rain', label: '雨雪', values: [['less', '少'], ['often', '常'], ['none', '无']] },
  { key: 'ambience', label: '意境', values: [['change', '随站变化'], ['keep', '保持当前']] },
  { key: 'caption', label: '题诗', values: [[true, '显示'], [false, '隐藏']] },
]

function SettingsPop() {
  const { tour } = useServices()
  const ts = useApp((s) => s.tourState)
  return (
    <div className="panel settings-pop" onClick={(e) => e.stopPropagation()}>
      <div className="tp-h">巡游设置</div>
      {OPTIONS.map((o) => (
        <div key={o.key} className="amb-row">
          <span className="ap-k">{o.label}</span>
          {o.values.map(([v, name]) => (
            <button key={String(v)} className={`chip ${ts.settings[o.key] === v ? 'on' : ''}`} onClick={() => tour.updateSettings({ [o.key]: v } as Partial<TourSettings>)}>
              {name}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

/** 底栏里的巡游按钮与设置 */
export function TourControls() {
  const { facade, store } = useServices()
  const ts = useApp((s) => s.tourState)
  const open = useApp((s) => s.ui.tourSettingsOpen)
  return (
    <div className="panel grp" style={{ position: 'relative' }}>
      <button className={`ico ${ts.active ? 'on' : ''}`} title={ts.active ? '停止巡游' : '开始巡游'} onClick={() => (ts.active ? facade.stopTour() : facade.startTour())}>
        <Icon name={ts.active ? 'stop' : 'play'} />
      </button>
      <button className={`ico ${open ? 'on' : ''}`} title="巡游设置" onClick={() => store.set((s) => ({ ui: { ...s.ui, tourSettingsOpen: !s.ui.tourSettingsOpen } }))}>
        <Icon name="gear" />
      </button>
      {open && !ts.active && <SettingsPop />}
    </div>
  )
}

/** 巡游中：收起其余控件，只留巡游条；右侧展开题诗立轴 */
export function TourCaption() {
  const { poetry, facade, store, places } = useServices()
  const ts = useApp((s) => s.tourState)
  const peek = useApp((s) => s.ui.tourSettingsOpen)
  useEffect(() => {
    document.body.classList.toggle('touring', ts.active)
    return () => document.body.classList.remove('touring')
  }, [ts.active])
  if (!ts.active) return null
  const poem = ts.poemId ? poetry.get(ts.poemId) : null
  const place = poem ? places.get(poem.placeId) : null
  const placeName = ts.stopName || place?.name || ''
  return (
    <>
      <div className="tourbar">
        <span className="tb-dot" />
        <span className="tb-t">
          巡游中 · {ts.region}
          {placeName && ` · ${placeName}`}
        </span>
        <button title="巡游设置" onClick={() => store.set((s) => ({ ui: { ...s.ui, tourSettingsOpen: !s.ui.tourSettingsOpen } }))}>
          设置
        </button>
        <button className="stop" onClick={() => facade.stopTour()}>
          停止
        </button>
        {peek && <SettingsPop />}
      </div>
      {poem && ts.settings.caption && <VerseScroll key={`${poem.id}-${ts.index}`} poem={poem} place={ts.region === placeName ? placeName : `${ts.region} · ${placeName}`} />}
    </>
  )
}
