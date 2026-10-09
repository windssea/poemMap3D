import { useCallback, useEffect, useState } from 'react'
import type { AppServices } from './app/bootstrap'
import { closedPops, useApp } from './app/AppStore'
import { DebugPanel } from './devtools/DebugPanel'
import { LightingDebugPanel } from './devtools/LightingDebugPanel'
import { Brand } from './ui/Brand'
import { Dock } from './ui/Dock'
import { LabelLayer } from './ui/LabelLayer'
import { LoadingScreen } from './ui/LoadingScreen'
import { PoetryPanel } from './ui/PoetryPanel'
import { SearchPanel } from './ui/SearchPanel'
import { ServicesContext } from './ui/ServicesContext'
import { SettingsPanel } from './ui/SettingsPanel'
import { TouchPeek } from './ui/TouchPeek'
import { TourCaption } from './ui/TourControls'
import { TrailPanel } from './ui/TrailPanel'
import { WorldCanvas } from './ui/WorldCanvas'
import { Icon } from './ui/icons'

/** 一阵子不操作，标题、搜索与底栏淡出，只留山河与地名；一动就回来 */
const IDLE_MS = 6000

export function App() {
  const [services, setServices] = useState<AppServices | null>(null)
  const onReady = useCallback((s: AppServices) => setServices(s), [])
  const hidden = useApp((s) => s.ui.hidden)
  const time = useApp((s) => s.time)

  /* 点到弹出面板以外的地方，面板收起 */
  useEffect(() => {
    if (!services) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as Element | null
      if (el?.closest('[data-pop], [data-pop-toggle]')) return
      if (services.store.get().ui.sheet) services.store.set((s) => ({ ui: closedPops(s.ui) }))
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [services])

  /* 拖地图时底栏淡下去（只认按在画面上的拖动），松手半秒后回来 */
  useEffect(() => {
    let t = 0
    const down = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('canvas')) return
      clearTimeout(t)
      t = window.setTimeout(() => document.body.classList.add('dragging'), 180)
    }
    const up = () => {
      clearTimeout(t)
      t = window.setTimeout(() => document.body.classList.remove('dragging'), 500)
    }
    addEventListener('pointerdown', down, true)
    addEventListener('pointerup', up, true)
    addEventListener('pointercancel', up, true)
    return () => {
      clearTimeout(t)
      removeEventListener('pointerdown', down, true)
      removeEventListener('pointerup', up, true)
      removeEventListener('pointercancel', up, true)
      document.body.classList.remove('dragging')
    }
  }, [])

  /* Esc：先收面板，再退出沉浸 */
  useEffect(() => {
    if (!services) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      const ui = services.store.get().ui
      if (ui.sheet) services.store.set((s) => ({ ui: closedPops(s.ui) }))
      else if (ui.hidden) services.store.set((s) => ({ ui: { ...s.ui, hidden: false } }))
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [services])

  /* 闲置淡出：开着面板、抽屉、足迹或正在输入时不淡 */
  useEffect(() => {
    if (!services) return
    const { store } = services
    let t = 0
    const check = () => {
      const s = store.get()
      const busy = !s.ui.idleFade || !!s.ui.sheet || s.panelState !== 'none' || !!s.trailState.poet || s.trailState.picking || document.activeElement?.tagName === 'INPUT'
      if (busy) t = window.setTimeout(check, IDLE_MS)
      else document.body.classList.add('idle')
    }
    const wake = () => {
      document.body.classList.remove('idle')
      clearTimeout(t)
      t = window.setTimeout(check, IDLE_MS)
    }
    const evs = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const
    for (const e of evs) addEventListener(e, wake, { capture: true, passive: true })
    wake()
    return () => {
      clearTimeout(t)
      for (const e of evs) removeEventListener(e, wake, { capture: true })
      document.body.classList.remove('idle')
    }
  }, [services])

  useEffect(() => {
    document.body.classList.toggle('ui-hidden', hidden)
    document.body.classList.toggle('night', time === 'night')
  }, [hidden, time])

  /* 沉浸观景：收起全部界面与地名，地图照样能转；角上留一枚小印恢复 */
  const immerse = useCallback(() => {
    if (!services) return
    services.navigation.selectPlace(null)
    services.store.set((s) => ({ ui: { ...s.ui, hidden: true, sheet: null }, touchTap: null }))
  }, [services])

  return (
    <>
      <WorldCanvas onReady={onReady} />
      <div className="vignette" aria-hidden />
      {services && (
        <ServicesContext.Provider value={services}>
          <LabelLayer />
          <Brand />
          <SearchPanel />
          <button className="chrome corner fade" title="沉浸观景：收起界面（Esc 恢复）" aria-label="沉浸观景" onClick={immerse}>
            <Icon name="expand" />
          </button>
          <PoetryPanel />
          <TrailPanel />
          <TourCaption />
          <Dock />
          <SettingsPanel onImmerse={immerse} />
          <TouchPeek />
          <DebugPanel />
          {import.meta.env.DEV && <LightingDebugPanel />}
          {hidden && (
            <button className="restore" title="显示界面（Esc）" aria-label="显示界面" onClick={() => services.store.set((s) => ({ ui: { ...s.ui, hidden: false } }))}>
              诗
            </button>
          )}
        </ServicesContext.Provider>
      )}
      <LoadingScreen />
    </>
  )
}
