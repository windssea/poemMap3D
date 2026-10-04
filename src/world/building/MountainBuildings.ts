import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { Axis } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import { type BuildingParams, post } from './BuildingFactory'

/*
 * 山岳营造：名松等不随机的定稿造型。约定同 BuildingFactory：正面朝南（+Z）、y = 0 是地面上第一格。
 */

/**
 * 迎客松：黄山玉屏楼前的那一棵。树干矮壮、略向西倾，一根长枝自干腰向东平伸、梢头微垂，像伸臂迎客；
 * 树冠是几层平展的云片（一格厚、扁椭圆），不是随机松的尖塔形。根系扎进岩缝（y 为负的几格），落在不平的岩面上也不悬空。
 */
export function sculptedPine(_p: BuildingParams = {}): VoxelStructure {
  const b = new StructureBuilder('sculpted-pine')
  const log = post(B.PINE_LOG)
  const logX = post(B.PINE_LOG, Axis.X)
  const leaf = S(B.LEAVES_PINE)
  // 根与干：根扎进岩缝三格，干身到 y = 3 竖直，往上向西偏一格
  for (let y = -3; y <= 3; y++) b.set(0, y, 0, log)
  b.set(1, -1, 0, logX).set(-1, -2, 0, logX).set(0, -1, 1, log)
  for (let y = 4; y <= 8; y++) b.set(-1, y, 0, log)
  b.set(0, 4, 0, log)
  // 迎客长枝：自干腰（y = 5）向东平伸九格，后三格垂一格
  for (let x = 0; x <= 5; x++) b.set(x, 5, 0, logX)
  for (let x = 6; x <= 9; x++) b.set(x, 4, 0, logX)
  b.set(5, 4, 0, logX)
  // 背枝：向西短伸
  for (let x = -2; x >= -4; x--) b.set(x, 7, 0, logX)
  // 云片：扁椭圆一格厚
  const pad = (cx: number, y: number, cz: number, rx: number, rz: number) => {
    for (let x = -rx; x <= rx; x++)
      for (let z = -rz; z <= rz; z++) {
        if ((x / (rx + 0.5)) ** 2 + (z / (rz + 0.5)) ** 2 > 1) continue
        if (!b.s.has(cx + x, y, cz + z)) b.set(cx + x, y, cz + z, leaf)
      }
  }
  pad(-1, 9, 0, 3, 2) // 顶冠
  pad(0, 10, 0, 2, 1)
  pad(-4, 8, 0, 2, 2) // 背枝冠
  pad(3, 6, 0, 2, 2) // 长枝中段
  pad(8, 5, 0, 3, 2) // 长枝梢：伸得最远的一片
  pad(9, 6, 0, 1, 1)
  return b.build()
}
