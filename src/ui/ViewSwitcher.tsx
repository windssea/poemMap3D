import type { ReactNode } from 'react'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

/** 视角：只留「全国」一键回到全景（取景机位按钮组暂时不出） */
export function ViewSwitcher() {
  const activeView = useApp((s) => s.activeView)
  return (
    <div className="dseg" role="group" aria-label="视角">
      <HomeButton className={`chip ${activeView === 'home' ? 'on' : ''}`} />
    </div>
  )
}

/** 回到全国全景（漫游中点了先停漫游） */
export function HomeButton({ className, children }: { className: string; children?: ReactNode }) {
  const { facade, tour } = useServices()
  const on = useApp((s) => s.activeView === 'home')
  return (
    <button
      className={className}
      aria-pressed={on}
      title="回到全国全景"
      onClick={() => {
        if (tour.active) tour.stop()
        facade.flyToView('home')
      }}
    >
      {children ?? '全国'}
    </button>
  )
}
