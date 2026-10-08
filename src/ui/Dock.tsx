import type { ReactNode } from 'react'
import { type Sheet, useApp } from '../app/AppStore'
import { SOUND_MODES, SOUND_NAMES, type SoundMode } from '../app/AmbientSound'
import { AmbienceControls } from './AmbienceControls'
import { Icon, type IconName } from './icons'
import { useServices } from './ServicesContext'
import { useMobile } from './useMobile'
import { HomeButton, ViewSwitcher } from './ViewSwitcher'

const LAST_SOUND = 'shsd-last'

/** 声音一键开关：关时记下当时的声，再开就回到它（第一次开是「随境」） */
function useSoundToggle(): [boolean, string, () => void] {
  const { store, sound } = useServices()
  const mode = useApp((s) => s.sound)
  const toggle = () => {
    let next: SoundMode = 'off'
    try {
      if (mode === 'off') {
        const last = localStorage.getItem(LAST_SOUND) as SoundMode | null
        next = last && last !== 'off' && SOUND_MODES.includes(last) ? last : 'auto'
      } else localStorage.setItem(LAST_SOUND, mode)
    } catch {
      next = mode === 'off' ? 'auto' : 'off'
    }
    sound.setMode(next)
    store.set({ sound: next })
  }
  return [mode !== 'off', SOUND_NAMES[mode], toggle]
}

function useSheet(): [Sheet | null, (s: Sheet) => void, () => void] {
  const { store } = useServices()
  const sheet = useApp((s) => s.ui.sheet)
  const toggle = (k: Sheet) => store.set((s) => ({ ui: { ...s.ui, sheet: s.ui.sheet === k ? null : k } }))
  const close = () => store.set((s) => ({ ui: { ...s.ui, sheet: null } }))
  return [sheet, toggle, close]
}

/** 图标 + 两字说明的按钮（手机上 title 提示看不到，说明直接写出来）；row：宽屏底栏里图标与字并排，矮一些 */
function Tool({ icon, label, on, onClick, pop, title, row }: { icon: IconName; label: string; on?: boolean; onClick: () => void; pop?: boolean; title?: string; row?: boolean }) {
  return (
    <button className={`tool ${row ? 'row' : ''} ${on ? 'on' : ''}`} aria-pressed={on} title={title} data-pop-toggle={pop || undefined} onClick={onClick}>
      <Icon name={icon} size={19} />
      <span>{label}</span>
    </button>
  )
}

/** 底栏：宽屏一条（全国 · 意境 · 漫游/足迹/声/设置，都一下就到）；手机一排图标 + 抽屉 */
export function Dock() {
  return useMobile() ? <MobileDock /> : <DesktopDock />
}

function DesktopDock() {
  const { facade, store } = useServices()
  const touring = useApp((s) => s.tourState.active)
  const picking = useApp((s) => s.trailState.picking)
  const [sheet, toggleSheet] = useSheet()
  const [soundOn, soundName, toggleSound] = useSoundToggle()
  return (
    <div className="chrome dock fade">
      <div className="panel dbar">
        <ViewSwitcher />
        <AmbienceControls />
        <div className="dseg tools">
          <Tool row icon={touring ? 'stop' : 'play'} label="漫游" on={touring} title={touring ? '停止漫游' : '开始漫游：自动依次游览各地与诗'} onClick={() => (touring ? facade.stopTour() : facade.startTour())} />
          <Tool row icon="footprints" label="足迹" on={picking} title="诗人一生的足迹" onClick={() => store.set((s) => ({ trailState: { ...s.trailState, picking: !s.trailState.picking } }))} />
          <Tool row icon={soundOn ? 'sound' : 'mute'} label={soundOn ? soundName : '静音'} on={soundOn} title={soundOn ? '关掉声音' : '打开声音'} onClick={toggleSound} />
          <Tool row icon="gear" label="设置" on={sheet === 'settings'} pop onClick={() => toggleSheet('settings')} />
        </div>
      </div>
    </div>
  )
}

function SheetBox({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  const [, , close] = useSheet()
  return (
    <div className="chrome panel sheet" data-pop role="dialog" aria-label={title}>
      <div className="sheet-h">
        <b>{title}</b>
        {extra}
        <button className="sheet-x" aria-label="关闭" onClick={close}>
          ×
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </div>
  )
}

function MobileDock() {
  const { facade } = useServices()
  const touring = useApp((s) => s.tourState.active)
  const [sheet, toggleSheet, close] = useSheet()
  const [soundOn, soundName, toggleSound] = useSoundToggle()
  return (
    <>
      <nav className="chrome tabbar fade" aria-label="主要操作">
        <Tool icon="search" label="寻诗" on={sheet === 'search'} pop onClick={() => toggleSheet('search')} />
        <HomeButton className="tool">
          <Icon name="home" size={19} />
          <span>全国</span>
        </HomeButton>
        <Tool icon="sun" label="意境" on={sheet === 'ambience'} pop onClick={() => toggleSheet('ambience')} />
        <Tool
          icon={touring ? 'stop' : 'play'}
          label={touring ? '停游' : '漫游'}
          on={touring}
          onClick={() => {
            close()
            if (touring) facade.stopTour()
            else facade.startTour()
          }}
        />
        <Tool icon="gear" label="设置" on={sheet === 'settings'} pop onClick={() => toggleSheet('settings')} />
      </nav>
      {sheet === 'ambience' && (
        <SheetBox
          title="意境"
          extra={
            <button className={`chip snd ${soundOn ? 'on' : ''}`} aria-pressed={soundOn} onClick={toggleSound}>
              <Icon name={soundOn ? 'sound' : 'mute'} size={16} />
              {soundOn ? soundName : '静音'}
            </button>
          }
        >
          <AmbienceControls />
        </SheetBox>
      )}
    </>
  )
}
