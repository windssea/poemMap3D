import { B } from '../block/Blocks'
import { S } from '../block/BlockState'
import { Axis, Direction } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import { type BuildingParams, post, stairs } from './BuildingFactory'

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

/**
 * 龙门石窟崖面：一段朝南（+Z）的石灰岩崖壁，嵌进山体（背后 z < 0 是实心岩）。
 * 正中奉先寺大龛：开口宽 15、高 17，龛内一尊结跏趺坐的卢舍那大像（莲座、身、肩、头、肉髻，背后一圈火焰形背光），
 * 左右各一尊立像（弟子、菩萨，简化为高身窄肩）；两翼崖面上三排大小不一的小龛，节奏错落；
 * 龛前一道石台阶自水边上到大龛。造型克制、对称，不做随机变形。
 * width：崖面总长（默认 41）；height：崖高（默认 22）。
 */
export function grottoFacade(p: BuildingParams = {}): VoxelStructure {
  const W = p.width ?? 41
  const H = p.height ?? 22
  const hw = Math.floor(W / 2)
  const b = new StructureBuilder('grotto-facade')
  const rock = S(B.LIMESTONE)
  const carve = S(B.MARBLE)
  // 崖体：厚 6（z = −5…0），顶面按 x 起伏，两头收低
  for (let x = -hw; x <= hw; x++) {
    const top = H - Math.round(4 * Math.pow(Math.abs(x) / hw, 2)) + ((x * 7) % 3 === 0 ? 1 : 0)
    for (let z = -5; z <= 0; z++) for (let y = -2; y < top; y++) b.set(x, y, z, rock)
  }
  // 大龛：方口圆顶，深 5（z = −4…0 挖空，z = −5 为龛壁）
  const nw = 7
  const nh = 16
  for (let x = -nw; x <= nw; x++)
    for (let y = 2; y <= nh; y++) {
      const arch = y > nh - nw ? Math.hypot(x, y - (nh - nw)) <= nw + 0.3 : true
      if (arch) for (let z = -4; z <= 0; z++) b.set(x, y, z, 0)
    }
  // 龛底台（y = 1）与龛前一级踏步（z = 1）
  for (let x = -nw; x <= nw; x++) for (let z = -4; z <= 0; z++) b.set(x, 1, z, S(B.STONE_BRICK))
  for (let x = -2; x <= 2; x++) b.set(x, 0, 1, stairs(B.STONE_BRICK_STAIRS, Direction.North))
  // 背光：龛壁上一圈浅浮雕（大理石色）
  for (let x = -6; x <= 6; x++)
    for (let y = 4; y <= nh; y++) {
      const d = Math.hypot(x, (y - 10) * 0.85)
      if (d > 5.3 && d < 6.4) b.set(x, y, -5, carve)
    }
  // 卢舍那大像：莲座 → 盘腿 → 身 → 肩 → 颈 → 头 → 肉髻
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) b.set(x, y, z, carve)
  }
  box(-4, 2, -4, 4, 2, -1) // 莲座
  box(-5, 3, -4, 5, 4, -1) // 盘腿
  box(-3, 5, -4, 3, 9, -2) // 身
  box(-4, 9, -4, 4, 9, -2) // 肩
  box(-1, 10, -4, 1, 10, -3) // 颈
  box(-2, 11, -4, 2, 13, -2) // 头
  box(-1, 14, -4, 1, 14, -3) // 肉髻
  box(-4, 5, -2, -4, 7, -2) // 双手垂在膝上
  box(4, 5, -2, 4, 7, -2)
  // 两侧立像：弟子、菩萨，各一对
  for (const sx of [-1, 1]) {
    box(sx * 6, 2, -4, sx * 6, 9, -3)
    b.set(sx * 6, 10, -3, carve).set(sx * 6, 10, -4, carve)
  }
  // 两翼小龛：三排，大小错落
  const niche = (cx: number, y0: number, w: number, h: number) => {
    for (let x = cx - w; x <= cx + w; x++) for (let y = y0; y < y0 + h; y++) b.set(x, y, 0, 0).set(x, y, -1, 0)
    for (let y = y0; y < y0 + Math.max(1, h - 1); y++) b.set(cx, y, -1, carve) // 龛中一尊小像
  }
  for (const side of [-1, 1])
    for (let i = 0; i < 4; i++) {
      const cx = side * (10 + i * 3)
      if (Math.abs(cx) > hw - 2) continue
      niche(cx, 3 + (i % 2), i === 0 ? 1 : 0, 3)
      niche(cx + side, 9 + ((i + 1) % 2), 0, 2)
      if (Math.abs(cx) < hw - 5) niche(cx, 14, 0, 2)
    }
  return b.build()
}
