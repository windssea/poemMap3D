import { useEffect } from 'react'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'
import { VerseScroll } from './VerseScroll'

/** 漫游中：收起其余控件，只留漫游条（设置打开统一的设置面板）；右侧展开题诗立轴 */
export function TourCaption() {
  const { poetry, facade, store, places } = useServices()
  const ts = useApp((s) => s.tourState)
  const settingsOpen = useApp((s) => s.ui.sheet === 'settings')
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
          漫游中 · {ts.region}
          {placeName && ` · ${placeName}`}
        </span>
        <button title="漫游设置" data-pop-toggle aria-pressed={settingsOpen} onClick={() => store.set((s) => ({ ui: { ...s.ui, sheet: s.ui.sheet === 'settings' ? null : 'settings' } }))}>
          设置
        </button>
        <button className="stop" onClick={() => facade.stopTour()}>
          停止
        </button>
      </div>
      {poem && ts.settings.caption && <VerseScroll key={`${poem.id}-${ts.index}`} poem={poem} place={ts.region === placeName ? placeName : `${ts.region} · ${placeName}`} />}
    </>
  )
}
