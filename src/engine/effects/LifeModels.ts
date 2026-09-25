import * as THREE from 'three'
import { LifeTokens as T } from '../../config/palette'

/**
 * 体素小模型：若干长方体合成一个网格，顶点色着色（与方块世界同一种“方块拼成”的语言）。
 * 坐标单位为方块；原点在模型脚下中心，+x 为船头 / 人的正前方。
 */
export class VoxelModelBuilder {
  private readonly pos: number[] = []
  private readonly nor: number[] = []
  private readonly col: number[] = []
  private readonly idx: number[] = []
  private readonly c = new THREE.Color()

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string, shade = 1): this {
    this.c.set(color).multiplyScalar(shade)
    const { r, g, b } = this.c
    const faces: [number[], number[][]][] = [
      [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
      [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
      [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
      [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
      [[0, 0, 1], [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]]],
      [[0, 0, -1], [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]],
    ]
    for (const [n, vs] of faces) {
      const base = this.pos.length / 3
      for (const v of vs) {
        this.pos.push(v[0], v[1], v[2])
        this.nor.push(n[0], n[1], n[2])
        this.col.push(r, g, b)
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
    return this
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3))
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    return g
  }
}

const V = () => new VoxelModelBuilder()

/* ———— 行人：袍身（按实例着色）、头（肤色 + 发髻 / 斗笠）、腿（单条，左右各一实例，摆动） ———— */

/** 袍身：白色，实例色即衣色；含两臂 */
export function robeGeometry(): THREE.BufferGeometry {
  return V()
    .box(-0.2, 0.62, -0.3, 0.2, 1.52, 0.3, '#ffffff')
    .box(-0.24, 0.62, -0.34, 0.24, 0.9, 0.34, '#ffffff', 0.9) // 下摆
    .box(-0.12, 0.9, -0.44, 0.12, 1.48, -0.3, '#ffffff', 0.92)
    .box(-0.12, 0.9, 0.3, 0.12, 1.48, 0.44, '#ffffff', 0.92)
    .build()
}

/** 头：肤色 + 黑发髻；hat 为斗笠（渔夫、摊贩） */
export function headGeometry(hat: 'bun' | 'straw' | 'cap'): THREE.BufferGeometry {
  const b = V().box(-0.22, 1.52, -0.22, 0.22, 1.96, 0.22, T.skin).box(-0.23, 1.8, -0.23, 0.2, 1.98, 0.23, T.hair)
  if (hat === 'bun') b.box(-0.12, 1.98, -0.1, 0.06, 2.14, 0.1, T.hair)
  if (hat === 'cap') b.box(-0.25, 1.9, -0.25, 0.25, 2.06, 0.25, T.hat)
  if (hat === 'straw') b.box(-0.45, 1.94, -0.45, 0.45, 2.02, 0.45, T.straw).box(-0.2, 2.02, -0.2, 0.2, 2.16, 0.2, T.straw)
  return b.build()
}

/** 一条腿：原点在髋部，便于绕 z 轴摆动 */
export function legGeometry(): THREE.BufferGeometry {
  return V().box(-0.11, -0.62, -0.11, 0.11, 0, 0.11, T.trousers).box(-0.12, -0.66, -0.12, 0.16, -0.54, 0.12, T.hullDark).build()
}

/* ———— 船 ———— */

/** 渔舟：五格长的小舢板，船尾一截乌篷，船头竖一根竹篙 */
export function fishingBoatGeometry(): THREE.BufferGeometry {
  const b = V()
  b.box(-2.2, 0, -0.6, 2.2, 0.35, 0.6, T.hullDark)
  b.box(-2.5, 0.3, -0.8, 2.3, 0.7, 0.8, T.hull)
  b.box(2.3, 0.5, -0.5, 2.8, 0.85, 0.5, T.hull) // 翘起的船头
  b.box(-2.3, 0.62, -0.62, 2.2, 0.7, 0.62, T.deck)
  // 乌篷：拱形由三层渐窄的块叠成
  b.box(-1.9, 0.7, -0.75, -0.3, 1.3, 0.75, T.awning)
  b.box(-1.9, 1.3, -0.55, -0.3, 1.5, 0.55, T.awning, 0.9)
  b.box(-1.9, 1.5, -0.3, -0.3, 1.6, 0.3, T.awning, 0.8)
  b.box(1.6, 0.7, 0.3, 1.72, 3.2, 0.42, T.straw) // 竹篙
  return b.build()
}

/** 客船：九格长，中舱乌篷 + 竹帆，船尾有橹 */
export function passengerBoatGeometry(): THREE.BufferGeometry {
  const b = V()
  b.box(-4, 0, -1, 4, 0.4, 1, T.hullDark)
  b.box(-4.5, 0.35, -1.35, 4.3, 0.9, 1.35, T.hull)
  b.box(4.2, 0.6, -0.9, 5, 1.1, 0.9, T.hull)
  b.box(-4.8, 0.7, -1, -4.3, 1.4, 1, T.hull)
  b.box(-4.3, 0.82, -1.2, 4.2, 0.9, 1.2, T.deck)
  // 船舱：红漆柱、木格窗，乌篷顶
  b.box(-2.6, 0.9, -1.15, 1.6, 2.2, 1.15, T.deck, 0.85)
  for (const x of [-2.6, -1.2, 0.2, 1.5]) b.box(x, 0.9, -1.2, x + 0.12, 2.2, 1.2, T.lacquer)
  b.box(-2.9, 2.2, -1.35, 1.9, 2.5, 1.35, T.awning)
  b.box(-2.9, 2.5, -1.0, 1.9, 2.75, 1.0, T.awning, 0.9)
  b.box(-2.9, 2.75, -0.5, 1.9, 2.85, 0.5, T.awning, 0.8)
  // 桅与竹帆（帆面顺船身，横向竹骨）
  b.box(2.5, 0.9, -0.1, 2.7, 7.2, 0.1, T.mast)
  b.box(1.1, 2.6, -0.05, 3.9, 6.8, 0.05, T.sailTan)
  for (let y = 3.2; y < 6.8; y += 0.9) b.box(1.05, y, -0.09, 3.95, y + 0.14, 0.09, T.batten)
  // 船尾橹
  b.box(-6.2, 0.6, -0.08, -4.6, 0.75, 0.08, T.mast)
  return b.build()
}

/**
 * 海船：仿明代福船 / 宝船——高艉楼、翘首尖底，三桅红褐硬帆（横竹骨），艉板彩绘，桅顶红旗。
 * 约十九格长，远看也认得出是一条大船。
 */
export function mingShipGeometry(): THREE.BufferGeometry {
  const b = V()
  // 船底由窄到宽三层，首尾上翘
  b.box(-7, 0, -1, 7, 0.6, 1, T.hullDark)
  b.box(-8, 0.6, -2, 8, 1.4, 2, T.hullDark, 1.1)
  b.box(-8.6, 1.4, -2.6, 8.6, 2.6, 2.6, T.hull)
  b.box(-8.6, 2.2, -2.7, 8.6, 2.5, 2.7, T.lacquer) // 舷边朱漆一道
  b.box(8.6, 1.8, -1.9, 10, 3.2, 1.9, T.hull) // 船首
  b.box(10, 2.6, -1.2, 10.8, 3.6, 1.2, T.hull, 0.9)
  b.box(9.2, 2.2, -2.0, 9.6, 2.9, 2.0, '#f2eee6') // 船眼（白底）
  b.box(9.25, 2.35, -2.05, 9.55, 2.75, 2.05, T.hullDark)
  b.box(-8.4, 2.6, -2.4, 8.4, 2.7, 2.4, T.deck)
  // 艉楼：两层，朱漆栏、青瓦顶，艉板彩绘金纹
  b.box(-8.8, 2.6, -2.6, -4.6, 5.2, 2.6, T.hull, 1.05)
  b.box(-8.8, 3.6, -2.7, -4.6, 3.8, 2.7, T.lacquer)
  b.box(-8.5, 5.2, -2.3, -5.2, 6.8, 2.3, T.lacquer, 0.9)
  b.box(-8.9, 6.8, -2.6, -4.8, 7.2, 2.6, '#3c4448')
  b.box(-9.1, 2.8, -2.2, -8.8, 6.4, 2.2, T.lacquer, 1.1)
  b.box(-9.2, 3.6, -1.1, -9.0, 5.4, 1.1, T.gold)
  // 首楼矮台
  b.box(6.2, 2.7, -2.2, 8.6, 3.6, 2.2, T.hull, 1.05)
  b.box(6.2, 3.6, -2.3, 8.6, 3.75, 2.3, T.lacquer)
  // 舵
  b.box(-10, 0.4, -0.2, -9.1, 3, 0.2, T.hullDark)
  // 三桅：主桅居中偏后最高，前桅次之，后桅最矮；硬帆顺船身，横竹骨
  const mast = (x: number, h: number, w: number, sail: string) => {
    b.box(x - 0.18, 2.7, -0.18, x + 0.18, 2.7 + h, 0.18, T.mast)
    const y0 = 2.7 + h * 0.3
    const y1 = 2.7 + h * 0.95
    b.box(x - w * 0.62, y0, -0.06, x + w * 0.38, y1, 0.06, sail)
    for (let y = y0 + 0.9; y < y1; y += 1.1) b.box(x - w * 0.64, y, -0.12, x + w * 0.4, y + 0.16, 0.12, T.batten)
    b.box(x - 0.05, 2.7 + h, -0.05, x + 1.4, 2.7 + h + 0.7, 0.05, T.flag)
  }
  mast(-0.8, 14, 7.5, T.sailRust)
  mast(4.6, 11, 5.6, T.sailRust)
  mast(-6.6, 7.5, 3.6, T.sailTan)
  return b.build()
}

/** 飞鸟：身子 + 两翼（翼单独成件，扑扇时绕身轴转） */
export function birdBodyGeometry(): THREE.BufferGeometry {
  return V().box(-0.35, -0.1, -0.1, 0.35, 0.1, 0.1, T.bird).box(0.35, -0.02, -0.06, 0.5, 0.08, 0.06, T.bird).build()
}
export function birdWingGeometry(): THREE.BufferGeometry {
  // 原点在翼根
  return V().box(-0.18, -0.03, 0, 0.18, 0.03, 0.9, T.bird).build()
}

/** 炊烟一团：白色小方块，实例缩放与透明度随上升变化 */
export function smokeGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1)
}
