import * as THREE from 'three'
import { SkyTokens } from '../../config/palette'
import { displayToScene } from '../rendering/DisplayColor'
import type { TimeOfDay } from './types'

interface Look {
  /** 指向太阳。夜里落到地平线以下，日轮随之隐去 */
  sunDir: THREE.Vector3
  /** 指向月亮。只在太阳落山后接管平行光，不拿来画太阳 */
  moonDir: THREE.Vector3
  sun: THREE.Color
  sunI: number
  ambientSky: THREE.Color
  ambientGround: THREE.Color
  ambientI: number
  fog: THREE.Color
  top: THREE.Color
  mid: THREE.Color
  horizon: THREE.Color
  cloud: THREE.Color
  core: THREE.Color
  rim: THREE.Color
  halo: THREE.Color
  /** 霞光：主色、上缘余晖色、强度（晨暮有，昼夜无） */
  glow: THREE.Color
  glow2: THREE.Color
  glowK: number
  /** 日轮角半径，tan(半角)。镜头远近不改变它 */
  sunR: number
  /** 晕的混合强度。昼弱于晨暮 */
  haloGain: number
  night: number
  exposure: number
}

/**
 * 月亮：南偏西的天空、仰角 11°，月盘与月光同一方向（天体、影子、受光面三者一致，不随镜头挪动）。
 *
 * 世界坐标：北在 −z、南在 +z、东在 +x（见 FocusProjection「北在 −Z」）。北半球（诗词发生的中原一带，北纬 30° 上下）的月亮
 * 东升西落、正午（子夜）在正南最高，所以月亮在南面天空，不会在北面。取南偏西 15°（罗盘方位 195°）。
 *
 * 仰角 11° 是看得见的关键，不是随手取的：地图相机的俯仰下限 PITCH_MIN = 0.1（约 5.7° 俯角），垂直视场角 42°，
 * 所以任何地图视角下画面上沿最高只到约 15° 仰角——此前放在 24°（以及 30°、38°）的月亮，在相机能到的所有角度里都在画面之外。
 * 月亮离地 11° 是月出、月落前后低低挂在南偏西天边的样子，朝南（或西南）把相机放平就在画面里，略俯视时落在上沿。
 * 朝北看的镜头看不到月盘（月亮在身后）；月光从南面来，朝北看时朝镜头的面被照亮，影子倒向远离镜头的北面。
 * 要换位置，只改这一个常量，并保持仰角不超过约 13°。
 */
const MOON: [number, number, number] = [-0.254, 0.191, 0.949]

const PRESET: Record<TimeOfDay, { dir: [number, number, number]; sunI: number; ambientI: number; night: number; exposure: number; sunR: number; haloGain: number }> = {
  // 强度按 Lambert（除以 π）校准：文档里的 1.0 左右对应这里的 2.7 一档。
  // 高度角相对世界水平面，dir 在归一化前：y / hypot(x,z) = tan(高度角)。
  // 晨约 12°（0.197 / hypot(0.86, 0.34)），昼约 54°，暮约 8°（0.124 / hypot(0.84, 0.28)）。
  // 晨 0.80 / 昼 1.06 / 暮 0.72 为 V2.0 通透感第一轮实验值（× 2.7 换算），暮靠低角度暖色直射，不整体压暗。
  dawn: { dir: [0.86, 0.197, 0.34], sunI: 2.16, ambientI: 1.4, night: 0, exposure: 1.06, sunR: 0.0147, haloGain: 0.38 },
  // 昼天光 1.14 → 1.37（×1.2）：背光面、树冠背面、屋面背光处抬起来，受光面与天空不变（地面机位暗部 +10%～+12%，亮部不动；
  // ×1.3 时俯视图的投影开始发平）。补光太弱推不动暗面（份额小），暖地面色只改色相不改亮度，都不是这里的杠杆
  // 曝光 1.08 → 0.98：水平面受光（太阳 2.86 × sin54° + 天光 1.37 ≈ 3.7）约为晨（≈ 1.85）的两倍，曝光却比晨还高，
  // 近景的柳冠、白墙、铺地、水面被推上 ACES 的肩部，褪色发白（「曝光过度」）。天空、云、霞是按本时段曝光反解的屏幕色，不受影响
  day: { dir: [0.3, 0.85, 0.55], sunI: 2.86, ambientI: 1.37, night: 0, exposure: 0.98, sunR: 0.011, haloGain: 0.18 },
  dusk: { dir: [-0.84, 0.124, 0.28], sunI: 1.94, ambientI: 1.75, night: 0, exposure: 1.08, sunR: 0.0183, haloGain: 0.4 },
  // 太阳在西边地平线下约 18°。月光仍用 MOON，不把日轮改白充当月亮。
  // 夜的层次靠月光面与背光面拉开，不全靠提曝光：曝光 1.38 → 1.3、环境光 1.02 → 0.92（月光改到东南后，北向视图朝镜头的面已被照亮；
  // 曝光试过 1.22，南向的地面机位整体暗了一到两成，回调到 1.3）
  night: { dir: [-0.84, -0.29, 0.28], sunI: 1.3, ambientI: 0.92, night: 1, exposure: 1.3, sunR: 0.014, haloGain: 0 },
}

