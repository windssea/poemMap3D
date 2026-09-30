import * as THREE from 'three'
import { snowClimateAt } from '../../world/climate/Climate'
import { smoothstep } from '../../utils/math'
import { WeatherTint, WinterTokens } from '../../config/palette'
import type { SceneManager } from '../rendering/SceneManager'
import type { ShadowManager } from '../rendering/ShadowManager'
import type { SharedUniforms } from '../rendering/SharedUniforms'
import { CloudSystem } from './CloudSystem'
import { FogSystem } from './FogSystem'
import { ParticleSystem } from './ParticleSystem'
import { PrecipitationSystem } from './PrecipitationSystem'
import { SeasonSystem } from './SeasonSystem'
import { SkySystem } from './SkySystem'
import { TimeOfDaySystem } from './TimeOfDaySystem'
import type { Season, TimeOfDay, Weather } from './types'
import { VIEW_CODE, type LightingTweaks } from '../rendering/LightingDebug'
import { WeatherSystem } from './WeatherSystem'

/**
 * 环境：时辰 × 季节 × 天气，统一驱动光照、天空、雾、水、植被染色、积雪、云与粒子。
 * 只改共享 uniform 与少量场景对象，不重建任何网格。
 */
export class EnvironmentManager {
  readonly time: TimeOfDaySystem
  readonly season: SeasonSystem
  readonly weather: WeatherSystem
  readonly sky: SkySystem
  readonly fog = new FogSystem()
  readonly precipitation = new PrecipitationSystem()
  readonly particles: ParticleSystem
  readonly clouds: CloudSystem
  private readonly hemi: THREE.HemisphereLight
  private readonly tmpColor = new THREE.Color()
  private readonly tmpTop = new THREE.Color()
  private readonly tmpMid = new THREE.Color()
  private readonly tmpAmb = new THREE.Color()
  private readonly rainSky = new THREE.Color(WeatherTint.skyRain)
  private readonly snowSky = new THREE.Color(WeatherTint.skySnow)
  private readonly mistSky = new THREE.Color(WeatherTint.skyMist)
  private readonly winterFog = new THREE.Color(WinterTokens.fog)
  private readonly winterSun = new THREE.Color(WinterTokens.sun)
  /** 照地的光：太阳在地平线上时等于日轮方向，落山后才交给月亮 */
  private readonly lightDir = new THREE.Vector3()
  /** 补光：与日光相对的一盏弱平行光，阴面不至于死黑 */
  private readonly fill = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 0.3)
  /** 调试滑条。空着就用默认：天空与太阳按 1 倍，AO / 面向全开 */
  lighting: LightingTweaks | null = null

  constructor(
    private readonly shared: SharedUniforms,
    scene: SceneManager,
    private readonly shadows: ShadowManager,
    private readonly renderer: THREE.WebGLRenderer,
    /** 相机控制器：天空自适应渐变带读它的视线方向 */
    private readonly cameraCtrl: { readonly viewDir: THREE.Vector3 },
    initial: { time: TimeOfDay; season: Season; weather: Weather },
    waterfalls: { x: number; y: number; z: number; width: number }[],
  ) {
    this.time = new TimeOfDaySystem(initial.time)
    this.season = new SeasonSystem(initial.season)
    this.weather = new WeatherSystem(initial.weather)
    this.weather.setSeason(initial.season)
    this.weather.set(initial.weather, true)
    this.sky = new SkySystem(shared)
    this.particles = new ParticleSystem(waterfalls)
    this.clouds = new CloudSystem(shared)
    this.hemi = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.5, 0.45, 0.4), 1)
    scene.scene.fog = this.fog.fog
    scene.attach('environment', this.hemi)
    scene.attach('environment', this.fill)
    scene.attach('environment', this.fill.target)
    for (const o of shadows.objects) scene.attach('environment', o)
    scene.attach('environment', this.sky.mesh)
    scene.attach('effects', this.precipitation.points)
    scene.attach('effects', this.particles.group)
    scene.attach('environment', this.clouds.mesh)
    shared.uLitSeq.value = initial.time === 'night' ? 1 : 0
  }

  setTime(t: TimeOfDay, instant = false): void {
    this.time.set(t, instant)
    if (instant) this.shared.uLitSeq.value = t === 'night' ? 1 : 0
  }
  setSeason(s: Season, instant = false): void {
    this.season.set(s, instant)
    this.weather.setSeason(s)
  }
  setWeather(w: Weather, instant = false): void {
    this.weather.set(w, instant)
  }

  update(dt: number, elapsed: number, camera: THREE.PerspectiveCamera, focus: THREE.Vector3, distance: number, pixelRatio: number): void {
    this.time.update(dt)
    this.season.update(dt)
    this.weather.update(dt, this.season.cur.snow)
    const L = this.time.cur
    const S = this.season.cur
    const W = this.weather.tint()
    const wet = Math.max(this.weather.rain, this.weather.snow)
    const u = this.shared

    u.uTime.value = elapsed
    // 日轮还在地平线上时，平行光必须就是这个方向。落到地平线下再把光缓交给月亮，避免从地下照上来。
    const elev = L.sunDir.y
    const moonK = elev >= 0.06 ? 0 : elev <= -0.16 ? 1 : (0.06 - elev) / 0.22
    this.lightDir.copy(L.sunDir).lerp(L.moonDir, moonK)
    if (this.lightDir.lengthSq() > 1e-8) this.lightDir.normalize()
    /* 低日照地的光比日轮略高（方位不变，日轮仍画在真实位置）：晨约 12°、暮约 8° 的掠射光会让台阶、山坳整片落进
       山体和彼此的阴影里，平地直射只剩正午的一成多。高度 0.3 以上不抬，贴地平线处渐入。 */
    const lift = 0.11 * smoothstep(-0.03, 0.05, elev) * smoothstep(0.3, 0.1, elev)
    if (lift > 0) {
      this.lightDir.y = Math.max(this.lightDir.y + lift, 0.03)
      this.lightDir.normalize()
    }
    u.uSunDir.value.copy(this.lightDir)
    u.uSunColor.value.copy(L.sun)
    u.uNight.value = L.night
    /* 入夜点灯：从注视处向外一片片亮起（约 6.5 秒），天亮时约 3 秒熄完；瞬时切换时段则直接到位（见 setTime） */
    const litWant = L.night > 0.35 ? 1 : 0
    u.uLitSeq.value = litWant ? Math.min(1, u.uLitSeq.value + dt / 6.5) : Math.max(0, u.uLitSeq.value - dt / 3)
    // 点灯中心在入夜前一直跟着注视点，入夜（开始点灯）那一刻定下，点灯、熄灯期间不再随镜头走
    if (u.uLitSeq.value <= 0.001) u.uLitCenter.value.copy(focus)
    ;(u.uSeasonGrass.value as THREE.Color).copy(S.grass)
    ;(u.uSeasonFoliage.value as THREE.Color).copy(S.foliage)
    u.uAutumn.value = S.autumn
    u.uBlossom.value = S.blossom
    u.uSnow.value = this.weather.cover
    const lotusWant = this.season.key === 'summer' ? 1 : this.season.key === 'spring' ? 0.3 : this.season.key === 'autumn' ? 0.4 : 0
    u.uLotus.value += (lotusWant - u.uLotus.value) * Math.min(1, dt * 1.2)
    /* 山岚：晨起最浓，暮色次之，白天淡；雨雪加浓 */
    const mistBase = this.time.key === 'dawn' ? 0.34 : this.time.key === 'dusk' ? 0.2 : this.time.key === 'night' ? 0.16 : 0.08
    const mistWant = Math.min(0.8, mistBase + wet * 0.3 + this.weather.mist * 0.42)
    u.uMist.value += (mistWant - u.uMist.value) * Math.min(1, dt * 1.5)
    u.uMistY.value += (focus.y + 3 - u.uMistY.value) * Math.min(1, dt * 2)
    u.uMistNear.value = distance
    u.uWet.value = this.weather.rain
    /* 冬：画面偏冷、略褪色；阔叶落尽，水面结冰 */
    const winter = S.snow
    u.uSaturation.value = W.saturation * (1 - 0.16 * winter)
    // 冬：北方落叶树的叶子几乎落尽（着色器里再乘积雪气候系数，岭南常绿不落）
    u.uBare.value = 0.96 * winter
    u.uIce.value = 0.6 * winter

    /* 光照。天空光（半球 + 对向补光）和太阳分开乘，调试时可以只留其中一路 */
    const tw = this.lighting
    const skyK = tw?.sky ?? 1
    const sunK = tw?.sun ?? 1
    this.shadows.light.color.copy(L.sun).lerp(this.winterSun, 0.5 * winter)
    /* 天光随天气：天空罩上雨雪雾色时，阴影里的天光也跟着变（否则天灰了、阴影仍是晴天的蓝） */
    const amb = this.tmpAmb.copy(L.ambientSky).lerp(this.rainSky, this.weather.rain * 0.3).lerp(this.snowSky, this.weather.snow * 0.3).lerp(this.mistSky, this.weather.mist * 0.2)
    this.fill.color.copy(amb)
    // 补光走直射路径，不被 AO / 烘焙 / 面向系数衰减，只抬没被太阳照到的面、不动天空和水：白天 0.32 → 0.40（约为太阳的 0.14），夜里仍是 0.52
    this.fill.intensity = (0.4 + 0.4 * L.night) * W.light * skyK
    this.fill.position.set(focus.x - this.lightDir.x * 400, focus.y + 300, focus.z - this.lightDir.z * 400)
    this.fill.target.position.copy(focus)
    this.fill.target.updateMatrixWorld()
    this.shadows.light.intensity = L.sunI * W.light * sunK
    this.hemi.color.copy(amb)
    this.hemi.groundColor.copy(L.ambientGround)
    this.hemi.intensity = L.ambientI * (0.75 + 0.25 * W.light) * skyK
    this.renderer.toneMappingExposure = L.exposure * (tw?.exposure ?? 1)
    u.uAoStrength.value = tw?.ao ?? 1
    u.uFaceStrength.value = tw?.face ?? 1
    u.uFogOn.value = tw && !tw.fog ? 0 : 1
    u.uDebugView.value = VIEW_CODE[tw?.view ?? 'final']
    this.shadows.update(focus, this.lightDir, distance)

    /* 天空保持三段渐变。天气只往时段色上罩一层，不把晨昼暮夜收成同一个灰。 */
    const rainK = this.weather.rain
    const snowK = this.weather.snow
    const mistK = this.weather.mist
    const top = this.tmpTop.copy(L.top)
    const mid = this.tmpMid.copy(L.mid)
    const horizon = this.tmpColor.copy(L.horizon)
    top.lerp(this.rainSky, rainK * 0.42)
    mid.lerp(this.rainSky, rainK * 0.5)
    horizon.lerp(this.rainSky, rainK * 0.22)
    top.lerp(this.snowSky, snowK * 0.28)
    mid.lerp(this.snowSky, snowK * 0.4)
    horizon.lerp(this.snowSky, snowK * 0.34)
    horizon.lerp(this.mistSky, mistK * 0.4)
    mid.lerp(this.mistSky, mistK * 0.12)
    this.sky.update(camera, L.sunDir, L.moonDir, L.core, L.rim, L.halo, L.sunR, L.haloGain)
    u.uSkyTop.value.copy(top)
    u.uSkyMid.value.copy(mid)
    u.uSkyColor.value.copy(mid)
    u.uHorizonColor.value.copy(horizon)
    u.uSkyLift.value = this.skyLiftOf()
    /* 霞光跟着日出 / 日落的水平方位走；雨、雾天压薄 */
    u.uGlowDir.value.set(L.sunDir.x, 0, L.sunDir.z)
    u.uGlowCol.value.copy(L.glow)
    u.uGlowCol2.value.copy(L.glow2)
    u.uGlowK.value = L.glowK * (1 - 0.65 * rainK - 0.4 * snowK - 0.5 * mistK)
    const fogCol = top.copy(L.fog).lerp(this.rainSky, rainK * 0.35).lerp(this.snowSky, snowK * 0.4).lerp(this.winterFog, winter * 0.2 * (1 - L.night))
    // 白天雾色向中段青靠一点，避免雾和天色完全拧开；不再整体压暗——远处把光还回去靠的是距离，不是发灰
    if (L.night < 0.15) fogCol.lerp(mid, 0.3)
    this.fog.update(distance, fogCol, W.fog, !tw || tw.fog)
    const clim = snowClimateAt(focus.y, focus.z)
    this.precipitation.update(elapsed, focus, distance, Math.min(1, this.weather.rain + this.weather.snow * (1 - clim)), this.weather.snow * clim, pixelRatio)
    this.particles.update(elapsed, focus, distance, this.season.key, wet, pixelRatio)
    this.clouds.update(dt, elapsed, focus, distance, this.cameraCtrl.viewDir, L.cloud, this.rainSky, wet)
  }

  /** 画质：粒子数量、云 */
  setQuality(particles: number): void {
    this.precipitation.scale = particles
    this.particles.scale = particles
    this.clouds.setQuality(particles)
  }

  /** 天空渐变带：俯视地图镜头用俯角带（0），接近水平的机位铺满全带（1） */
  private skyLiftOf(): number {
    const fy = this.cameraCtrl?.viewDir?.y ?? -1
    return THREE.MathUtils.smoothstep(fy, -0.62, -0.08)
  }

  dispose(): void {
    this.sky.dispose()
    this.precipitation.dispose()
    this.particles.dispose()
    this.clouds.dispose()
  }
}
