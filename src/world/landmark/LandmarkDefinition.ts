import type { BiomeId } from '../biome/BiomeId'
import type { BuildingParams } from '../building/BuildingFactory'
import type { BuildingId } from '../building/BuildingRegistry'
import type { GeoPoint } from '../coordinate/GeoProjection'
import type { TreeType } from '../biome/BiomeRegistry'
import type { VegetationProfile } from '../vegetation/TreePlacementSystem'

type XZ = readonly [number, number]

/** 地形操作（局部坐标：方块，以地标中心为原点，x 向东、z 向南） */
export type TerrainOp =
  | { t: 'flatten'; x: number; z: number; r: number; square?: boolean; /** 方形时南北半深（缺省同 r） */ rz?: number; dy?: number; pave?: boolean; blend?: number; overWater?: boolean; /** 过渡带削低时不留山：高出台面的一律削成缓坡（城池切进山脚处，不留一道切出来的崖） */ shave?: boolean; /** 只是整片垫底的平整（杭州的湖山底盘）：核心不锁定，邻近地标仍可改 */ soft?: boolean }
  /** 月牙形水面：以 (x, z) 为圆心、半径 r 的一段弧带，从角 a0 到 a1（弧度，0 朝东、π/2 朝南），中段最宽 w、两角收尖 */
  | { t: 'crescent'; x: number; z: number; r: number; a0: number; a1: number; w: number; depth?: number }
  /** 沙丘：沿脊线一道平滑沙脊（迎风坡缓、背风坡陡，不分级）；lee 为背风坡在脊线哪一侧（同 ridge 的 cliffSide） */
  | { t: 'dune'; pts: readonly (readonly [number, number])[]; h: number; w: number; lee: 1 | -1 }
  /** 石峰：在原地面上叠起一根陡峭的花岗岩柱（叠加，不压低真峰；黄山的峰林） */
  | { t: 'spire'; x: number; z: number; r: number; h: number }
  | { t: 'lake'; x: number; z: number; rx: number; rz: number; depth?: number; rot?: number; /** 潭口：岸外低于水面处补一圈潭沿（挂在坡上的潭） */ rim?: boolean }
  | { t: 'hill'; x: number; z: number; r: number; h: number; sharp?: number }
  /**
   * 山脊：沿折线起脊，两侧不对称——cliffSide 一侧（沿折线前进方向看，1 为右手、-1 为左手）是宽 cliff 的陡崖，
   * 另一侧是宽 w 的缓坡并有几道冲沟；脊线两头收、中间高（最高 h）。
   */
  | { t: 'ridge'; pts: readonly XZ[]; h: number; w: number; cliff: number; cliffSide: 1 | -1; /** 峡谷：崖壁直落水边，不在临水处压低 */ toWater?: boolean; /** 两头不收（关隘：缺口两侧直接是高崖） */ squareEnds?: boolean }
  | { t: 'causeway'; pts: readonly XZ[]; w: number; dy?: number }
  | { t: 'canal'; pts: readonly XZ[]; w: number }
  | { t: 'island'; x: number; z: number; r: number; dy?: number }
  | { t: 'pave'; x0: number; z0: number; x1: number; z1: number }
  /** 山道：沿折线铺一条宽 w 的石阶（顺地形，逐格高差即踏步），不长树草 */
  | { t: 'path'; pts: readonly XZ[]; w: number }
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
  /** 城楼：层数（2 以上为砖砌关楼）、瓦色；可按门单独指定层数 */
  gateLevels?: number | Partial<Record<'n' | 's' | 'e' | 'w', number>>
  gateTile?: 'gray' | 'yellow' | 'green'
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
  /** 长城接线：关城与长城相接的几段墙（局部坐标折线），由长城系统按长城的做法砌（敌台、垛口） */
  greatWall?: readonly (readonly XZ[])[]
  biomeOverride?: { biome: BiomeId; radius: number }
  vegetationProfile?: VegetationProfile
  trees?: readonly TreeSpec[]
  cameraPreset?: CameraPreset
  /** 定稿机位：第一个是主景（点地名飞到这里），其余可在界面里切换。注视点 = 地标中心 + offset（x 东、y 相对基准地面上一格、z 南） */
  shots?: readonly LandmarkShot[]
  poetryPlaceId: string
  /** 水面上的小舟、瀑布等特写元素 */
  waterfall?: { x: number; z: number; top: number; width: number; dir: 'n' | 's' | 'e' | 'w' }
  /** 允许穿城而过的江河（如洛水贯都）：避让时不算它，城墙在水上留水门 */
  allowRivers?: readonly string[]
  /** 临水是设计好的（城台、码头接水）：不因主楼底座近水而整组挪位 */
  waterfront?: boolean
  /** 是否为手工营造的名胜（全国视图显示体量代理） */
  major?: boolean
}

export interface LandmarkShot extends CameraPreset {
  /** 'hero' 主景、'context' 全景、'detail' 近观、'vista' 远眺；园林等可另起子场景 id */
  id: string
  /** 界面上的名字：主景、全景、近观…… */
  name: string
  offset?: readonly [number, number, number]
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
