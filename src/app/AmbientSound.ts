import type { Season, TimeOfDay, Weather } from '../engine/environment/types'

/** 背景音：关、随境（配合季节时辰天气自动调配），或固定一套 */
export type SoundMode = 'off' | 'auto' | 'pine' | 'rain' | 'stream' | 'cicada' | 'cricket' | 'qin' | 'pipa' | 'di' | 'yayue'
export const SOUND_MODES: readonly SoundMode[] = ['off', 'auto', 'pine', 'rain', 'stream', 'cicada', 'cricket', 'qin', 'pipa', 'di', 'yayue']
export const SOUND_NAMES: Record<SoundMode, string> = { off: '静', auto: '随境', pine: '松风', rain: '夜雨', stream: '山溪', cicada: '夏蝉', cricket: '秋虫', qin: '古琴', pipa: '琵琶', di: '竹笛', yayue: '合奏' }
/** 自然声与古乐分两行列出 */
export const NATURE_MODES: readonly SoundMode[] = ['off', 'auto', 'pine', 'rain', 'stream', 'cicada', 'cricket']
export const MUSIC_MODES: readonly SoundMode[] = ['qin', 'pipa', 'di', 'yayue']

type Layer = 'wind' | 'breeze' | 'rain' | 'stream' | 'birds' | 'cicada' | 'cricket' | 'winter' | 'qin' | 'pipa' | 'di' | 'pad'
type Mix = Partial<Record<Layer, number>>

/**
 * 随境：季节 × 时辰 × 天气 → 各层音量。
 * 春昼鸟鸣溪流、夏昼蝉噪、夏秋夜虫、秋风、冬日寒风；雨雪压过其余。
 */
function autoMix(season: Season, time: TimeOfDay, weather: Weather): Mix {
  if (weather === 'rain') return { rain: 0.55, wind: 0.14, stream: 0.08 }
  if (weather === 'snow') return { winter: 0.34, wind: 0.12 }
  if (weather === 'mist') return { wind: 0.2, stream: 0.06 }
  const day = time === 'day' || time === 'dawn'
  const night = time === 'night'
  switch (season) {
    case 'spring':
      return night ? { cricket: 0.1, stream: 0.14, wind: 0.08 } : time === 'dusk' ? { breeze: 0.2, birds: 0.18, stream: 0.14 } : { breeze: 0.2, birds: time === 'dawn' ? 0.55 : 0.4, stream: 0.16 }
    case 'summer':
      return night ? { cricket: 0.22, wind: 0.07, breeze: 0.06 } : time === 'dusk' ? { cicada: 0.08, cricket: 0.12, breeze: 0.12 } : { cicada: time === 'dawn' ? 0.05 : 0.14, breeze: 0.16, birds: time === 'dawn' ? 0.36 : 0.14 }
    case 'autumn':
      return night || time === 'dusk' ? { cricket: 0.24, wind: 0.14 } : { wind: 0.22, breeze: 0.12, birds: day ? 0.1 : 0 }
    case 'winter':
      return { winter: 0.24, wind: 0.14, birds: time === 'day' ? 0.04 : 0 }
  }
}

