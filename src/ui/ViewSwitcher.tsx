import { VIEW_PRESETS } from '../engine/camera/CameraPresetRepository'
import { useServices } from './ServicesContext'

/** 视角：全国 / 江南 / 三峡 / 长安 / 长城 / 边塞 */
export function ViewSwitcher() {
  const { facade, tour } = useServices()
  return (
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
  )
}
