import { VIEW_PRESETS } from '../engine/camera/CameraPresetRepository'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

/** 视角：全国 / 江南 / 三峡 / 长安 / 长城 / 边塞；选中有定稿机位的名胜时，另出一组「取景」：主景 / 全景 / 近观 */
export function ViewSwitcher() {
  const { facade, tour } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const touring = useApp((s) => s.tourState.active)
  const shots = placeId && !touring ? facade.placeShots(placeId) : []
  return (
    <>
      <div className="panel grp">
        <span className="lab">视角</span>
        {VIEW_PRESETS.map((v) => (
          <button
            key={v.key}
            className="chip"
            onClick={() => {
              if (tour.active) tour.stop()
              facade.flyToView(v.key)
            }}
          >
            {v.name}
          </button>
        ))}
      </div>
      {shots.length > 1 && (
        <div className="panel grp">
          <span className="lab">取景</span>
          {shots.map((s) => (
            <button key={s.id} className="chip" onClick={() => facade.focusShot(placeId!, s.id)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
