import type { BuildingId } from '../building/BuildingRegistry'
import type { LandmarkDefinition, StructureSpec } from './LandmarkDefinition'

/** 选主楼：名楼 > 楼阁 > 塔 > 殿 > 亭，同级取先列出的 */
const HERO_RANK: Partial<Record<BuildingId, number>> = { grandTower: 6, loft: 5, pagoda: 4, brickPagoda: 4, tower: 4, bellTower: 3, hall: 2, gardenHall: 2, pavilion: 1 }

/** 主楼在 def.structures 里的下标；没有建筑为 -1 */
export function heroIndex(def: LandmarkDefinition): number {
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

/** 主楼是否够分量撑起一处的视觉主体（塔、楼阁、名楼） */
export function heroIsLandmark(def: LandmarkDefinition): boolean {
  const i = heroIndex(def)
  return i >= 0 && (HERO_RANK[def.structures[i].b] ?? 0) >= 4
}

/**
 * 主楼正面朝外的镜头方位（方位 0 = 镜头在南，向北看）。
 * rot 为俯视顺时针 90° 的次数：0 朝南、1 朝西、2 朝北、3 朝东。
 * 有城墙的是一座城：城本身是主体，宫城、正门朝南——不让坊市里某座朝北的楼阁把镜头带到城北。
 */
export function heroFrontYaw(def: LandmarkDefinition): number {
  if (def.walls?.length) return 0
  const i = heroIndex(def)
  const rot = ((((i >= 0 ? def.structures[i].rot : 0) ?? 0) % 4) + 4) % 4
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][rot]
}
