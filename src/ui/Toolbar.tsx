import { useApp } from '../app/AppStore'
import { MUSIC_MODES, NATURE_MODES, SOUND_NAMES } from '../app/AmbientSound'
import { QUALITY_PRESETS, type Quality } from '../engine/rendering/QualityManager'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

const ORDER: Quality[] = ['mid', 'high', 'low']

/** 回到全国、画质、截图、隐藏界面、自动取景、背景音（调试面板改由地址栏 ?debug 打开） */
export function Toolbar() {
  const services = useServices()
  const { facade, store, tour } = services
  const autoCam = useApp((s) => s.autoCamera)
  const sound = useApp((s) => s.sound)
  const soundOpen = useApp((s) => s.ui.soundOpen)
  const quality = useApp((s) => s.quality)
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
      <button className={`ico ${autoCam ? 'on' : ''}`} title={autoCam ? '自动取景：开（点地名时镜头自动对准）' : '自动取景：关（点地名只展开诗目，镜头不动）'} onClick={() => store.set({ autoCamera: !autoCam })}>
        <Icon name="frame" />
      </button>
      <div style={{ position: 'relative' }}>
        <button data-pop-toggle className={`ico ${sound !== 'off' ? 'on' : ''}`} title={`背景音：${SOUND_NAMES[sound]}`} onClick={() => store.set((s) => ({ ui: { ...s.ui, soundOpen: !s.ui.soundOpen } }))}>
          <Icon name={sound === 'off' ? 'mute' : 'sound'} />
        </button>
        {soundOpen && (
          <div className="panel amb-pop sound-pop" data-pop>
            {([['自然', NATURE_MODES], ['古乐', MUSIC_MODES]] as const).map(([lab, modes]) => (
              <div className="amb-row" key={lab}>
                <span className="lab">{lab}</span>
                {modes.map((m) => (
                  <button
                    key={m}
                    className={`chip ${m === sound ? 'on' : ''}`}
                    title={m === 'auto' ? '随季节、时辰、天气自动调配' : undefined}
                    onClick={() => {
                      services.sound.setMode(m)
                      store.set((s) => ({ sound: m, ui: { ...s.ui, soundOpen: false } }))
                    }}
                  >
                    {SOUND_NAMES[m]}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
