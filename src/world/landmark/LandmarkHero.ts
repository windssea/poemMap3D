import type { BuildingId } from '../building/BuildingRegistry'
import type { LandmarkDefinition, StructureSpec } from './LandmarkDefinition'

/** 选主楼：石窟大龛 > 名楼 > 楼阁、名松、关楼 > 塔 > 殿 > 亭，同级取先列出的（显式 def.hero 优先） */
const HERO_RANK: Partial<Record<BuildingId, number>> = {
  grottoFacade: 7,
  grandTower: 6,
  loft: 5,
  sculptedPine: 5,
  passTower: 5,
  pagoda: 4,
  brickPagoda: 4,
  tower: 4,
  bellTower: 3,
  hall: 2,
  gardenHall: 2,
  pavilion: 1,
}

/** 主体在 def.structures 里的下标；没有建筑为 -1 */
export function heroIndex(def: LandmarkDefinition): number {
  if (def.hero && def.structures[def.hero.structure]) return def.hero.structure
  let best = -1
  let rank = -1
  def.structures.forEach((s: StructureSpec, i) => {
    const r = HERO_RANK[s.b] ?? 0
    if (r > rank) {
      rank = r
      best = i
    }
  })
  return best
}

/** 主体类型：显式写的为准，否则按建筑种类推 */
export function heroKind(def: LandmarkDefinition): 'building' | 'tree' | 'carving' | 'pass' | null {
  if (def.hero) return def.hero.kind
  const i = heroIndex(def)
  if (i < 0) return null
  const b = def.structures[i].b
  return b === 'sculptedPine' ? 'tree' : b === 'grottoFacade' ? 'carving' : b === 'passTower' ? 'pass' : 'building'
}

/** 主体是否够分量撑起一处的视觉主体（塔、楼阁、名楼、名松、石窟、关楼；显式指定的一律算） */
export function heroIsLandmark(def: LandmarkDefinition): boolean {
  if (def.hero) return true
  const i = heroIndex(def)
  return i >= 0 && (HERO_RANK[def.structures[i].b] ?? 0) >= 4
}

/**
 * 主体正面朝外的镜头方位（方位 0 = 镜头在南，向北看）。
 * rot 为俯视顺时针 90° 的次数：0 朝南、1 朝西、2 朝北、3 朝东。
 * 有城墙的是一座城：城本身是主体，宫城、正门朝南——不让坊市里某座朝北的楼阁把镜头带到城北（显式指定主体的除外）。
 */
export function heroFrontYaw(def: LandmarkDefinition): number {
  if (def.walls?.length && !def.hero) return 0
  const i = heroIndex(def)
  const rot = ((((i >= 0 ? def.structures[i].rot : 0) ?? 0) % 4) + 4) % 4
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][rot]
}
