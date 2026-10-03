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
 * 临湖石码头（水埠头）：楼前一整块青石平台，与地面齐平（地面只比水面高出一线），城台踏道整段落在平台上；
 * 平台外沿通长一级踏步正落在水线上——只有一层台面、一级下水，不做栏杆、不撒零碎石块。
 * 外沿两端立系船柱，北柱挑一盏灯。width 为平台长（沿岸方向），depth 为平台进深（含踏道落脚处）。
 */
export function quay(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 15
  const d = p.depth ?? 6
  const b = new StructureBuilder('quay')
  const hw = Math.floor(w / 2)
  const z1 = d - 1
  // 平台：与地面齐平（y = −1），下面由放置器补石基到水底
  b.box(-hw, -1, 0, hw, -1, z1, S(B.STONE_BRICK))
  // 外沿通长一级踏步，落在水线上
  for (let x = -hw; x <= hw; x++) {
    b.set(x, -2, z1 + 1, stairs(B.STONE_BRICK_STAIRS, Direction.North))
    b.set(x, -3, z1 + 1, S(B.STONE_BRICK))
  }
  // 系船柱：外沿两端，北柱挑灯
  for (const x of [-hw, hw]) {
    b.set(x, 0, z1, post(B.DARK_POST))
    b.set(x, 1, z1, post(B.DARK_POST))
  }
  b.set(-hw, 2, z1, S(B.LANTERN))
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
    for (let x = -1; x <= 1; x++) b.set(x, 1, z, S(awning))
  }
  // 船头立一根竹篙，篙顶挑一盏船灯
  b.set(0, -1, 3, post(B.BAMBOO, Axis.Y))
  b.set(0, 0, 3, post(B.BAMBOO, Axis.Y))
  b.set(0, 1, 3, packState({ id: B.LANTERN }))
  return b.build()
}
