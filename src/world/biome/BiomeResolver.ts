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
  const snowLine = 5750 - Math.max(0, i.lat - 28) * 135 + i.noise * 300
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
    case MacroKind.Loess:
      // 黄土高原：塬、梁、峁上草木稀疏，只在深切的沟里和高处山地有林
      return i.relief > 14 || m > 2000 ? BiomeId.Hillside : BiomeId.Steppe
    case MacroKind.Karst:
      // 峰林：峰顶与谷地都是喀斯特植被；临水仍是河岸（漓江两岸的竹与柳）
      if (m < 1900) return i.waterDistance < 4 && i.slope < 1.6 ? BiomeId.Riverside : BiomeId.Karst
  }
  if (i.waterDistance < 7 && i.slope < 1.6) {
    if (i.waterDistance > 2 && i.lat < 33.5 && m < 250 && i.noise > 0.35) return BiomeId.Wetland
    return BiomeId.Riverside
  }
  const b = m > 1400 || i.relief > 10 || i.slope > 1.5 ? BiomeId.Mountain : m > 380 || i.relief > 4.5 || i.slope > 0.75 ? BiomeId.Hillside : BiomeId.Plain
  /* 岭南：北回归线附近以南的低山平地，常绿、椰棕 */
  if (i.lat < 24.3 + i.noise * 0.5 && m < 900 && b !== BiomeId.Mountain && i.lng > 104) return BiomeId.Tropical
  /* 东北：大小兴安岭、长白山一带的山地为针阔混交的林海 */
  if (i.lat > 42.3 + i.noise * 0.6 && i.lng > 119.5 && b !== BiomeId.Plain) return BiomeId.Taiga
  return b
}
