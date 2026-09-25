import { useSyncExternalStore } from 'react'
import type { CameraLevel } from '../engine/camera/CameraPose'
import type { Season, TimeOfDay, Weather } from '../engine/environment/types'
import type { Quality } from '../engine/rendering/QualityManager'
import type { TrailPhase } from '../features/poetTrail/TrailDirector'

export type PanelState = 'none' | 'place' | 'poem'

export interface TourSettings {
  speed: 1 | 1.5 | 2
  count: 'normal' | 'more' | 'endless'
  dwell: 'short' | 'mid' | 'long'
  shot: 'near' | 'mid' | 'far'
  rain: 'less' | 'often' | 'none'
  ambience: 'change' | 'keep'
  caption: boolean
}

export interface TourState {
  active: boolean
  paused: boolean
  region: string
  stopName: string
  poemId: string | null
  round: number
  index: number
  total: number
  settings: TourSettings
}

/**
 * 应用状态：只存 UI 与业务状态，不存 Mesh、Scene、Camera、Chunk、Material、Geometry。
 */
export interface AppState {
  loading: { ready: boolean; label: string; progress: number; error: string | null }
  selectedPlaceId: string | null
  selectedPoemId: string | null
  search: string
  panelState: PanelState
  cameraLevel: CameraLevel
  season: Season
  weather: Weather
  time: TimeOfDay
  quality: Quality
  tourState: TourState
  trailState: { poet: string | null; picking: boolean; phase: TrailPhase; prog: number; verseIdx: number }
  ui: { ambienceOpen: boolean; hidden: boolean; tourSettingsOpen: boolean }
  debug: { chunks: boolean; terrain: boolean }
}

const read = <T,>(k: string, ok: (v: string) => boolean, d: T): T => {
  try {
    const v = localStorage.getItem(k)
    return v !== null && ok(v) ? (v as unknown as T) : d
  } catch {
    return d
  }
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()

export const DEFAULT_TOUR_SETTINGS: TourSettings = { speed: 1, count: 'normal', dwell: 'mid', shot: 'mid', rain: 'less', ambience: 'change', caption: true }

function initial(): AppState {
  return {
    loading: { ready: false, label: '研墨', progress: 0, error: null },
    selectedPlaceId: null,
    selectedPoemId: null,
    search: '',
    panelState: 'none',
    cameraLevel: 'national',
    season: read<Season>('shs', (v) => ['spring', 'summer', 'autumn', 'winter'].includes(v), 'spring'),
    weather: read<Weather>('shw', (v) => ['clear', 'rain', 'snow'].includes(v), 'clear'),
    time: read<TimeOfDay>('shm', (v) => ['dawn', 'day', 'dusk', 'night'].includes(v), 'day'),
    quality: (params.get('q') as Quality) || read<Quality>('shq', (v) => ['low', 'mid', 'high'].includes(v), undefined as unknown as Quality),
    tourState: { active: false, paused: false, region: '', stopName: '', poemId: null, round: 0, index: 0, total: 0, settings: DEFAULT_TOUR_SETTINGS },
    trailState: { poet: null, picking: false, phase: 'done', prog: 0, verseIdx: -1 },
    ui: { ambienceOpen: false, hidden: false, tourSettingsOpen: false },
    debug: { chunks: params.has('debug'), terrain: params.has('debug') },
  }
}

type Listener = () => void

/** 极简外部 store：React 用 useSyncExternalStore 订阅 */
export class AppStore {
  private state: AppState = initial()
  private readonly listeners = new Set<Listener>()

  get = (): AppState => this.state

  set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void => {
    const p = typeof patch === 'function' ? patch(this.state) : patch
    this.state = { ...this.state, ...p }
    this.persist(p)
    for (const l of this.listeners) l()
  }

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }

  private persist(p: Partial<AppState>): void {
    try {
      if (p.season) localStorage.setItem('shs', p.season)
      if (p.weather) localStorage.setItem('shw', p.weather)
      if (p.time) localStorage.setItem('shm', p.time)
      if (p.quality) localStorage.setItem('shq', p.quality)
    } catch {
      /* 隐私模式下不记忆 */
    }
  }
}

export const appStore = new AppStore()

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(appStore.get()))
}
