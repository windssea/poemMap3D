import * as THREE from 'three'
import { snowClimateAt } from '../../world/climate/Climate'
import { WeatherTint, WinterTokens } from '../../config/palette'
import type { SceneManager } from '../rendering/SceneManager'
import type { ShadowManager } from '../rendering/ShadowManager'
import type { SharedUniforms } from '../rendering/SharedUniforms'
import { FogSystem } from './FogSystem'
import { ParticleSystem } from './ParticleSystem'
import { PrecipitationSystem } from './PrecipitationSystem'
import { SeasonSystem } from './SeasonSystem'
import { SkySystem } from './SkySystem'
import { TimeOfDaySystem } from './TimeOfDaySystem'
import type { Season, TimeOfDay, Weather } from './types'
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
  private readonly hemi: THREE.HemisphereLight
  private readonly tmpColor = new THREE.Color()
  private readonly rainSky = new THREE.Color(WeatherTint.rainColor)
  private readonly winterFog = new THREE.Color(WinterTokens.fog)
  private readonly winterSky = new THREE.Color(WinterTokens.sky)
  private readonly winterSun = new THREE.Color(WinterTokens.sun)
  /** 补光：与日光相对的一盏弱平行光，阴面不至于死黑 */
  private readonly fill = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 0.3)

  constructor(
    private readonly shared: SharedUniforms,
    scene: SceneManager,
    private readonly shadows: ShadowManager,
    private readonly renderer: THREE.WebGLRenderer,
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
    this.hemi = new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(0.5, 0.45, 0.4), 1)
    scene.scene.fog = this.fog.fog
    scene.attach('environment', this.hemi)
    scene.attach('environment', this.fill)
    scene.attach('environment', this.fill.target)
    for (const o of shadows.objects) scene.attach('environment', o)
    scene.attach('environment', this.sky.mesh)
    scene.attach('effects', this.precipitation.points)
    scene.attach('effects', this.particles.group)
  }

  setTime(t: TimeOfDay, instant = false): void {
    this.time.set(t, instant)
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
    u.uSunDir.value.copy(L.sunDir)
    u.uSunColor.value.copy(L.sun)
    u.uNight.value = L.night
    u.uSkyColor.value.copy(L.top)
    u.uHorizonColor.value.copy(L.horizon)
    ;(u.uSeasonGrass.value as THREE.Color).copy(S.grass)
    ;(u.uSeasonFoliage.value as THREE.Color).copy(S.foliage)
    u.uAutumn.value = S.autumn
    u.uBlossom.value = S.blossom
    u.uSnow.value = this.weather.cover
    /* 山岚：晨起最浓，暮色次之，白天淡；雨雪加浓 */
    const mistBase = this.time.key === 'dawn' ? 0.34 : this.time.key === 'dusk' ? 0.2 : this.time.key === 'night' ? 0.16 : 0.08
    const mistWant = Math.min(0.75, mistBase + wet * 0.3)
    u.uMist.value += (mistWant - u.uMist.value) * Math.min(1, dt * 1.5)
    u.uMistY.value += (focus.y + 3 - u.uMistY.value) * Math.min(1, dt * 2)
    u.uMistNear.value = distance
    u.uWet.value = this.weather.rain
    /* 冬：画面偏冷、略褪色；阔叶落尽，水面结冰 */
    const winter = S.snow
    u.uSaturation.value = W.saturation * (1 - 0.16 * winter)
    u.uBare.value = 0.62 * winter
    u.uIce.value = 0.6 * winter

    /* 光照 */
    this.shadows.light.color.copy(L.sun).lerp(this.winterSun, 0.5 * winter)
    this.fill.color.copy(L.ambientSky)
    this.fill.intensity = (0.25 + 0.25 * L.night) * W.light
    this.fill.position.set(focus.x - L.sunDir.x * 400, focus.y + 300, focus.z - L.sunDir.z * 400)
    this.fill.target.position.copy(focus)
    this.fill.target.updateMatrixWorld()
    this.shadows.light.intensity = L.sunI * W.light
    this.hemi.color.copy(L.ambientSky)
    this.hemi.groundColor.copy(L.ambientGround)
    this.hemi.intensity = L.ambientI * (0.75 + 0.25 * W.light)
    this.renderer.toneMappingExposure = L.exposure
    this.shadows.update(focus, L.sunDir, distance)

    /* 天空、雾 */
    const horizon = this.tmpColor.copy(L.horizon).lerp(L.fog, 0.5).lerp(this.rainSky, wet * 0.5).lerp(this.winterFog, 0.45 * winter * (1 - L.night * 0.7))
    const top = L.top.clone().lerp(horizon, wet * 0.6).lerp(this.winterSky, 0.3 * winter * (1 - L.night))
    this.sky.update(camera, top, horizon)
    this.fog.update(distance, horizon, W.fog)
    const clim = snowClimateAt(focus.y, focus.z)
    this.precipitation.update(elapsed, focus, distance, Math.min(1, this.weather.rain + this.weather.snow * (1 - clim)), this.weather.snow * clim, pixelRatio)
    this.particles.update(elapsed, focus, distance, this.season.key, wet, pixelRatio)
  }

  /** 画质：粒子数量、云 */
  setQuality(particles: number): void {
    this.precipitation.scale = particles
    this.particles.scale = particles
  }

  dispose(): void {
    this.sky.dispose()
    this.precipitation.dispose()
    this.particles.dispose()
  }
}
