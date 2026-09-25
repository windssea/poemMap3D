import type * as THREE from 'three'
import type { AppStore } from '../../app/AppStore'
import type { Season, TimeOfDay, Weather } from '../../engine/environment/types'
import { hashString, Random } from '../../utils/math'
import type { PoetryRepository } from '../poetry/PoetryRepository'
import { fameOf, type Poem } from '../poetry/types'
import type { PoetTrail, TrailRepository } from './TrailService'

/** 足迹编排只依赖这个端口（由 EngineFacade 实现），不接触 Three.js 场景 */
export interface TrailPort {
  buildTrail(stops: { lng: number; lat: number }[], color: string): { stopFrac: number[]; stops: THREE.Vector3[] }
  setTrailProgress(frac: number): void
  trailHead(frac: number): THREE.Vector3
  clearTrail(): void
  flyToPose(p: { target: THREE.Vector3; yaw: number; pitch: number; distance: number }, duration?: number): Promise<void>
  follow(p: { target: THREE.Vector3; yaw: number; pitch: number; distance: number }): void
  fitPoints(points: THREE.Vector3[], leftPad: number): void
  setUserCamera(on: boolean): void
  getAmbience(): { season: Season; time: TimeOfDay; weather: Weather }
  setAmbience(a: { season: Season; time: TimeOfDay; weather: Weather }): void
  onTick(fn: (dt: number) => void): () => void
}

export type TrailPhase = 'intro' | 'stay' | 'move' | 'paused' | 'done'

/** 足迹播放时的运行数据（界面每帧读取，用于地点标记、笔头与说明卡） */
export interface TrailRuntime {
  trail: PoetTrail
  stops: THREE.Vector3[]
  stopFrac: number[]
  verses: (Poem | null)[]
  phase: TrailPhase
  prog: number
  frac: number
  clock: number
  segDur: number
  pauseI: number
}

const BREATH = 0.9
const READ = 5.4
const BARE = 2.2
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter']
const YAW = 0.35
const PITCH = 0.57
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/**
 * 诗人足迹：开场飞到第一站 → [停留（题诗）→ 沿光带行进] × N → 收束全景。
 * 镜头中近景跟随笔头，远途略拉高；每站按一生分作春夏秋冬换意境；结束后恢复原意境。
 */
export class TrailDirector {
  runtime: TrailRuntime | null = null
  private off: (() => void) | null = null
  private saved: { season: Season; time: TimeOfDay; weather: Weather } | null = null
  private amb: { season: Season; time: TimeOfDay; weather: Weather }[] = []
  private fdist = 300
  private smooth: THREE.Vector3 | null = null
  private versed = false

  constructor(
    private readonly trails: TrailRepository,
    private readonly poetry: PoetryRepository,
    private readonly store: AppStore,
    private readonly port: TrailPort,
  ) {}

