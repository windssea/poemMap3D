import { SEA_LEVEL } from './coordinate/constants'

/**
 * 世界尺度参数（经性能原型确定，集中在这里，不在各模块里硬编码）。
 *
 * 艺术化中国地图：诗词密集的东部腹地 1 方块 ≈ 0.009°（杭州—长安约 1100 方块），
 * 西部、北部与南海压缩到四成左右。竖向按 海拔^0.78 压缩并适度夸张。
 */
export const WorldConfig = {
  seed: 20260925,

  projection: {
    /** 腹地每纬度的方块数 */
    blocksPerDegree: 111,
    /** 经度方向按北纬 35° 余弦收缩 */
    referenceLatitude: 35,
    /** 边远地区的最小比例 */
    floor: 0.42,
    /** 腹地经度过渡带：[起始, 满幅, 满幅止, 结束] */
    coreLng: [97, 104, 122, 127] as const,
    coreLat: [18.5, 23, 40.5, 45] as const,
    /** 原点（方块 0,0）所在经纬度 */
    originLng: 112,
    originLat: 33,
  },

  /** 地图经纬度范围 */
  bounds: { lngMin: 72, lngMax: 135.5, latMin: 12, latMax: 54 },

  /** 宏观地理网格：每格边长（方块）。用于海拔、区域类型、海岸，区块生成时再插值 + 细节噪声 */
  macroCell: 8,

  elevation: {
    seaLevel: SEA_LEVEL,
    /** 方块 Y = 海平面 + 1 + scale × (海拔千米)^exponent */
    scale: 44,
    exponent: 0.78,
    maxY: 300,
    /** 近海海床最浅、远海最深（方块） */
    seaDepthMin: 3,
    seaDepthMax: 22,
  },

  /** 艺术化单位（江河宽、湖泊半径的旧数据单位）→ 方块 */
  artUnitBlocks: 11,

  /** 全国覆盖图：每格边长（方块） */
  overviewCell: 8,
  overviewTile: 64,
} as const

export const metersToY = (m: number): number => {
  const e = WorldConfig.elevation
  return e.seaLevel + 1 + e.scale * Math.pow(Math.max(0, m) / 1000, e.exponent)
}

export const yToMeters = (y: number): number => {
  const e = WorldConfig.elevation
  return 1000 * Math.pow(Math.max(0, y - e.seaLevel - 1) / e.scale, 1 / e.exponent)
}
