import { useCallback, useEffect, useState } from 'react'
import type { AppServices } from './app/bootstrap'
import { useApp } from './app/AppStore'
import { DebugPanel } from './devtools/DebugPanel'
import { AmbienceControls } from './ui/AmbienceControls'
import { Brand } from './ui/Brand'
import { LabelLayer } from './ui/LabelLayer'
import { LoadingScreen } from './ui/LoadingScreen'
import { PoetryPanel } from './ui/PoetryPanel'
import { SearchPanel } from './ui/SearchPanel'
import { ServicesContext } from './ui/ServicesContext'
import { Toolbar } from './ui/Toolbar'
import { TourCaption, TourControls } from './ui/TourControls'
import { TrailPanel } from './ui/TrailPanel'
import { ViewSwitcher } from './ui/ViewSwitcher'
import { WorldCanvas } from './ui/WorldCanvas'

export function App() {
  const [services, setServices] = useState<AppServices | null>(null)
  const onReady = useCallback((s: AppServices) => setServices(s), [])
  const hidden = useApp((s) => s.ui.hidden)
  const time = useApp((s) => s.time)

  useEffect(() => {
    document.body.classList.toggle('ui-hidden', hidden)
    document.body.classList.toggle('night', time === 'night')
  }, [hidden, time])

  return (
    <>
      <WorldCanvas onReady={onReady} />
      {services && (
        <ServicesContext.Provider value={services}>
          <LabelLayer />
          <Brand />
          <SearchPanel />
          <PoetryPanel />
          <TrailPanel />
          <TourCaption />
          <div className="chrome dock">
            <ViewSwitcher />
            <AmbienceControls />
            <TourControls />
            <Toolbar />
          </div>
          <div className="chrome hint">拖动观景 · 右键平移 · 滚轮远近 · 点地名读诗</div>
          <DebugPanel />
          {hidden && <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => services.store.set((s) => ({ ui: { ...s.ui, hidden: false } }))} />}
        </ServicesContext.Provider>
      )}
      <LoadingScreen />
    </>
  )
}