  /** 各站配诗：说明里点名的那首优先；其余取此人在该站附近（地名入题者优先）名气最高、尚未用过的一首 */
  private versesFor(t: PoetTrail): (Poem | null)[] {
    const names = [...new Set(t.stops.map((s) => s.place))]
    const pos = new Map(t.stops.map((s) => [s.place, s]))
    const pool = new Map<string, Poem[]>(names.map((n) => [n, []]))
    for (const q of this.poetry.poemsBy(t.poet)) {
      let best: string | null = null
      let bd = 1e9
      for (const n of names) {
        const s = pos.get(n)!
        const d = Math.hypot(q.lng - s.lng, q.lat - s.lat) - ((q.placeName + q.title).includes(n) ? 0.8 : 0)
        if (d < bd) {
          bd = d
          best = n
        }
      }
      if (best && bd < 0.6) pool.get(best)!.push(q)
    }
    for (const list of pool.values()) list.sort((a, b) => fameOf(b) - fameOf(a))
    /* 说明里点了名的诗（「作《峨眉山月歌》」）优先：按题目匹配，同站展示的就是说明里那一首 */
    const all = this.poetry.poemsBy(t.poet)
    const norm = (x: string) => x.replace(/[s·・，。、《》〈〉「」“”"'()（）]/g, '')
    const used = new Set<string>()
    const named = t.stops.map((s) => {
      for (const m of s.note.matchAll(/《([^》]+)》/g)) {
        const want = norm(m[1])
        const hit = all.find((q) => !used.has(q.id) && (norm(q.title) === want || norm(q.title).includes(want) || want.includes(norm(q.title))))
        if (hit) {
          used.add(hit.id)
          return hit
        }
      }
      return null
    })
    const seen = new Map<string, number>()
    return t.stops.map((s, i) => {
      if (named[i]) return named[i]
      const list = pool.get(s.place)!
      let k = seen.get(s.place) ?? 0
      while (k < list.length && used.has(list[k].id)) k++
      seen.set(s.place, k + 1)
      const q = list[k] ?? null
      if (q) used.add(q.id)
      return q
    })
  }

  start(poet: string): void {
    const t = this.trails.get(poet)
    if (!t) return
    this.stop(true)
    const built = this.port.buildTrail(t.stops, t.color)
    const r = new Random(hashString(poet) + t.stops.length)
    this.amb = t.stops.map((_, i) => ({
      season: SEASONS[Math.min(3, Math.floor((i * 4) / t.stops.length))],
      time: r.chance(0.7) ? 'day' : r.chance(0.5) ? 'dawn' : 'dusk',
      weather: r.chance(0.18) ? 'rain' : 'clear',
    }))
    this.saved = this.port.getAmbience()
    this.runtime = { trail: t, stops: built.stops, stopFrac: built.stopFrac, verses: this.versesFor(t), phase: 'intro', prog: 0, frac: 0, clock: 0, segDur: 4, pauseI: -1 }
    this.fdist = 300
    this.smooth = null
    this.publish()
    this.store.set((s) => ({ trailState: { ...s.trailState, phase: 'intro' } }))
    this.port.setUserCamera(false)
    const p0 = built.stops[0]
    void this.port.flyToPose({ target: p0.clone(), yaw: YAW, pitch: PITCH, distance: this.fdist }, 2.6).then(() => {
      const rt = this.runtime
      if (rt && rt.phase === 'intro') {
        rt.phase = 'stay'
        rt.clock = 0
        this.versed = false
        this.port.setAmbience(this.amb[0])
      }
    })
    this.off = this.port.onTick((dt) => this.tick(dt))
    document.body.classList.add('trail-on')
  }

  stop(silent = false): void {
    this.off?.()
    this.off = null
    if (!this.runtime) return
    this.port.clearTrail()
    this.port.setUserCamera(true)
    if (!silent && this.saved) this.port.setAmbience(this.saved)
    this.runtime = null
    document.body.classList.remove('trail-on')
    this.store.set({ trailState: { poet: null, picking: false, phase: 'done', prog: 0, verseIdx: -1 } })
  }

  replay(): void {
    const poet = this.runtime?.trail.poet
    if (poet) this.start(poet)
  }

  /** 跳到某站：停下自动播放，飞过去并题诗 */
  goto(i: number): void {
    const rt = this.runtime
    if (!rt) return
    rt.phase = 'paused'
    rt.pauseI = i
    rt.prog = Math.max(rt.prog, i)
    rt.frac = Math.max(rt.frac, rt.stopFrac[i])
    this.port.setTrailProgress(rt.frac + 0.0005)
    this.port.setUserCamera(true)
    this.port.setAmbience(this.amb[i])
    void this.port.flyToPose({ target: rt.stops[i].clone(), yaw: YAW, pitch: PITCH, distance: 240 }, 1.8)
    this.publish(i)
  }

  /** 全程：整体取景，装下全部行迹 */
  overview(): void {
    const rt = this.runtime
    if (!rt) return
    this.finish()
  }

  private finish(): void {
    const rt = this.runtime!
    rt.phase = 'done'
    rt.prog = rt.stops.length - 1
    rt.frac = 1
    this.port.setTrailProgress(1.001)
    this.port.setUserCamera(true)
    if (this.saved) {
      const s = this.saved
      this.port.setAmbience({ season: s.season === 'winter' ? 'spring' : s.season, time: s.time === 'night' ? 'day' : s.time, weather: 'clear' })
    }
    this.port.fitPoints(rt.stops, innerWidth > 760 ? 390 : 0)
    this.publish()
  }

  private publish(verseIdx = -1): void {
    const rt = this.runtime
    if (!rt) return
    this.store.set({ trailState: { poet: rt.trail.poet, picking: false, phase: rt.phase, prog: rt.prog, verseIdx } })
  }

  private tick(dt: number): void {
    const rt = this.runtime
    if (!rt) return
    const N = rt.stops.length - 1
    if (rt.phase === 'stay') {
      rt.clock += dt
      const hasV = !!rt.verses[rt.prog]
      if (hasV && !this.versed && rt.clock > BREATH) {
        this.versed = true
        this.publish(rt.prog)
      }
      if (rt.clock > (hasV ? BREATH + READ : BARE)) {
        if (rt.prog >= N) this.finish()
        else {
          rt.phase = 'move'
          rt.clock = 0
          const A = rt.stops[rt.prog]
          const B = rt.stops[rt.prog + 1]
          rt.segDur = clamp(2.8 + Math.hypot(B.x - A.x, B.z - A.z) * 0.004, 3.2, 7.5)
          this.port.setAmbience(this.amb[rt.prog + 1])
          this.publish()
        }
      }
    } else if (rt.phase === 'move') {
      rt.clock += dt
      const u = Math.min(1, rt.clock / rt.segDur)
      rt.frac = rt.stopFrac[rt.prog] + (rt.stopFrac[rt.prog + 1] - rt.stopFrac[rt.prog]) * ease(u)
      if (u >= 1) {
        rt.prog++
        rt.phase = 'stay'
        rt.clock = 0
        this.versed = false
        this.publish()
      }
    }
    if (rt.phase !== 'done' && rt.phase !== 'paused') this.port.setTrailProgress(rt.frac + 0.0005)

    /* 跟随：中近景；行进远途时拉高；目标跟着笔头 */
    if (rt.phase === 'stay' || rt.phase === 'move') {
      let want = 260
      if (rt.phase === 'move') {
        const A = rt.stops[rt.prog]
        const B = rt.stops[rt.prog + 1]
        const d = Math.hypot(B.x - A.x, B.z - A.z)
        want = clamp(280 + d * 0.3, 300, 900) * (0.75 + 0.25 * Math.sin(Math.PI * Math.min(1, rt.clock / rt.segDur)))
      }
      this.fdist += (want - this.fdist) * (1 - Math.exp(-dt * 1.2))
      const head = this.port.trailHead(rt.frac)
      const tgt = rt.phase === 'stay' ? rt.stops[rt.prog].clone() : head.setY(head.y + (rt.stops[rt.prog].y - head.y) * 0.6)
      if (!this.smooth) this.smooth = tgt.clone()
      this.smooth.lerp(tgt, 1 - Math.exp(-dt * 3))
      this.port.follow({ target: this.smooth.clone(), yaw: YAW, pitch: PITCH, distance: this.fdist })
    }
  }
}
