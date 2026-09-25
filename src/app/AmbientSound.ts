import type { Season, TimeOfDay, Weather } from '../engine/environment/types'

/** 背景音：关、随境（配合季节时辰天气自动调配），或固定一套 */
export type SoundMode = 'off' | 'auto' | 'pine' | 'rain' | 'stream' | 'cicada' | 'cricket'
export const SOUND_MODES: readonly SoundMode[] = ['off', 'auto', 'pine', 'rain', 'stream', 'cicada', 'cricket']
export const SOUND_NAMES: Record<SoundMode, string> = { off: '静', auto: '随境', pine: '松风', rain: '夜雨', stream: '山溪', cicada: '夏蝉', cricket: '秋虫' }

type Layer = 'wind' | 'breeze' | 'rain' | 'stream' | 'birds' | 'cicada' | 'cricket' | 'winter'
type Mix = Partial<Record<Layer, number>>

/**
 * 随境：季节 × 时辰 × 天气 → 各层音量。
 * 春昼鸟鸣溪流、夏昼蝉噪、夏秋夜虫、秋风、冬日寒风；雨雪压过其余。
 */
function autoMix(season: Season, time: TimeOfDay, weather: Weather): Mix {
  if (weather === 'rain') return { rain: 0.55, wind: 0.14, stream: 0.08 }
  if (weather === 'snow') return { winter: 0.34, wind: 0.12 }
  const day = time === 'day' || time === 'dawn'
  const night = time === 'night'
  switch (season) {
    case 'spring':
      return night ? { cricket: 0.1, stream: 0.14, wind: 0.08 } : time === 'dusk' ? { breeze: 0.2, birds: 0.18, stream: 0.14 } : { breeze: 0.2, birds: time === 'dawn' ? 0.55 : 0.4, stream: 0.16 }
    case 'summer':
      return night ? { cricket: 0.34, wind: 0.07 } : time === 'dusk' ? { cicada: 0.12, cricket: 0.16, breeze: 0.12 } : { cicada: time === 'dawn' ? 0.08 : 0.24, breeze: 0.14, birds: time === 'dawn' ? 0.42 : 0.16 }
    case 'autumn':
      return night || time === 'dusk' ? { cricket: 0.38, wind: 0.14 } : { wind: 0.22, breeze: 0.12, birds: day ? 0.1 : 0 }
    case 'winter':
      return { winter: 0.24, wind: 0.14, birds: time === 'day' ? 0.04 : 0 }
  }
}

const FIXED: Record<Exclude<SoundMode, 'off' | 'auto'>, Mix> = {
  pine: { breeze: 0.34, wind: 0.12, birds: 0.06 },
  rain: { rain: 0.6, wind: 0.12 },
  stream: { stream: 0.42, birds: 0.14, breeze: 0.08 },
  cicada: { cicada: 0.3, breeze: 0.1 },
  cricket: { cricket: 0.44, wind: 0.08 },
}

/**
 * 程序合成的白噪音与自然声（Web Audio，不用音频文件）：
 *  - 风（褐噪声低通、慢慢起伏）、松风（粉噪声带通、阵阵）、寒风（低通 + 呼啸的窄带）；
 *  - 雨（高通白噪声 + 随机雨滴）、溪流（两段带通粉噪声、快速起伏的汩汩声）；
 *  - 鸟鸣（正弦上滑的短啼）、夏蝉（锯齿波窄带 + 颤音）、秋虫（高频短脉冲三连）。
 * 各层音量按模式平滑过渡；页面隐藏时暂停。
 */
