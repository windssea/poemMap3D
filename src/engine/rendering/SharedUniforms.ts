import * as THREE from 'three'
import { AutumnTokens, FoliageTokens, MaterialTokens, NightTokens, WaterTokens, WinterTokens } from '../../config/palette'

/**
 * 所有材质共享的环境 uniform：由 EnvironmentManager 每帧写入，方块、水、覆盖图、粒子读取。
 * 季节、昼夜、天气都只改这里，不重建任何网格。
 */
export function createSharedUniforms() {
  return {
    uTime: { value: 0 },
    /** 草色季节乘子 */
    uSeasonGrass: { value: new THREE.Color(1, 1, 1) },
    /** 阔叶季节乘子 */
    uSeasonFoliage: { value: new THREE.Color(1, 1, 1) },
    /** 秋色混合量 0–1 */
    uAutumn: { value: 0 },
    /** 花树开花程度（春 1，其余 0） */
    uBlossom: { value: 1 },
    /** 地面积雪 0–1 */
    uSnow: { value: 0 },
    /** 夜晚程度 0–1（灯笼自发光、水面） */
    uNight: { value: 0 },
    /** 雨湿程度 0–1 */
    uWet: { value: 0 },
    /** 整体饱和度（雨雪天压低） */
    uSaturation: { value: 1 },
    uSunDir: { value: new THREE.Vector3(0.3, 0.85, 0.55).normalize() },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSkyColor: { value: new THREE.Color(0.6, 0.75, 0.85) },
    uHorizonColor: { value: new THREE.Color(0.95, 0.92, 0.85) },
    uAutumnA: { value: new THREE.Color(AutumnTokens.maple) },
    uAutumnB: { value: new THREE.Color(AutumnTokens.gold) },
    uAutumnC: { value: new THREE.Color(AutumnTokens.rust) },
    /** 花树不在花期时的叶色 */
    uLeafGreen: { value: new THREE.Color(FoliageTokens.broad) },
    uSnowColor: { value: new THREE.Color(MaterialTokens.snow[0]) },
    /** 夜里窗纸的暖光 */
    uWindow: { value: new THREE.Color(NightTokens.window) },
    /** 冬日落叶：阔叶镂空比例 */
    uBare: { value: 0 },
    /** 冬日结冰：水面向冰色混合 */
    uIce: { value: 0 },
    uIceColor: { value: new THREE.Color(WinterTokens.ice) },
    uWaterShallow: { value: new THREE.Color(WaterTokens.shallow) },
    uWaterMid: { value: new THREE.Color(WaterTokens.mid) },
    uWaterDeep: { value: new THREE.Color(WaterTokens.deep) },
    uWaterFoam: { value: new THREE.Color(WaterTokens.foam) },
    /** 覆盖图：已显示近景区块的掩膜（覆盖图在这些区块上让位） */
    uChunkMask: { value: null as THREE.DataTexture | null },
    /** 掩膜覆盖范围：x0, z0, 宽, 高（方块） */
    uChunkMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    /** 边缘雾图（地图四边、远海、海南以南）与其覆盖范围 x0, z0, 宽, 高 */
    uFogMap: { value: null as THREE.DataTexture | null },
    uFogRect: { value: new THREE.Vector4(0, 0, 1, 1) },
    /** 覆盖图整体淡出（近看时） */
    uOverviewFade: { value: 1 },
  }
}

export type SharedUniforms = ReturnType<typeof createSharedUniforms>
