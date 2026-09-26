import type { Season, TimeOfDay, Weather } from '../engine/environment/types'

/** 背景音：关、随境（配合季节时辰天气自动调配），或固定一套 */
export type SoundMode = 'off' | 'auto' | 'pine' | 'rain' | 'stream' | 'cicada' | 'cricket' | 'qin' | 'di' | 'yayue'
export const SOUND_MODES: readonly SoundMode[] = ['off', 'auto', 'pine', 'rain', 'stream', 'cicada', 'cricket', 'qin', 'di', 'yayue']
export const SOUND_NAMES: Record<SoundMode, string> = { off: '静', auto: '随境', pine: '松风', rain: '夜雨', stream: '山溪', cicada: '夏蝉', cricket: '秋虫', qin: '古琴', di: '竹笛', yayue: '琴瑟笛' }
/** 自然声与古乐分两行列出 */
export const NATURE_MODES: readonly SoundMode[] = ['off', 'auto', 'pine', 'rain', 'stream', 'cicada', 'cricket']
export const MUSIC_MODES: readonly SoundMode[] = ['qin', 'di', 'yayue']

type Layer = 'wind' | 'breeze' | 'rain' | 'stream' | 'birds' | 'cicada' | 'cricket' | 'winter' | 'qin' | 'se' | 'di'
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
  pine: { breeze: 0.3, wind: 0.14, birds: 0.05 },
  rain: { rain: 0.46, wind: 0.1 },
  stream: { stream: 0.36, birds: 0.12, breeze: 0.06 },
  cicada: { cicada: 0.24, breeze: 0.08 },
  cricket: { cricket: 0.38, wind: 0.07 },
  // 古乐：琴、笛各自一路，合奏时琴瑟笛相和；底下衬一点风与溪
  qin: { qin: 0.62, wind: 0.05, stream: 0.05 },
  di: { di: 0.5, breeze: 0.06 },
  yayue: { qin: 0.5, se: 0.32, di: 0.36, wind: 0.04 },
}

/** 五声音阶（D 宫：宫商角徵羽），按半音算频率 */
const PENTA = [0, 2, 4, 7, 9]
const noteHz = (degree: number, base = 146.83): number => {
  const oct = Math.floor(degree / 5)
  const st = PENTA[((degree % 5) + 5) % 5] + oct * 12
  return base * Math.pow(2, st / 12)
}

