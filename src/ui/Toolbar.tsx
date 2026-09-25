import { useApp } from '../app/AppStore'
import { QUALITY_PRESETS, type Quality } from '../engine/rendering/QualityManager'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

const ORDER: Quality[] = ['mid', 'high', 'low']

/** 回到全国、画质、截图、隐藏界面、调试 */
export function Toolbar() {
  const { facade, store, tour } = useServices()
  const quality = useApp((s) => s.quality)
  const debug = useApp((s) => s.debug)
  return (
    <div className="panel grp">
      <button
        className="ico"
        title="回到全国"
        onClick={() => {
          if (tour.active) tour.stop()
          facade.flyToView('home')
        }}
      >
        <Icon name="home" />
      </button>
      <button className="chip" title="画质（高 · 衡 · 轻）" onClick={() => facade.setQuality(ORDER[(ORDER.indexOf(quality) + 1) % 3])}>
        {QUALITY_PRESETS[quality]?.label ?? '衡'}
      </button>
      <button
        className="ico"
        title="截图"
        onClick={() => {
          const a = document.createElement('a')
          a.href = facade.screenshot()
          a.download = '山河诗卷.png'
          a.click()
        }}
      >
        <Icon name="camera" />
      </button>
      <button className="ico" title="隐藏界面（任意处单击恢复）" onClick={() => store.set((s) => ({ ui: { ...s.ui, hidden: true } }))}>
        <Icon name="eye" />
      </button>
      <button
        className={`ico ${debug.chunks ? 'on' : ''}`}
        title="调试：区块边界、地形取样"
        onClick={() => {
          const on = !debug.chunks
          facade.setDebugChunks(on)
          store.set({ debug: { chunks: on, terrain: on } })
        }}
      >
        <Icon name="bug" />
      </button>
    </div>
  )
}
