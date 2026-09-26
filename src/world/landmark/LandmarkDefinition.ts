import type { BiomeId } from '../biome/BiomeId'
import type { BuildingParams } from '../building/BuildingFactory'
import type { BuildingId } from '../building/BuildingRegistry'
import type { GeoPoint } from '../coordinate/GeoProjection'
import type { TreeType } from '../biome/BiomeRegistry'
import type { VegetationProfile } from '../vegetation/TreePlacementSystem'

type XZ = readonly [number, number]

/** 地形操作（局部坐标：方块，以地标中心为原点，x 向东、z 向南） */
export type TerrainOp =
  | { t: 'flatten'; x: number; z: number; r: number; square?: boolean; /** 方形时南北半深（缺省同 r） */ rz?: number; dy?: number; pave?: boolean; blend?: number; overWater?: boolean }
  | { t: 'lake'; x: number; z: number; rx: number; rz: number; depth?: number; rot?: number }
  | { t: 'hill'; x: number; z: number; r: number; h: number; sharp?: number }
  | { t: 'causeway'; pts: readonly XZ[]; w: number; dy?: number }
  | { t: 'canal'; pts: readonly XZ[]; w: number }
  | { t: 'island'; x: number; z: number; r: number; dy?: number }
  | { t: 'pave'; x0: number; z0: number; x1: number; z1: number }
  /** 山顶小台：把半径内垫高到基准面（只垫不削），外圈缓坡——山巅亭子不再立在石柱上 */
  | { t: 'raise'; r: number; blend?: number }

export interface StructureSpec {
  b: BuildingId
  p?: BuildingParams
  x: number
  z: number
  /** 俯视顺时针 90° 的次数；0 = 正面朝南 */
  rot?: number
  /** 相对地面抬高 */
  dy?: number
  /** 以地标基准地面为准（桥、台）而不是当地地表 */
  atLevel?: boolean
  /** 可以立在水上（水榭、桥） */
  overWater?: boolean
  /** 桥：沿自身轴线在 ±20 格内找水面，居中跨过去（河道位置由地形决定） */
  span?: boolean
}

export interface CityWallSpec {
  x: number
  z: number
  /** 半宽 / 半深（方块） */
  hw: number
  hd: number
  height?: number
  gates: ('n' | 's' | 'e' | 'w')[]
}

export interface TreeSpec {
  type: TreeType
  variant?: number
  pts: readonly XZ[]
  /** 沿折线等距栽 n 株 */
  n?: number
}

export interface CameraPreset {
  /** 相机相对目标的水平方位角（弧度，0 = 从南往北看） */
  yaw: number
  /** 俯角（弧度） */
  pitch: number
  distance: number
}

export interface LandmarkDefinition {
  id: string
  name: string
  coordinate: GeoPoint
  /** 地标中心相对经纬度坐标的偏移（方块），避让江河等 */
  offset?: XZ
  /** 影响半径（方块） */
  radius: number
  /** 基准地面相对当地地势的抬升 */
  levelDy?: number
  /** 基准面的真实海拔（米）：宏观网格把平原城市抬到了山上时（山阴旁是会稽山），直接按实测定台面 */
  levelMeters?: number
  /** 基准面取法：默认周围中位；summit 取中心一小圈的最高处（山巅亭台） */
  levelMode?: 'summit'
  terrainModifier?: readonly TerrainOp[]
  structures: readonly StructureSpec[]
  walls?: readonly CityWallSpec[]
  biomeOverride?: { biome: BiomeId; radius: number }
  vegetationProfile?: VegetationProfile
  trees?: readonly TreeSpec[]
  cameraPreset?: CameraPreset
  poetryPlaceId: string
  /** 水面上的小舟、瀑布等特写元素 */
  waterfall?: { x: number; z: number; top: number; width: number; dir: 'n' | 's' | 'e' | 'w' }
  /** 允许穿城而过的江河（如洛水贯都）：避让时不算它，城墙在水上留水门 */
  allowRivers?: readonly string[]
  /** 是否为手工营造的名胜（全国视图显示体量代理） */
  major?: boolean
}

/** 由诗词数据派生的地点锚点（World 只通过 placeId 与诗词关联） */
export interface PlaceAnchor {
  id: string
  name: string
  lng: number
  lat: number
  /** 诗作数量 */
  weight: number
}
