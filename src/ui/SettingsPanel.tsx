import type { ReactNode } from 'react'
import type { TourSettings } from '../app/AppStore'
import { useApp } from '../app/AppStore'
import { buildLabel } from '../app/buildInfo'
import { MUSIC_MODES, NATURE_MODES, SOUND_NAMES, type SoundMode } from '../app/AmbientSound'
import { QUALITY_PRESETS, type Quality, VIEW_RANGES, type ViewRange } from '../engine/rendering/QualityManager'
import { useServices } from './ServicesContext'

const QUALITIES: { q: Quality; sub: string; tip: string }[] = [
  { q: 'low', sub: '省电', tip: '无阴影，适合低配与手机' },
  { q: 'mid', sub: '标准', tip: '两级阴影、泛光与调色' },
  { q: 'high', sub: '精细', tip: '三级阴影、屏幕空间环境光' },
]

const TOUR_OPTIONS: { key: keyof TourSettings; label: string; values: [TourSettings[keyof TourSettings], string][] }[] = [
  { key: 'speed', label: '速度', values: [[1, '普通'], [1.5, '快'], [2, '特快']] },
  { key: 'count', label: '数量', values: [['normal', '普通'], ['more', '多'], ['endless', '无尽']] },
  { key: 'dwell', label: '停留', values: [['short', '短'], ['mid', '中'], ['long', '长']] },
  { key: 'shot', label: '镜头', values: [['near', '近景'], ['mid', '中景'], ['far', '远景']] },
  { key: 'rain', label: '雨雪', values: [['less', '少'], ['often', '常'], ['none', '无']] },
  { key: 'ambience', label: '意境', values: [['change', '随站变化'], ['keep', '保持当前']] },
  { key: 'caption', label: '题诗', values: [[true, '显示'], [false, '隐藏']] },
]

function Chip({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: ReactNode }) {
  return (
    <button className={`chip ${on ? 'on' : ''}`} aria-pressed={on} title={title} onClick={onClick}>
      {children}
    </button>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="set-row" role="group" aria-label={k}>
      <span className="set-k">{k}</span>
      <div className="set-v">{children}</div>
    </div>
  )
}

/** 设置：画面、镜头、声音、漫游、界面统一放在一处；宽屏是右下角的卡片，手机是底部抽屉 */
export function SettingsPanel({ onImmerse }: { onImmerse: () => void }) {
  const { facade, store, tour, sound: soundSvc } = useServices()
  const open = useApp((s) => s.ui.sheet === 'settings')
  const quality = useApp((s) => s.quality)
  const view = useApp((s) => s.viewRange)
  const autoCam = useApp((s) => s.autoCamera)
  const sound = useApp((s) => s.sound)
  const tourSettings = useApp((s) => s.tourState.settings)
  const idleFade = useApp((s) => s.ui.idleFade)
  if (!open) return null
  const setSound = (m: SoundMode) => {
    soundSvc.setMode(m)
    store.set({ sound: m })
  }
  return (
    <div className="chrome panel settings sheet" data-pop role="dialog" aria-label="设置">
      <div className="sheet-h">
        <b>设置</b>
        <button className="sheet-x" aria-label="关闭" onClick={() => store.set((s) => ({ ui: { ...s.ui, sheet: null } }))}>
          ×
        </button>
      </div>
      <div className="set-body">
        <section>
          <h4>画面</h4>
          <Row k="画质">
            {QUALITIES.map(({ q, sub, tip }) => (
              <Chip key={q} on={q === quality} title={tip} onClick={() => facade.setQuality(q)}>
                {QUALITY_PRESETS[q].label}
                <small>{sub}</small>
              </Chip>
            ))}
          </Row>
          <Row k="视距">
            {VIEW_RANGES.map((v, i) => (
              <Chip key={v.label} on={i === view} onClick={() => facade.setViewRange(i as ViewRange)}>
                {v.label}
              </Chip>
            ))}
          </Row>
          <p className="set-note">视距越远看得越清楚，也越吃内存与显卡，载入更久。</p>
        </section>
        <section>
          <h4>镜头</h4>
          <Row k="点地名时自动移动镜头">
            <Chip on={autoCam} onClick={() => store.set({ autoCamera: true })}>
              开
            </Chip>
            <Chip on={!autoCam} onClick={() => store.set({ autoCamera: false })}>
              关
            </Chip>
          </Row>
        </section>
        <section>
          <h4>声音</h4>
          {([['自然', NATURE_MODES], ['古乐', MUSIC_MODES]] as const).map(([lab, modes]) => (
            <Row k={lab} key={lab}>
              {modes.map((m) => (
                <Chip key={m} on={m === sound} title={m === 'auto' ? '随季节、时辰、天气自动调配' : undefined} onClick={() => setSound(m)}>
                  {SOUND_NAMES[m]}
                </Chip>
              ))}
            </Row>
          ))}
        </section>
        <section>
          <h4>漫游</h4>
          {TOUR_OPTIONS.map((o) => (
            <Row k={o.label} key={o.key}>
              {o.values.map(([v, name]) => (
                <Chip key={String(v)} on={tourSettings[o.key] === v} onClick={() => tour.updateSettings({ [o.key]: v } as Partial<TourSettings>)}>
                  {name}
                </Chip>
              ))}
            </Row>
          ))}
        </section>
        <section>
          <h4>界面</h4>
          <Row k="闲置时界面淡出">
            <Chip on={idleFade} onClick={() => store.set((s) => ({ ui: { ...s.ui, idleFade: true } }))}>
              开
            </Chip>
            <Chip on={!idleFade} onClick={() => store.set((s) => ({ ui: { ...s.ui, idleFade: false } }))}>
              关
            </Chip>
          </Row>
          <div className="set-acts">
            <button className="act" onClick={onImmerse}>
              沉浸观景
            </button>
            <button
              className="act"
              title="只保存山河画面，不含诗卷与界面"
              onClick={() => {
                const a = document.createElement('a')
                a.href = facade.screenshot()
                a.download = '山河诗卷.png'
                a.click()
              }}
            >
              保存景色
            </button>
          </div>
        </section>
        <p className="set-ver">{buildLabel()}</p>
      </div>
    </div>
  )
}