const FIXED: Record<Exclude<SoundMode, 'off' | 'auto'>, Mix> = {
  pine: { breeze: 0.3, wind: 0.14, birds: 0.05 },
  rain: { rain: 0.46, wind: 0.1 },
  stream: { stream: 0.36, birds: 0.1, breeze: 0.06 },
  cicada: { cicada: 0.16, breeze: 0.1 },
  cricket: { cricket: 0.26, wind: 0.07 },
  // 古乐：底下一层极轻的持续音垫（宫、徵的低音），琴、琵琶、笛在上面舒缓地走；合奏时琴与琵琶伴、笛领
  qin: { qin: 0.62, pad: 0.42, stream: 0.03 },
  pipa: { pipa: 0.5, pad: 0.4 },
  di: { di: 0.44, pad: 0.42, breeze: 0.04 },
  yayue: { qin: 0.42, pipa: 0.26, di: 0.3, pad: 0.38 },
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
 *  - 古乐：五声音阶即兴，底下一层持续的低音音垫——古琴（低音区长余音，走手滑音、吟猱）、
 *    琵琶（中音区拨弦，长音用轮指连成一线）、竹笛（连奏滑音、倚音、迟起的颤音），过一道偏暖的长混响。
 * 噪声类的声音都压在中低频，起伏慢、间隔随机；总线再过一道柔和的低通，不刺耳、不聒噪。
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
    // 总线柔化：削掉五六千赫以上的毛刺
    const soften = ctx.createBiquadFilter()
    soften.type = 'lowpass'
    soften.frequency.value = 5200
    soften.Q.value = 0.5
    this.master.connect(soften).connect(ctx.destination)
    document.addEventListener('visibilitychange', this.onVis)
    const white = this.noise('white')
    this.noiseBuf = white
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
      loop(this.loopNoise('brown'), lp, sw, layer('wind'))
      wander(lp.frequency, 220, 720, [3, 8])
      wander(sw.gain, 0.5, 1.2, [2, 6])
    }
    /* 松风：阵阵的低中频松涛（低通，不带尖锐的沙沙） */
    {
      const lp = filter('lowpass', 650, 0.5)
      const lp2 = filter('lowpass', 1200, 0.5)
      const sw = ctx.createGain()
      loop(this.loopNoise('pink'), lp, lp2, sw, layer('breeze'))
      wander(lp.frequency, 320, 900, [3, 7])
      wander(sw.gain, 0.35, 1.0, [2, 6])
    }
    /* 寒风：低吼 + 一缕呼啸 */
    {
      const g = layer('winter')
      const lp = filter('lowpass', 300)
      loop(this.loopNoise('brown'), lp, g)
      const bp = filter('bandpass', 480, 10)
      const wg = ctx.createGain()
      wg.gain.value = 0.3
      loop(this.loopNoise('pink'), bp, wg, g)
      wander(bp.frequency, 280, 650, [3, 7])
      wander(wg.gain, 0.08, 0.45, [2, 5])
    }
    /* 雨：高通白噪声的沙沙 + 随机雨滴 */
    {
      const g = layer('rain')
      // 雨声：粉噪声，高通 250、低通 2 千赫上下起伏——像打在瓦上、叶上的细密雨，而不是电视雪花
      const rl = filter('lowpass', 1500, 0.4)
      const rs = ctx.createGain()
      loop(this.loopNoise('pink'), filter('highpass', 220), rl, rs, g)
      wander(rl.frequency, 1100, 1800, [5, 12])
      wander(rs.gain, 0.7, 1.0, [4, 10])
      const drop = () => {
        if (quiet(g)) {
          this.later(drop, 500)
          return
        }
        const t = ctx.currentTime
        const s = ctx.createBufferSource()
        s.buffer = white
        // 檐滴：稀疏、轻、偏低，像远处瓦檐上偶尔落下的一滴
        const bp = filter('bandpass', 500 + Math.random() * 900, 3)
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.09, t + 0.01)
        e.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.6 - 0.8
        s.connect(bp).connect(e).connect(pan).connect(g)
        s.start(t, Math.random() * 1.5, 0.14)
        this.later(drop, 180 + Math.random() * Math.random() * 900)
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
      loop(this.loopNoise('pink'), a, ga, soft)
      loop(this.loopNoise('pink'), b, gb, soft)
      gb.gain.value = 0.25
      wander(a.frequency, 280, 440, [1.5, 4])
      wander(b.frequency, 720, 1000, [1, 2.5])
      wander(gb.gain, 0.1, 0.35, [0.8, 2.2])
      wander(ga.gain, 0.75, 1.0, [3, 8])
    }
    /* 鸟鸣：一串两三声的短啼，间隔随机 */
    {
      const g = layer('birds')
      const song = () => {
        if (quiet(g)) {
          this.later(song, 1500)
          return
        }
        // 远处林间的一两声：有时短啼，有时一声拖长的哨音；音量、远近、间隔都随机
        const t0 = ctx.currentTime + 0.05
        const base = 1900 + Math.random() * 1700
        const whistle = Math.random() < 0.35
        const n = whistle ? 1 : 2 + Math.floor(Math.random() * 3)
        const vol = 0.08 + Math.random() * 0.14
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.8 - 0.9
        pan.connect(g)
        for (let i = 0; i < n; i++) {
          const t = t0 + i * (0.13 + Math.random() * 0.1)
          const len = whistle ? 0.35 + Math.random() * 0.3 : 0.08
          const o = ctx.createOscillator()
          o.type = 'sine'
          o.frequency.setValueAtTime(base * (0.92 + Math.random() * 0.16), t)
          o.frequency.exponentialRampToValueAtTime(base * (whistle ? 0.8 + Math.random() * 0.5 : 1.2 + Math.random() * 0.3), t + len * 0.85)
          const e = ctx.createGain()
          e.gain.setValueAtTime(0.0001, t)
          e.gain.exponentialRampToValueAtTime(vol, t + (whistle ? 0.06 : 0.012))
          e.gain.exponentialRampToValueAtTime(0.0001, t + len)
          o.connect(e).connect(pan)
          o.start(t)
          o.stop(t + len + 0.02)
        }
        this.later(song, 2500 + Math.random() * Math.random() * 11000)
      }
      song()
    }
    /* 夏蝉：锯齿波窄带 + 快颤音，整体慢慢涨落 */
    {
      // 远处树上的蝉：三角波、偏低、过低通，一阵起一阵落，常有歇下来的时候
      const g = layer('cicada')
      for (const f of [3600, 4200, 4700]) {
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = f
        const bp = filter('bandpass', f, 6)
        const lp = filter('lowpass', 4200, 0.5)
        const trem = ctx.createGain()
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 26 + Math.random() * 12
        const lg = ctx.createGain()
        lg.gain.value = 0.35
        lfo.connect(lg).connect(trem.gain)
        trem.gain.value = 0.6
        const sw = ctx.createGain()
        sw.gain.value = 0
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.4 - 0.7
        o.connect(bp).connect(lp).connect(trem).connect(sw).connect(pan).connect(g)
        o.start()
        lfo.start()
        wander(sw.gain, 0, 0.45, [5, 14])
      }
    }
    /* 秋虫：几只蟋蟀，各自的高频三连短脉冲 */
    {
      // 草丛里三只蟋蟀：各唱一阵（几声到十几声）就歇几秒，音高、远近各不同
      const g = layer('cricket')
      for (let k = 0; k < 3; k++) {
        const f = 3600 + Math.random() * 1300
        const pan = ctx.createStereoPanner()
        pan.pan.value = Math.random() * 1.8 - 0.9
        pan.connect(g)
        const vol = 0.08 + Math.random() * 0.08
        const every = 0.6 + Math.random() * 0.5
        let left = 0
        const chirp = () => {
          if (quiet(g)) {
            this.later(chirp, 1000)
            return
          }
          if (left <= 0) {
            left = 4 + Math.floor(Math.random() * 12)
            this.later(chirp, 2500 + Math.random() * 8000)
            return
          }
          left--
          const t0 = ctx.currentTime + 0.02
          for (let i = 0; i < 3; i++) {
            const t = t0 + i * 0.05
            const o = ctx.createOscillator()
            o.frequency.value = f
            const e = ctx.createGain()
            e.gain.setValueAtTime(0.0001, t)
            e.gain.exponentialRampToValueAtTime(vol, t + 0.008)
            e.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
            o.connect(e).connect(pan)
            o.start(t)
            o.stop(t + 0.04)
          }
          this.later(chirp, every * 1000 * (0.8 + Math.random() * 0.4))
        }
        this.later(chirp, Math.random() * 3000)
      }
    }
    this.buildMusic(ctx, layer, quiet, wander)
  }

  /**
   * 古乐：五声音阶（D 宫）即兴，作背景乐用——慢、连、留白。
   *  - 音垫：宫、徵、宫八度几个低音正弦，各自极慢地涨落，铺一层若有若无的底；
   *  - 古琴：低音区，一句四到七音，余音五六秒，常带走手滑音（按弦后滑到邻音）与吟猱；
   *  - 琵琶：中音区，短音是清亮的拨弦，长音用轮指（每秒十几下的轻弹）连成一线；
   *  - 竹笛：中高音区连奏，音与音之间滑过去，偶加倚音，长音迟起颤音、末音渐弱。
   * 旋律以级进为主、先扬后抑，落在宫或徵上；各乐器过同一道偏暖的长混响。
   */
  private buildMusic(
    ctx: AudioContext,
    layer: (k: Layer) => GainNode,
    quiet: (g: GainNode) => boolean,
    wander: (param: AudioParam, lo: number, hi: number, every: [number, number]) => void,
  ): void {
    /* 混响：五秒，尾音越往后越暗（逐段加重的一阶低通），听着像空山与大殿而不是金属板 */
    const verb = ctx.createConvolver()
    const len = Math.floor(ctx.sampleRate * 5)
    const ir = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const x = i / len
        const a = 0.55 - 0.5 * x
        lp += (Math.random() * 2 - 1 - lp) * a
        d[i] = lp * Math.pow(1 - x, 2.6) * (i < 400 ? i / 400 : 1)
      }
    }
    verb.buffer = ir
    const wet = ctx.createGain()
    wet.gain.value = 0.62
    verb.connect(wet).connect(this.master!)
    /** 一件乐器：先过一道低通（去掉刺耳的高泛音）进本层，本层再按比例送混响；返回乐器的输入端 */
    const chain = (g: GainNode, cutoff: number, send: number) => {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = cutoff
      lp.Q.value = 0.5
      lp.connect(g)
      const s = ctx.createGain()
      s.gain.value = send
      g.connect(s).connect(verb)
      return lp
    }
    const qinG = layer('qin')
    const pipaG = layer('pipa')
    const diG = layer('di')
    const padG = layer('pad')
    const qin = chain(qinG, 1800, 0.9)
    const pipa = chain(pipaG, 3000, 0.75)
    const di = chain(diG, 2600, 0.8)
    const pad = chain(padG, 520, 0.6)

    /* 音垫：宫（D2）、徵（A2）、宫（D3）、徵（A3），各自几秒到十几秒地涨落，轻微失谐，像远处的笙或钟磬余韵 */
    for (const [hz, amp] of [
      [73.42, 0.34],
      [110, 0.22],
      [146.83, 0.16],
      [220, 0.06],
    ] as const) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = hz
      o.detune.value = Math.random() * 8 - 4
      const g = ctx.createGain()
      g.gain.value = amp * 0.6
      o.connect(g).connect(pad)
      o.start()
      wander(g.gain, amp * 0.25, amp, [6, 16])
    }

    /** 五声旋律：以级进为主，偶有三度跳进；前半句往上走、后半句往下收，落在宫（0）或徵（3）上 */
    const melody = (n: number, lo: number, hi: number, start: number): number[] => {
      const out: number[] = []
      let d = start
      for (let i = 0; i < n; i++) {
        const up = i < n * 0.55
        const steps = up ? [1, 1, 2, -1, 0, 1] : [-1, -1, -2, 1, 0, -1]
        d = Math.max(lo, Math.min(hi, d + steps[Math.floor(Math.random() * steps.length)]))
        out.push(d)
      }
      const last = out[n - 1]
      const m = ((last % 5) + 5) % 5
      out[n - 1] = Math.max(lo, Math.min(hi, last + (m <= 1 ? -m : 3 - m)))
      return out
    }
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)]

    /** 拨弦：几个正弦泛音各自指数衰减；可带起音噪声、吟猱（慢颤）、走手（延音中滑到另一音） */
    const pluck = (
      out: AudioNode,
      hz: number,
      t: number,
      o: { decay: number; bright: number; vol: number; pan?: number; attack?: number; vib?: number; glide?: number; glideAt?: number; noise?: boolean; partials?: number },
    ) => {
      const pan = ctx.createStereoPanner()
      pan.pan.value = o.pan ?? 0
      pan.connect(out)
      const all: [number, number, number][] = [
        [1, 1, o.decay],
        [2, 0.38 * o.bright, o.decay * 0.5],
        [3, 0.16 * o.bright, o.decay * 0.3],
        [4.01, 0.07 * o.bright, o.decay * 0.18],
      ]
      for (const [mul, amp, dec] of all.slice(0, o.partials ?? 4)) {
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(hz * mul, t)
        if (o.glide) osc.frequency.setTargetAtTime(hz * mul * o.glide, t + (o.glideAt ?? 0.5), 0.18)
        if (o.vib) {
          const lfo = ctx.createOscillator()
          lfo.frequency.value = 3.4 + Math.random() * 0.8
          const lg = ctx.createGain()
          lg.gain.setValueAtTime(0, t)
          lg.gain.linearRampToValueAtTime(hz * mul * 0.005 * o.vib, t + 0.9)
          lfo.connect(lg).connect(osc.frequency)
          lfo.start(t)
          lfo.stop(t + dec + 0.2)
        }
        const e = ctx.createGain()
        e.gain.setValueAtTime(0.0001, t)
        e.gain.exponentialRampToValueAtTime(o.vol * amp, t + (o.attack ?? 0.006))
        e.gain.exponentialRampToValueAtTime(0.0001, t + dec)
        osc.connect(e).connect(pan)
        osc.start(t)
        osc.stop(t + dec + 0.05)
      }
      if (o.noise !== false) {
        const nb = ctx.createBufferSource()
        nb.buffer = this.noiseBuf!
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'
        bp.frequency.value = Math.min(4000, hz * 3)
        bp.Q.value = 1.5
        const ne = ctx.createGain()
        ne.gain.setValueAtTime(o.vol * 0.12 * o.bright, t)
        ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
        nb.connect(bp).connect(ne).connect(pan)
        nb.start(t, Math.random(), 0.05)
      }
    }

    /* 古琴：低音区（D2 起），节拍约 0.9 秒，一句四到七音、余音长；句间留两三拍到七八拍的白 */
    let qDeg = 5
    const qinPhrase = () => {
      if (quiet(qinG)) {
        this.later(qinPhrase, 1500)
        return
      }
      const beat = 0.85 + Math.random() * 0.25
      const notes = melody(4 + Math.floor(Math.random() * 4), 2, 11, qDeg)
      const rhythm = pick([
        [1, 1, 2, 1, 1, 3, 2],
        [2, 1, 1, 2, 3, 1, 2],
        [1.5, 0.5, 2, 2, 1, 3, 2],
      ])
      let t = ctx.currentTime + 0.15
      notes.forEach((deg, i) => {
        const last = i === notes.length - 1
        const hz = noteHz(deg, 73.42)
        const r = Math.random()
        // 走手：延音中往上或往下滑到邻音（五声的下一级）
        const glide = !last && r < 0.3 ? noteHz(deg + (Math.random() < 0.5 ? 1 : -1), 73.42) / hz : undefined
        pluck(qin, hz, t, { decay: last ? 7 : 4.5, bright: 0.55, vol: 0.36, pan: -0.18, attack: 0.012, vib: last || r > 0.75 ? 1.2 : 0, glide, glideAt: 0.6 })
        // 泛音：偶尔在高八度轻轻点一下
        if (Math.random() < 0.18) pluck(qin, hz * 2, t + 0.01, { decay: 2.5, bright: 0.2, vol: 0.1, pan: -0.1, noise: false, partials: 2 })
        t += (rhythm[i % rhythm.length] ?? 1) * beat
      })
      qDeg = notes[notes.length - 1]
      this.later(qinPhrase, (t - ctx.currentTime) * 1000 + (2 + Math.random() * 6) * beat * 1000)
    }
    this.later(qinPhrase, 600)

    /* 琵琶：中音区（D3 起）；短音清亮一拨，长音轮指——每秒约十三下的轻弹，渐强又渐弱，连成一条线 */
    let pDeg = 5
    const pipaPhrase = () => {
      if (quiet(pipaG)) {
        this.later(pipaPhrase, 2000)
        return
      }
      const beat = 0.62 + Math.random() * 0.15
      const notes = melody(5 + Math.floor(Math.random() * 4), 3, 13, pDeg)
      let t = ctx.currentTime + 0.1
      notes.forEach((deg, i) => {
        const last = i === notes.length - 1
        const hz = noteHz(deg, 146.83)
        const long = last || Math.random() < 0.3
        const dur = long ? (last ? 3.2 : 2) * beat : pick([0.5, 1, 1, 1.5]) * beat
        if (long) {
          // 轮指：一串轻弹，音量先起后落，只留两个泛音、不带起音噪声
          const n = Math.max(4, Math.round(dur * 13))
          for (let k = 0; k < n; k++) {
            const x = k / (n - 1)
            const v = 0.06 + 0.1 * Math.sin(Math.PI * Math.min(1, x * 1.15)) * (0.85 + Math.random() * 0.3)
            pluck(pipa, hz, t + k / 13 + Math.random() * 0.008, { decay: 0.45, bright: 0.7, vol: v, pan: 0.2, noise: false, partials: 2 })
          }
          pluck(pipa, hz, t, { decay: 1.8, bright: 0.9, vol: 0.2, pan: 0.2 })
        } else {
          pluck(pipa, hz, t, { decay: 1.6, bright: 0.95, vol: 0.24, pan: 0.2 })
        }
        t += dur
      })
      pDeg = notes[notes.length - 1]
      this.later(pipaPhrase, (t - ctx.currentTime) * 1000 + (3 + Math.random() * 7) * beat * 1000)
    }
    this.later(pipaPhrase, 2400)

    /* 竹笛：中高音区连奏。正弦为主、带两个弱泛音；音间滑过去（连音），偶有上方倚音；长音迟起颤音；句尾渐弱 */
    let dDeg = 7
    const diPhrase = () => {
      if (quiet(diG)) {
        this.later(diPhrase, 1500)
        return
      }
      const beat = 0.7 + Math.random() * 0.2
      const notes = melody(5 + Math.floor(Math.random() * 5), 5, 14, dDeg)
      const env = ctx.createGain()
      env.gain.value = 0.0001
      const pan = ctx.createStereoPanner()
      pan.pan.value = 0.08
      env.connect(pan).connect(di)
      const oscs = [
        [1, 1],
        [2, 0.14],
        [3, 0.04],
      ].map(([mul, amp]) => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        const g = ctx.createGain()
        g.gain.value = amp
        o.connect(g).connect(env)
        return { o, mul }
      })
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 5 + Math.random() * 0.6
      const vibDepth = ctx.createGain()
      vibDepth.gain.value = 0
      lfo.connect(vibDepth)
      for (const { o } of oscs) vibDepth.connect(o.detune)
      /* 气息：很轻的一缕，跟着音高 */
      const br = ctx.createBufferSource()
      br.buffer = this.noiseBuf!
      br.loop = true
      const bbp = ctx.createBiquadFilter()
      bbp.type = 'bandpass'
      bbp.Q.value = 7
      const bg = ctx.createGain()
      bg.gain.value = 0.0001
      br.connect(bbp).connect(bg).connect(pan)

      let t = ctx.currentTime + 0.15
      const t0 = t
      notes.forEach((deg, i) => {
        const last = i === notes.length - 1
        const hz = noteHz(deg, 146.83)
        const dur = (last ? 3 + Math.random() : pick([1, 1, 1.5, 2, 0.5])) * beat
        const glideTau = i === 0 ? 0.001 : 0.045
        // 倚音：从上方邻音很快落到本音
        if (i > 0 && Math.random() < 0.22) {
          const g = noteHz(deg + 1, 146.83)
          for (const { o, mul } of oscs) {
            o.frequency.setTargetAtTime(g * mul, t, 0.012)
            o.frequency.setTargetAtTime(hz * mul, t + 0.07, glideTau)
          }
        } else for (const { o, mul } of oscs) o.frequency.setTargetAtTime(hz * mul, t, glideTau)
        bbp.frequency.setTargetAtTime(hz * 2, t, 0.05)
        // 音量：每个音一个小起伏，长音中段最响；颤音在长音后半才出来（以音分计，约 ±12 音分）
        const peak = 0.2 + (dur > beat * 1.4 ? 0.04 : 0)
        env.gain.setTargetAtTime(peak * 0.82, t, i === 0 ? 0.25 : 0.05)
        env.gain.setTargetAtTime(peak, t + dur * 0.3, dur * 0.2)
        vibDepth.gain.setTargetAtTime(0, t, 0.05)
        if (dur > beat * 1.2) vibDepth.gain.setTargetAtTime(12, t + dur * 0.4, 0.25)
        bg.gain.setTargetAtTime(0.012, t, 0.08)
        t += dur
      })
      env.gain.setTargetAtTime(0.0001, t - beat * 1.2, 0.6)
      bg.gain.setTargetAtTime(0.0001, t - beat, 0.4)
      const end = t + 2
      for (const { o } of oscs) {
        o.start(t0 - 0.1)
        o.stop(end)
      }
      lfo.start(t0)
      lfo.stop(end)
      br.start(t0)
      br.stop(end)
      dDeg = notes[notes.length - 1]
      this.later(diPhrase, (t - ctx.currentTime) * 1000 + (2.5 + Math.random() * 6) * beat * 1000)
    }
    this.later(diPhrase, 4000)
  }

  private noiseBuf: AudioBuffer | null = null

  /** 定时排下一次（销毁后不再排） */
  private later(fn: () => void, ms: number): void {
    if (!this.disposed) window.setTimeout(fn, ms)
  }

  /**
   * 噪声缓冲（白 / 粉 / 褐），默认 2 秒（给雨滴、气声这类一次性取片段用）。
   * 循环铺底用 loopNoise：每一路单独生成、七到十一秒、首尾交叉淡化成无缝循环——
   * 同一段短噪声反复循环会听出节拍般的「回声」，两路同源噪声错开叠加还会梳状滤波，声音发空。
   */
  private noise(kind: 'white' | 'pink' | 'brown', seconds = 2, seamless = false): AudioBuffer {
    const ctx = this.ctx!
    const n = Math.floor(ctx.sampleRate * seconds)
    const F = seamless ? Math.floor(ctx.sampleRate * 0.25) : 0
    const buf = ctx.createBuffer(2, n, ctx.sampleRate)
    const raw = new Float32Array(n + F)
    for (let ch = 0; ch < 2; ch++) {
      let b0 = 0
      let b1 = 0
      let b2 = 0
      let last = 0
      for (let i = 0; i < n + F; i++) {
        const w = Math.random() * 2 - 1
        if (kind === 'white') raw[i] = w * 0.5
        else if (kind === 'pink') {
          b0 = 0.99765 * b0 + w * 0.099046
          b1 = 0.963 * b1 + w * 0.2965164
          b2 = 0.57 * b2 + w * 1.0526913
          raw[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11
        } else {
          last = (last + 0.02 * w) / 1.02
          raw[i] = last * 3.5
        }
      }
      const d = buf.getChannelData(ch)
      for (let i = 0; i < n; i++) d[i] = raw[i]
      /* 无缝：开头 F 个样本与「本该接在末尾之后」的 F 个样本等功率交叉淡化，循环回到开头时波形连续 */
      for (let i = 0; i < F; i++) {
        const t = i / F
        d[i] = raw[i] * Math.sqrt(t) + raw[n + i] * Math.sqrt(1 - t)
      }
    }
    return buf
  }

  /** 循环铺底用：独立的一段长噪声（长度随机，几路之间不会同步） */
  private loopNoise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    return this.noise(kind, 7 + Math.random() * 4, true)
  }

  dispose(): void {
    this.disposed = true
    document.removeEventListener('visibilitychange', this.onVis)
    void this.ctx?.close()
    this.ctx = null
  }
}
