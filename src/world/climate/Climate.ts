import { smoothstep } from '../../utils/math'
import { getProjection } from '../coordinate/GeoProjection'
import { metersToY } from '../WorldConfig'

const P = getProjection()

/**
 * 气候带（冬季积雪）：秦岭—淮河以北（约北纬 33.5°）满覆，向南渐薄，
 * 南岭以南（约北纬 27°）平地不积雪；海拔 1800 米以上南北皆有雪。
 * 以世界 z（向南增大）与方块高度表示，着色器与主线程共用同一组常数。
 */
export const SNOW_BAND = {
  northZ: P.project(112, 33.5).z,
  southZ: P.project(112, 27).z,
  altY: metersToY(1800),
} as const

/** 某处的积雪气候系数 0（不积雪）..1（全覆） */
export function snowClimateAt(y: number, z: number): number {
  const lat = 1 - smoothstep(SNOW_BAND.northZ, SNOW_BAND.southZ, z)
  const alt = smoothstep(SNOW_BAND.altY - 10, SNOW_BAND.altY + 10, y)
  return Math.max(lat, alt)
}

/** 同一函数的 GLSL 版本 */
export const GLSL_CLIMATE = /* glsl */ `
float snowClimate(vec3 w) {
  float lat = 1.0 - smoothstep(${SNOW_BAND.northZ.toFixed(1)}, ${SNOW_BAND.southZ.toFixed(1)}, w.z);
  float alt = smoothstep(${(SNOW_BAND.altY - 10).toFixed(1)}, ${(SNOW_BAND.altY + 10).toFixed(1)}, w.y);
  return max(lat, alt);
}
`