const lookOf = (t: TimeOfDay): Look => {
  const s = SkyTokens[t]
  const p = PRESET[t]
  /* 晨、昼、暮的天空三段色与霞光写的是屏幕上看到的颜色（验收值），按该时段曝光反解回场景色，
     否则 ACES 会把它们压成发灰的浅蓝；夜的天色本来就是按场景色调的，不动。 */
  const warm = t === 'day' ? 0 : 1
  const seen = (hex: string): THREE.Color => (t === 'night' ? new THREE.Color(hex) : displayToScene(hex, p.exposure, warm))
  return {
    sunDir: new THREE.Vector3(...p.dir).normalize(),
    moonDir: new THREE.Vector3(...MOON).normalize(),
    sun: new THREE.Color(s.sun),
    sunI: p.sunI,
    ambientSky: new THREE.Color(s.ambientSky),
    ambientGround: new THREE.Color(s.ambientGround),
    ambientI: p.ambientI,
    fog: new THREE.Color(s.fog),
    top: seen(s.top),
    mid: seen(s.mid),
    horizon: seen(s.horizon),
    // 云是直接看到的颜色，与天空同法按屏幕色反解（夜的云色本就是场景色）
    cloud: seen(s.cloud),
    core: new THREE.Color(s.core),
    rim: new THREE.Color(s.rim),
    halo: new THREE.Color(s.halo),
    glow: seen(s.glow),
    glow2: seen(s.glow2),
    glowK: s.glowK,
    sunR: p.sunR,
    haloGain: p.haloGain,
    night: p.night,
    exposure: p.exposure,
  }
}

/** 两个时段外观按 k 插值，写进 c（c 可以就是 a） */
function blend(a: Look, b: Look, k: number, c: Look): Look {
  c.sunDir.lerpVectors(a.sunDir, b.sunDir, k).normalize()
  c.moonDir.lerpVectors(a.moonDir, b.moonDir, k).normalize()
  c.sun.lerpColors(a.sun, b.sun, k)
  c.ambientSky.lerpColors(a.ambientSky, b.ambientSky, k)
  c.ambientGround.lerpColors(a.ambientGround, b.ambientGround, k)
  c.fog.lerpColors(a.fog, b.fog, k)
  c.top.lerpColors(a.top, b.top, k)
  c.mid.lerpColors(a.mid, b.mid, k)
  c.horizon.lerpColors(a.horizon, b.horizon, k)
  c.cloud.lerpColors(a.cloud, b.cloud, k)
  c.core.lerpColors(a.core, b.core, k)
  c.rim.lerpColors(a.rim, b.rim, k)
  c.halo.lerpColors(a.halo, b.halo, k)
  c.glow.lerpColors(a.glow, b.glow, k)
  c.glow2.lerpColors(a.glow2, b.glow2, k)
  c.glowK = a.glowK + (b.glowK - a.glowK) * k
  c.sunI = a.sunI + (b.sunI - a.sunI) * k
  c.ambientI = a.ambientI + (b.ambientI - a.ambientI) * k
  c.sunR = a.sunR + (b.sunR - a.sunR) * k
  c.haloGain = a.haloGain + (b.haloGain - a.haloGain) * k
  c.night = a.night + (b.night - a.night) * k
  c.exposure = a.exposure + (b.exposure - a.exposure) * k
  return c
}

