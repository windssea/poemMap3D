import type { ReactNode } from 'react'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

/**
 * 视角：只留「全国」一键回到全景；选中有定稿机位的名胜时，另出一组「取景」：主景 / 全景 / 近观……
 * 当前机位高亮（aria-pressed）；回到全国后取景按钮收起，再选地点才出来
 */
export function ViewSwitcher() {
  const { facade } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const touring = useApp((s) => s.tourState.active)
  const activeView = useApp((s) => s.activeView)
  const shotId = useApp((s) => s.selectedShotId)
  const shots = placeId && !touring && !activeView ? facade.placeShots(placeId) : []
  return (
    <>
      <div className="dseg" role="group" aria-label="视角">
        <HomeButton className={`chip ${activeView === 'home' ? 'on' : ''}`} />
      </div>
      {shots.length > 1 && (
        <div className="dseg" role="group" aria-label="取景">
          <span className="lab">取景</span>
          {shots.map((s) => (
            <button key={s.id} className={shotId === s.id ? 'chip on' : 'chip'} aria-pressed={shotId === s.id} onClick={() => facade.focusShot(placeId!, s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </>
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
