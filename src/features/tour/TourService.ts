import type { AppStore, TourSettings } from '../../app/AppStore'
import type { Season, TimeOfDay, Weather } from '../../engine/environment/types'
import type { PoetryRepository } from '../poetry/PoetryRepository'
import { planTour, type TourPlanData, type TourStop } from './TourPlanner'

/** 巡游只依赖这个端口（由 EngineFacade 实现），不接触 Three.js 对象 */
export interface TourPort {
  flyToPlace(placeId: string, opts: { speed: number; shot: number }): Promise<void>
  flyHome(speed: number): Promise<void>
  setAmbience(a: { season: Season; time: TimeOfDay; weather: Weather }): void
  startOrbit(): void
  stopOrbit(): void
}

const DWELL = { short: 8, mid: 12, long: 17 }
const SHOT = { near: 0.78, mid: 1, far: 1.5 }

/**
 * 巡游：按编排逐站飞行、停留、环绕、题诗；可暂停、可随时由用户操作打断。
 */
export class TourService {
  private token = 0
  private stops: TourStop[] = []

  constructor(
    private readonly plan: TourPlanData,
    private readonly poetry: PoetryRepository,
    private readonly store: AppStore,
    private readonly port: TourPort,
  ) {}

  get active(): boolean {
    return this.store.get().tourState.active
  }

  start(): void {
    const token = ++this.token
    const ts = this.store.get().tourState
    this.store.set({ tourState: { ...ts, active: true, paused: false, round: 0, index: 0 }, panelState: 'none', selectedPlaceId: null })
    void this.run(token)
  }

  stop(): void {
    this.token++
    this.port.stopOrbit()
    const ts = this.store.get().tourState
    this.store.set({ tourState: { ...ts, active: false, paused: false, poemId: null, stopName: '', region: '' } })
  }

  togglePause(): void {
    const ts = this.store.get().tourState
    this.store.set({ tourState: { ...ts, paused: !ts.paused } })
  }

  updateSettings(patch: Partial<TourSettings>): void {
    const ts = this.store.get().tourState
    this.store.set({ tourState: { ...ts, settings: { ...ts.settings, ...patch } } })
  }

  private async wait(sec: number, token: number): Promise<boolean> {
    let left = sec
    while (left > 0) {
      await new Promise((r) => setTimeout(r, 200))
      if (token !== this.token) return false
      if (!this.store.get().tourState.paused) left -= 0.2
    }
    return true
  }

  private async run(token: number): Promise<void> {
    let round = 0
    for (;;) {
      const settings = this.store.get().tourState.settings
      this.stops = planTour(this.plan, this.poetry, round, settings)
      await this.port.flyHome(settings.speed)
      if (token !== this.token) return
      for (let i = 0; i < this.stops.length; i++) {
        const st = this.stops[i]
        const s = this.store.get().tourState.settings
        const ts = this.store.get().tourState
        this.store.set({ tourState: { ...ts, region: st.region, stopName: st.note, poemId: null, index: i, total: this.stops.length, round } })
        if (s.ambience === 'change') this.port.setAmbience({ season: st.season, time: st.time, weather: st.weather })
        this.port.stopOrbit()
        await this.port.flyToPlace(st.placeId, { speed: s.speed, shot: SHOT[s.shot] })
        if (token !== this.token) return
        this.port.startOrbit()
        const ts2 = this.store.get().tourState
        this.store.set({ tourState: { ...ts2, poemId: st.poemId }, selectedPlaceId: st.placeId })
        if (!(await this.wait(DWELL[s.dwell], token))) return
      }
      round++
      if (this.store.get().tourState.settings.count !== 'endless' && round >= 1) break
    }
    if (token === this.token) this.stop()
  }
}
