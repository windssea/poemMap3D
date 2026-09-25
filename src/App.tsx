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
import { Icon } from './ui/icons'

/** 界面折叠状态（每位观者自己的偏好，存在本机） */
function useFold(key: string): [boolean, () => void] {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  })
  const toggle = () =>
    setOn((v) => {
      try {
        localStorage.setItem(key, v ? '0' : '1')
      } catch {
        /* 无痕模式等 */
      }
      return !v
    })
  return [on, toggle]
}

export function App() {
  const [services, setServices] = useState<AppServices | null>(null)
  const onReady = useCallback((s: AppServices) => setServices(s), [])
  const hidden = useApp((s) => s.ui.hidden)
  const time = useApp((s) => s.time)
  const [dockFolded, toggleDock] = useFold('sh-dock')
  const [headFolded, toggleHead] = useFold('sh-head')

  useEffect(() => {
    document.body.classList.toggle('ui-hidden', hidden)
    document.body.classList.toggle('night', time === 'night')
    document.body.classList.toggle('head-folded', headFolded)
  }, [hidden, time, headFolded])

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
          <button className="chrome head-tog" title={headFolded ? '展开标题与搜索' : '收起标题与搜索'} onClick={toggleHead}>
            <Icon name="chevron" />
          </button>
          <div className={dockFolded ? 'chrome dock folded' : 'chrome dock'}>
            <button className="panel grp dock-tog" title={dockFolded ? '展开按钮' : '收起按钮'} onClick={toggleDock}>
              <span className="ico">
                <Icon name="chevron" />
              </span>
            </button>
            <ViewSwitcher />
            <AmbienceControls />
            <TourControls />
            <Toolbar />
          </div>
          <DebugPanel />
          {hidden && <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => services.store.set((s) => ({ ui: { ...s.ui, hidden: false } }))} />}
        </ServicesContext.Provider>
      )}
      <LoadingScreen />
    </>
  )
}
