import { B } from '../block/Blocks'
import { S, packState } from '../block/BlockState'
import { Axis, Direction } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import { type BuildingParams, post, stairs } from './BuildingFactory'

/*
 * 临水营造：码头与泊舟。正面朝南（+Z）、锚点在地面中心之上一格（y = 0 是地面上的第一格空气），
 * 与 BuildingFactory 同一套约定。放置时 atLevel；水面比地面低一格（y = −2 是水面那一格）。
 */

/**
 * 临湖石码头：沿楼前铺一条青石平台（与地面齐平），正中三阶踏道下到水里，两侧系船柱；
 * 平台外沿一道低石栏、踏道两旁和平台两端各有几块半没在水里的湿苔石。
 * width 为平台长（沿岸方向），depth 为平台进深。
 */
export function quay(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 19
  const d = p.depth ?? 4
  const b = new StructureBuilder('quay')
  const hw = Math.floor(w / 2)
  const z1 = d - 1
  // 平台：与地面齐平（y = −1），下面由放置器补石基到水底
  b.box(-hw, -1, 0, hw, -1, z1, (x, _y, z) => S((x + z) % 5 === 0 ? B.COBBLE : B.STONE_BRICK))
  // 外沿低石栏，踏道口与系船处断开
  for (let x = -hw; x <= hw; x++) if (Math.abs(x) > 2 && Math.abs(x) !== 6) b.set(x, 0, z1, S(B.STONE_BRICK_SLAB))
  // 踏道：从平台外沿下到水面以下两阶
  for (let k = 0; k < 3; k++) for (let x = -2; x <= 2; x++) b.set(x, -2 - k, z1 + 1 + k, stairs(B.STONE_BRICK_STAIRS, Direction.North))
  for (let x = -2; x <= 2; x++) b.set(x, -1, z1, S(B.STONE_BRICK))
  // 系船柱：平台外沿两处，柱顶挂一盏小灯
  for (const x of [-6, 6]) {
    b.set(x, 0, z1, post(B.DARK_POST))
    b.set(x, 1, z1, post(B.DARK_POST))
  }
  b.set(-6, 2, z1, S(B.LANTERN))
  // 湿石：半没水中的苔石，踏道两旁与平台两端
  for (const [x, z] of [[-3, z1 + 1], [3, z1 + 2], [-hw, z1 + 1], [-hw + 1, z1 + 2], [hw, z1 + 1], [hw - 2, z1 + 1]] as const) {
    b.set(x, -2, z, S(B.MOSS_STONE))
    b.set(x, -3, z, S(B.MOSS_STONE))
  }
  return b.build()
}

/**
 * 泊在岸边的小舟：船身长 7、宽 3，木板船底在水面一格（y = −2），船帮半砖，中段一顶乌篷，船头一根竹篙。
 * 船头朝南（+Z）。放置时 atLevel + overWater。
 */
export function skiff(p: BuildingParams = {}): VoxelStructure {
  const b = new StructureBuilder('skiff')
  const awning = (p.seed ?? 0) % 2 === 0 ? B.CLOTH_BLUE_SLAB : B.CLOTH_BUFF_SLAB
  for (let z = -3; z <= 3; z++) {
    const half = Math.abs(z) === 3 ? 0 : 1
    for (let x = -half; x <= half; x++) b.set(x, -2, z, S(B.DARK_PLANKS))
    if (half) {
      b.set(-1, -1, z, S(B.DARK_PLANKS_SLAB))
      b.set(1, -1, z, S(B.DARK_PLANKS_SLAB))
    } else b.set(0, -1, z, S(B.DARK_PLANKS_SLAB))
  }
  // 乌篷：中段三格，两侧篷沿落到船帮上
  for (let z = -1; z <= 1; z++) {
    b.set(-1, 0, z, S(awning))
    b.set(1, 0, z, S(awning))
    b.set(0, 1, z, S(awning))
  }
  // 竹篙斜靠船头
  b.set(0, -1, 3, post(B.BAMBOO, Axis.Y))
  b.set(0, 0, 3, post(B.BAMBOO, Axis.Y))
  b.set(0, 1, 2, packState({ id: B.LANTERN }))
  return b.build()
}