/**
 * 薄暮：暮 / 晨与夜之间的过渡途中经过的中间帧（不对外，稳定的暮景、夜景不变）。
 * 暮的杏色地平线与夜的灰蓝直接插值，屏幕上的中点是偏粉的暖灰（地平线 #D3B2A5、中段 #AD919F，饱和度 0.34 / 0.15）；
 * 这里让天色经过红粉—紫—靛（地平线 #D4857A 0.51、中段 #8E6F9A 偏紫、天顶 #3E4C7E 靛），是「烧」过去的。
 * 天空三段写的是屏幕色，与晨昼暮同法反解；其余取两端各半。
 */
const TWILIGHT = { top: '#3E4C7E', mid: '#8E6F9A', horizon: '#D4857A', fog: '#9A8A94', ambientSky: '#9AA4C4', ambientGround: '#6F5A66' }
const twilightOf = (side: 'dawn' | 'dusk'): Look => {
  const L = blend(lookOf(side), lookOf('night'), 0.5, lookOf(side))
  const seen = (hex: string): THREE.Color => displayToScene(hex, L.exposure, 0.5)
  L.top.copy(seen(TWILIGHT.top))
  L.mid.copy(seen(TWILIGHT.mid))
  L.horizon.copy(seen(TWILIGHT.horizon))
  L.fog.set(TWILIGHT.fog)
  L.ambientSky.set(TWILIGHT.ambientSky)
  L.ambientGround.set(TWILIGHT.ambientGround)
  return L
}

const cloneLook = (L: Look): Look => ({
  sunDir: L.sunDir.clone(),
  moonDir: L.moonDir.clone(),
  sun: L.sun.clone(),
  sunI: L.sunI,
  ambientSky: L.ambientSky.clone(),
  ambientGround: L.ambientGround.clone(),
  ambientI: L.ambientI,
  fog: L.fog.clone(),
  top: L.top.clone(),
  mid: L.mid.clone(),
  horizon: L.horizon.clone(),
  cloud: L.cloud.clone(),
  core: L.core.clone(),
  rim: L.rim.clone(),
  halo: L.halo.clone(),
  glow: L.glow.clone(),
  glow2: L.glow2.clone(),
  glowK: L.glowK,
  sunR: L.sunR,
  haloGain: L.haloGain,
  night: L.night,
  exposure: L.exposure,
})

/** 时辰：晨 · 昼 · 暮 · 夜。方向、日轮和天光一起平滑过渡；暮 / 晨与夜之间经过薄暮 */
export class TimeOfDaySystem {
  key: TimeOfDay
  readonly cur: Look
  private from: Look
  private to: Look
  /** 途中经过的中间帧（暮 / 晨 ↔ 夜才有） */
  private via: Look | null = null
  private t = 1
  private dur = 1.4

  constructor(initial: TimeOfDay) {
    this.key = initial
    this.cur = lookOf(initial)
    this.from = lookOf(initial)
    this.to = lookOf(initial)
  }

  set(key: TimeOfDay, instant = false): void {
    const prev = this.key
    this.key = key
    this.from = cloneLook(this.cur)
    this.to = lookOf(key)
    const side = prev === 'night' ? key : key === 'night' ? prev : null
    this.via = !instant && (side === 'dawn' || side === 'dusk') ? twilightOf(side) : null
    this.dur = this.via ? 2.4 : 1.4
    this.t = instant ? 1 : 0
    if (instant) this.apply(1)
  }

  update(dt: number): void {
    if (this.t >= 1) return
    this.t = Math.min(1, this.t + dt / this.dur)
    this.apply(this.t * this.t * (3 - 2 * this.t))
  }

  private apply(k: number): void {
    const v = this.via
    if (!v) blend(this.from, this.to, k, this.cur)
    else if (k < 0.5) blend(this.from, v, k * 2, this.cur)
    else blend(v, this.to, k * 2 - 1, this.cur)
  }
}
