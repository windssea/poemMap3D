import { SEA_LEVEL } from '../coordinate/constants'
import { MacroKind } from '../generation/geography/MacroGeography'
import { WaterKind } from '../terrain/TerrainSample'
import { yToMeters } from '../WorldConfig'
import { BiomeId } from './BiomeId'

export interface BiomeInput {
  lat: number
  lng: number
  height: number
  slope: number
  waterDistance: number
  waterKind: WaterKind
  inWater: boolean
  override: number
  macroKind: MacroKind
  relief: number
  /** 低频噪声 [-1, 1] */
  noise: number
}

/** 按纬度、海拔、坡度、离水距离、地标与宏观地理，决定一列的生物群系 */
export function resolveBiome(i: BiomeInput): BiomeId {
  if (i.inWater && i.waterKind === WaterKind.Sea) return BiomeId.Ocean
  if (i.override >= 0) return i.override as BiomeId
  if (i.inWater) return BiomeId.Riverside
  const m = yToMeters(i.height)
  const snowLine = 5300 - Math.max(0, i.lat - 28) * 115 + i.noise * 250
  if (m > snowLine && i.slope < 4) return BiomeId.Snow
  if (i.slope >= 3.5) return BiomeId.Cliff
  if (i.waterKind === WaterKind.Sea && i.waterDistance < 8 && i.height <= SEA_LEVEL + 2) return BiomeId.Beach
  switch (i.macroKind) {
    case MacroKind.Desert:
      return BiomeId.Desert
    case MacroKind.Gobi:
      return BiomeId.Gobi
    case MacroKind.Steppe:
      return i.relief > 8 ? BiomeId.Hillside : BiomeId.Steppe
    case MacroKind.Plateau:
      return i.relief > 9 || i.slope > 1.6 ? BiomeId.Mountain : BiomeId.Plateau
  }
  if (i.waterDistance < 7 && i.slope < 1.6) {
    if (i.waterDistance > 2 && i.lat < 33.5 && m < 250 && i.noise > 0.35) return BiomeId.Wetland
    return BiomeId.Riverside
  }
  if (m > 1400 || i.relief > 10 || i.slope > 1.5) return BiomeId.Mountain
  if (m > 380 || i.relief > 4.5 || i.slope > 0.75) return BiomeId.Hillside
  return BiomeId.Plain
}