export class AmbientSound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private readonly layers = new Map<Layer, GainNode>()
  private disposed = false
  private mode: SoundMode = 'off'
  private env = { season: 'spring' as Season, time: 'day' as TimeOfDay, weather: 'clear' as Weather }
  private readonly onVis = () => {
    if (!this.ctx) return
    if (document.hidden) void this.ctx.suspend()
    else if (this.mode !== 'off') void this.ctx.resume()
  }

  /** 切换模式（须在用户点击中调用第一次，浏览器才允许出声） */
  setMode(m: SoundMode): void {
    this.mode = m
    if (m !== 'off') this.ensure()
    if (this.ctx && m !== 'off') void this.ctx.resume()
    this.apply()
  }

  setEnvironment(season: Season, time: TimeOfDay, weather: Weather): void {
    this.env = { season, time, weather }
    if (this.mode === 'auto') this.apply()
  }

  private apply(): void {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    const mix: Mix = this.mode === 'off' ? {} : this.mode === 'auto' ? autoMix(this.env.season, this.env.time, this.env.weather) : FIXED[this.mode]
    this.master.gain.setTargetAtTime(this.mode === 'off' ? 0 : 0.7, now, 0.6)
    for (const [k, g] of this.layers) g.gain.setTargetAtTime(mix[k] ?? 0, now, 1.2)
    if (this.mode === 'off') window.setTimeout(() => this.mode === 'off' && void this.ctx?.suspend(), 2500)
  }

  private ensure(): void {
    if (this.ctx) return
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)
    document.addEventListener('visibilitychange', this.onVis)
    const white = this.noise('white')
    const pink = this.noise('pink')
    const brown = this.noise('brown')
    const layer = (k: Layer) => {
      const g = ctx.createGain()
      g.gain.value = 0
      g.connect(this.master!)
      this.layers.set(k, g)
      return g
    }
    const loop = (buf: AudioBuffer, ...chain: AudioNode[]) => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      s.loopStart = Math.random() * 2
      let n: AudioNode = s
      for (const c of chain) {
        n.connect(c)
        n = c
      }
      s.start(0, Math.random() * buf.duration)
      return s
    }
    const filter = (type: BiquadFilterType, f: number, q = 0.7) => {
      const b = ctx.createBiquadFilter()
      b.type = type
      b.frequency.value = f
      b.Q.value = q
      return b
    }
    /** 这一层现在听不见（静音或页面挂起）：定时的鸟鸣、雨滴、虫声就只排下一次，不建节点 */
    const quiet = (g: GainNode) => ctx.state !== 'running' || g.gain.value < 0.004
    /** 慢速随机起伏：每隔一会儿把参数滑到新的随机值 */
    const wander = (param: AudioParam, lo: number, hi: number, every: [number, number]) => {
      const step = () => {
        param.setTargetAtTime(lo + Math.random() * (hi - lo), ctx.currentTime, (every[0] + every[1]) / 4)
        this.later(step, (every[0] + Math.random() * (every[1] - every[0])) * 1000)
      }
      step()
    }

    /* 风 */
    {
      const lp = filter('lowpass', 420)
      const sw = ctx.createGain()
      loop(brown, lp, sw, layer('wind'))
      wander(lp.frequency, 220, 720, [3, 8])
      wander(sw.gain, 0.5, 1.2, [2, 6])
    }
    /* 松风：阵阵的中频沙沙 */
    {
      const bp = filter('bandpass', 900, 0.6)
      const sw = ctx.createGain()
      loop(pink, bp, sw, layer('breeze'))
      wander(bp.frequency, 600, 1500, [2.5, 6])
      wander(sw.gain, 0.3, 1.3, [1.5, 5])
    }
    /* 寒风：低吼 + 一缕呼啸 */
    {
      const g = layer('winter')
      const lp = filter('lowpass', 300)
      loop(brown, lp, g)
      const bp = filter('bandpass', 700, 14)
      const wg = ctx.createGain()
      wg.gain.value = 0.5
      loop(white, bp, wg, g)
      wander(bp.frequency, 420, 1100, [3, 7])
      wander(wg.gain, 0.1, 0.8, [2, 5])
    }
    /* 雨：高通白噪声的沙沙 + 随机雨滴 */
    {
      const g = layer('rain')
      loop(white, filter('highpass', 800), filter('lowpass', 6500), g)
      const drop = () => {
        if (quiet(g)) {
          this.later(drop, 500)
          return
        }
        const t = ctx.currentTime
        const s = ctx.createBufferSource()
        s.buffer = white
        const bp = filter('bandpass', 1800 + Math.random() * 3200, 8)
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(0.5 + Math.random() * 0.6, t + 0.004)
        e.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 2 - 1
        s.connect(bp).connect(e).connect(pan).connect(g)
        s.start(t, Math.random() * 1.5, 0.08)
        this.later(drop, 40 + Math.random() * 160)
      }
      drop()
    }
    /* 溪流：两段带通，快速起伏 */
    {
      const g = layer('stream')
      const a = filter('bandpass', 520, 1.1)
      const b = filter('bandpass', 1900, 2.5)
      const ga = ctx.createGain()
      const gb = ctx.createGain()
      loop(pink, a, ga, g)
      loop(pink, b, gb, g)
      wander(a.frequency, 380, 700, [0.4, 1.2])
      wander(b.frequency, 1400, 2600, [0.2, 0.6])
      wander(gb.gain, 0.2, 0.9, [0.15, 0.5])
    }
    /* 鸟鸣：一串两三声的短啼，间隔随机 */
    {
      const g = layer('birds')
      const song = () => {
        if (quiet(g)) {
          this.later(song, 1500)
          return
        }
        const t0 = ctx.currentTime + 0.05
        const base = 2200 + Math.random() * 2200
        const n = 2 + Math.floor(Math.random() * 4)
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.6 - 0.8
        pan.connect(g)
        for (let i = 0; i < n; i++) {
          const t = t0 + i * (0.11 + Math.random() * 0.06)
          const o = ctx.createOscillator()
          o.type = 'sine'
          o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), t)
          o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.07)
          const e = ctx.createGain()
          e.gain.setValueAtTime(0.0001, t)
          e.gain.exponentialRampToValueAtTime(0.35, t + 0.01)
          e.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
          o.connect(e).connect(pan)
          o.start(t)
          o.stop(t + 0.1)
        }
        this.later(song, 1200 + Math.random() * 4800)
      }
      song()
    }
    /* 夏蝉：锯齿波窄带 + 快颤音，整体慢慢涨落 */
    {
      const g = layer('cicada')
      for (const f of [4300, 5100]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = f
        const bp = filter('bandpass', f + 200, 9)
        const trem = ctx.createGain()
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 38 + Math.random() * 14
        const lg = ctx.createGain()
        lg.gain.value = 0.5
        lfo.connect(lg).connect(trem.gain)
        trem.gain.value = 0.5
        const sw = ctx.createGain()
        o.connect(bp).connect(trem).connect(sw).connect(g)
        o.start()
        lfo.start()
        wander(sw.gain, 0.05, 0.6, [3, 9])
      }
    }
    /* 秋虫：几只蟋蟀，各自的高频三连短脉冲 */
    {
      const g = layer('cricket')
      for (let k = 0; k < 4; k++) {
        const f = 4200 + Math.random() * 1400
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.8 - 0.9
        pan.connect(g)
        const every = 0.55 + Math.random() * 0.5
        const chirp = () => {
          if (quiet(g)) {
            this.later(chirp, 1000)
            return
          }
          const t0 = ctx.currentTime + 0.02
          for (let i = 0; i < 3; i++) {
            const t = t0 + i * 0.045
            const o = ctx.createOscillator()
            o.frequency.value = f
            const e = ctx.createGain()
            e.gain.setValueAtTime(0.0001, t)
            e.gain.exponentialRampToValueAtTime(0.22, t + 0.006)
            e.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
            o.connect(e).connect(pan)
            o.start(t)
            o.stop(t + 0.035)
          }
          this.later(chirp, every * 1000 * (0.85 + Math.random() * 0.3))
        }
        this.later(chirp, Math.random() * 800)
      }
    }
  }

  /** 定时排下一次（销毁后不再排） */
  private later(fn: () => void, ms: number): void {
    if (!this.disposed) window.setTimeout(fn, ms)
  }

  /** 两秒长的噪声缓冲（白 / 粉 / 褐） */
  private noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const ctx = this.ctx!
    const n = ctx.sampleRate * 2
    const buf = ctx.createBuffer(2, n, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let b0 = 0
      let b1 = 0
      let b2 = 0
      let last = 0
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1
        if (kind === 'white') d[i] = w * 0.5
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046
          b1 = 0.963 * b1 + w * 0.2965164
          b2 = 0.57 * b2 + w * 1.0526913
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11
        } else {
          last = (last + 0.02 * w) / 1.02
          d[i] = last * 3.5
        }
      }
    }
    return buf
  }

  dispose(): void {
    this.disposed = true
    document.removeEventListener('visibilitychange', this.onVis)
    void this.ctx?.close()
    this.ctx = null
  }
}