/**
 * 程序合成的白噪音与自然声（Web Audio，不用音频文件）：
 *  - 风（褐噪声低通、慢慢起伏）、松风（粉噪声带通、阵阵）、寒风（低通 + 呼啸的窄带）；
 *  - 雨（高通白噪声 + 随机雨滴）、溪流（两段带通粉噪声、快速起伏的汩汩声）；
 *  - 鸟鸣（正弦上滑的短啼）、夏蝉（锯齿波窄带 + 颤音）、秋虫（高频短脉冲三连）；
 *  - 古乐：五声音阶即兴——古琴（低音区拨弦，泛音衰减、吟猱颤音、偶有上滑）、瑟（高一些的分解和弦）、
 *    竹笛（气声 + 颤音的连绵乐句），过一道程序生成的厅堂混响。
 * 噪声类的声音都压在中低频（两千多赫兹以下），不刺耳。
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
    this.master.gain.setTargetAtTime(this.mode === 'off' ? 0 : 0.55, now, 0.6)
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
    this.noiseBuf = white
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
    /* 松风：阵阵的低中频松涛（低通，不带尖锐的沙沙） */
    {
      const lp = filter('lowpass', 650, 0.5)
      const lp2 = filter('lowpass', 1200, 0.5)
      const sw = ctx.createGain()
      loop(pink, lp, lp2, sw, layer('breeze'))
      wander(lp.frequency, 320, 900, [3, 7])
      wander(sw.gain, 0.35, 1.0, [2, 6])
    }
    /* 寒风：低吼 + 一缕呼啸 */
    {
      const g = layer('winter')
      const lp = filter('lowpass', 300)
      loop(brown, lp, g)
      const bp = filter('bandpass', 480, 10)
      const wg = ctx.createGain()
      wg.gain.value = 0.3
      loop(pink, bp, wg, g)
      wander(bp.frequency, 280, 650, [3, 7])
      wander(wg.gain, 0.08, 0.45, [2, 5])
    }
    /* 雨：高通白噪声的沙沙 + 随机雨滴 */
    {
      const g = layer('rain')
      // 雨声：粉噪声，高通 250、低通 2 千赫上下起伏——像打在瓦上、叶上的细密雨，而不是电视雪花
      const rl = filter('lowpass', 2000, 0.4)
      loop(pink, filter('highpass', 250), rl, g)
      wander(rl.frequency, 1500, 2500, [3, 8])
      const drop = () => {
        if (quiet(g)) {
          this.later(drop, 500)
          return
        }
        const t = ctx.currentTime
        const s = ctx.createBufferSource()
        s.buffer = white
        const bp = filter('bandpass', 700 + Math.random() * 1300, 4)
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(0.18 + Math.random() * 0.25, t + 0.006)
        e.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
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
      // 溪流：低频的哗哗（260–480 赫）+ 一层轻轻的汩汩（700–1100 赫），总体低通
      const soft = filter('lowpass', 1600, 0.4)
      soft.connect(g)
      const a = filter('bandpass', 360, 0.9)
      const b = filter('bandpass', 900, 1.4)
      const ga = ctx.createGain()
      const gb = ctx.createGain()
      gb.gain.value = 0.4
      loop(pink, a, ga, soft)
      loop(pink, b, gb, soft)
      wander(a.frequency, 260, 480, [0.6, 1.6])
      wander(b.frequency, 700, 1100, [0.3, 0.8])
      wander(gb.gain, 0.15, 0.55, [0.25, 0.7])
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
    this.buildMusic(ctx, layer, quiet)
  }

  /**
   * 古乐：五声音阶即兴。琴、瑟、笛各一层，过同一道混响；琴声稀疏从容，瑟作分解和弦，笛吹连绵的乐句。
   */
  private buildMusic(ctx: AudioContext, layer: (k: Layer) => GainNode, quiet: (g: GainNode) => boolean): void {
    /* 混响：程序生成的指数衰减噪声冲激（三秒、左右声道各一） */
    const verb = ctx.createConvolver()
    const len = ctx.sampleRate * 3
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2)
    }
    verb.buffer = ir
    const wet = ctx.createGain()
    wet.gain.value = 0.42
    verb.connect(wet).connect(this.master!)
    const route = (k: Layer) => {
      const g = layer(k)
      const send = ctx.createGain()
      send.gain.value = 1
      g.connect(send).connect(verb)
      return g
    }
    const qin = route('qin')
    const se = route('se')
    const di = route('di')

    /** 拨弦：基音与两个泛音各自指数衰减，起音带一点拨弦噪声；吟猱：延音时的慢颤音；可上滑 */
    const pluck = (out: GainNode, hz: number, t: number, opts: { decay: number; bright: number; vib?: number; slide?: number; vol?: number; pan?: number }) => {
      const pan = ctx.createStereoPanner()
      pan.pan.value = opts.pan ?? 0
      pan.connect(out)
      const vol = opts.vol ?? 0.3
      const partials: [number, number, number][] = [
        [1, 1, opts.decay],
        [2, 0.45 * opts.bright, opts.decay * 0.55],
        [3, 0.22 * opts.bright, opts.decay * 0.32],
        [4.02, 0.1 * opts.bright, opts.decay * 0.2],
      ]
      for (const [mul, amp, dec] of partials) {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.setValueAtTime(hz * mul, t)
        if (opts.slide) o.frequency.exponentialRampToValueAtTime(hz * mul * opts.slide, t + 0.35)
        if (opts.vib) {
          const lfo = ctx.createOscillator()
          lfo.frequency.value = 4.2
          const lg = ctx.createGain()
          lg.gain.setValueAtTime(0, t)
          lg.gain.linearRampToValueAtTime(hz * mul * 0.006 * opts.vib, t + 0.6)
          lfo.connect(lg).connect(o.frequency)
          lfo.start(t)
          lfo.stop(t + dec + 0.2)
        }
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(vol * amp, t + 0.006)
        e.gain.exponentialRampToValueAtTime(0.0001, t + dec)
        o.connect(e).connect(pan)
        o.start(t)
        o.stop(t + dec + 0.05)
      }
      /* 拨弦的一点噪声 */
      const nb = ctx.createBufferSource()
      nb.buffer = this.noiseBuf!
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = hz * 3
      bp.Q.value = 2
      const ne = ctx.createGain()
      ne.gain.setValueAtTime(vol * 0.25 * opts.bright, t)
      ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
      nb.connect(bp).connect(ne).connect(pan)
      nb.start(t, Math.random(), 0.06)
    }

    /* 琴：低音区，一句三到六音，句间长停 */
    let qDeg = 5
    const qinPhrase = () => {
      if (quiet(qin)) {
        this.later(qinPhrase, 1500)
        return
      }
      let t = ctx.currentTime + 0.1
      const n = 3 + Math.floor(Math.random() * 4)
      for (let i = 0; i < n; i++) {
        qDeg = Math.max(0, Math.min(11, qDeg + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)]))
        const hz = noteHz(qDeg, 73.42)
        const last = i === n - 1
        pluck(qin, hz, t, { decay: last ? 4.5 : 2.6, bright: 0.8, vib: last ? 1.5 : Math.random() < 0.3 ? 0.8 : 0, slide: !last && Math.random() < 0.2 ? Math.pow(2, 2 / 12) : undefined, vol: 0.34, pan: -0.15 })
        // 偶尔配一个高八度的泛音
        if (Math.random() < 0.25) pluck(qin, hz * 2, t + 0.02, { decay: 1.6, bright: 0.3, vol: 0.12, pan: -0.1 })
        t += last ? 0 : 0.45 + Math.random() * 0.9
      }
      this.later(qinPhrase, (t - ctx.currentTime) * 1000 + 2500 + Math.random() * 4000)
    }
    this.later(qinPhrase, 400)

    /* 瑟：中音区分解和弦（宫—徵—宫八度—角），四五音一组 */
    const seArp = () => {
      if (quiet(se)) {
        this.later(seArp, 2000)
        return
      }
      const root = [0, 1, 3, 4][Math.floor(Math.random() * 4)]
      const shape = [0, 3, 5, 7, 5]
      let t = ctx.currentTime + 0.05
      for (const off of shape.slice(0, 4 + Math.floor(Math.random() * 2))) {
        pluck(se, noteHz(root + off, 146.83), t, { decay: 1.8, bright: 1.1, vol: 0.2, pan: 0.25 })
        t += 0.18 + Math.random() * 0.08
      }
      this.later(seArp, (t - ctx.currentTime) * 1000 + 3000 + Math.random() * 5000)
    }
    this.later(seArp, 2500)

    /* 笛：高音区连绵乐句；正弦 + 三角波，慢起音、颤音、气声 */
    let dDeg = 7
    const diPhrase = () => {
      if (quiet(di)) {
        this.later(diPhrase, 1500)
        return
      }
      const o = ctx.createOscillator()
      o.type = 'sine'
      const o2 = ctx.createOscillator()
      o2.type = 'triangle'
      const mix2 = ctx.createGain()
      mix2.gain.value = 0.25
      const env = ctx.createGain()
      env.gain.value = 0.0001
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 5.4
      const lg = ctx.createGain()
      lfo.connect(lg)
      lg.connect(o.frequency)
      lg.connect(o2.frequency)
      const pan = ctx.createStereoPanner()
      pan.pan.value = 0.1
      o.connect(env)
      o2.connect(mix2).connect(env)
      env.connect(pan).connect(di)
      /* 气声：带通白噪声跟着音高走 */
      const br = ctx.createBufferSource()
      br.buffer = this.noiseBuf!
      br.loop = true
      const bbp = ctx.createBiquadFilter()
      bbp.type = 'bandpass'
      bbp.Q.value = 3
      const bg = ctx.createGain()
      bg.gain.value = 0.0001
      br.connect(bbp).connect(bg).connect(pan)
      let t = ctx.currentTime + 0.1
      const n = 4 + Math.floor(Math.random() * 5)
      for (let i = 0; i < n; i++) {
        dDeg = Math.max(5, Math.min(14, dDeg + [-2, -1, 1, 1, 2, -1, 0][Math.floor(Math.random() * 7)]))
        const hz = noteHz(dDeg, 146.83)
        const dur = i === n - 1 ? 1.6 + Math.random() : 0.35 + Math.random() * 0.7
        o.frequency.setTargetAtTime(hz, t, 0.03)
        o2.frequency.setTargetAtTime(hz, t, 0.03)
        bbp.frequency.setTargetAtTime(hz * 2, t, 0.03)
        lg.gain.setTargetAtTime(0, t, 0.02)
        lg.gain.setTargetAtTime(hz * 0.008, t + Math.min(0.35, dur * 0.5), 0.15)
        env.gain.setTargetAtTime(0.26, t, i === 0 ? 0.08 : 0.03)
        bg.gain.setTargetAtTime(0.05, t, 0.05)
        t += dur
      }
      env.gain.setTargetAtTime(0.0001, t, 0.25)
      bg.gain.setTargetAtTime(0.0001, t, 0.2)
      const end = t + 1.5
      for (const x of [o, o2, lfo]) {
        x.start()
        x.stop(end)
      }
      br.start()
      br.stop(end)
      this.later(diPhrase, (end - ctx.currentTime) * 1000 + 1800 + Math.random() * 4000)
    }
    this.later(diPhrase, 1200)
  }

  private noiseBuf: AudioBuffer | null = null

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
