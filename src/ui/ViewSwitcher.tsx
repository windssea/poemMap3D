import { VIEW_PRESETS } from '../engine/camera/CameraPresetRepository'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

/**
 * 视角：全国 / 江南 / 三峡 / 长安 / 长城 / 边塞；选中有定稿机位的名胜时，另出一组「取景」：主景 / 全景 / 近观……
 * 当前所在的视角、机位高亮（aria-pressed）；换到视角预设后，旧地点的取景按钮收起，再选地点才出来
 */
export function ViewSwitcher({ onPick }: { onPick?: () => void }) {
  const { facade, tour } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const touring = useApp((s) => s.tourState.active)
  const activeView = useApp((s) => s.activeView)
  const shotId = useApp((s) => s.selectedShotId)
  const shots = placeId && !touring && !activeView ? facade.placeShots(placeId) : []
  return (
    <>
      <div className="seg" role="group" aria-label="视角">
        <span className="lab">视角</span>
        {VIEW_PRESETS.map((v) => (
          <button
            key={v.key}
            className={activeView === v.key ? 'chip on' : 'chip'}
            aria-pressed={activeView === v.key}
            onClick={() => {
              if (tour.active) tour.stop()
              facade.flyToView(v.key)
              onPick?.()
            }}
          >
            {v.name}
          </button>
        ))}
      </div>
      {shots.length > 1 && (
        <div className="seg" role="group" aria-label="取景">
          <span className="lab">取景</span>
          {shots.map((s) => (
            <button
              key={s.id}
              className={shotId === s.id ? 'chip on' : 'chip'}
              aria-pressed={shotId === s.id}
              onClick={() => {
                facade.focusShot(placeId!, s.id)
                onPick?.()
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
