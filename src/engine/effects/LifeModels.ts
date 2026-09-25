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

/* ———— 行人：古装三类（士人、劳作者、女子）。身子按实例着色（顶点色是明暗），头与配饰为定色 ———— */

export type FigureKind = 'scholar' | 'labor' | 'woman'
export const FIGURE_KINDS: readonly FigureKind[] = ['scholar', 'labor', 'woman']

/** 身子：白色系顶点色（乘上实例衣色）：衣身、领、腰带、袖 */
export function figureBody(kind: FigureKind): THREE.BufferGeometry {
  const b = V()
  const W = '#ffffff'
  if (kind === 'scholar') {
    // 深衣长袍及踝、下摆微张；交领右衽（领口一道浅色）、腰带、广袖垂到膝
    b.box(-0.2, 0.14, -0.26, 0.2, 1.5, 0.26, W, 0.84)
    b.box(-0.24, 0.1, -0.31, 0.24, 0.48, 0.31, W, 0.8)
    b.box(0.2, 1.18, -0.13, 0.226, 1.5, -0.02, W, 1.08)
    b.box(0.2, 1.3, 0.0, 0.226, 1.5, 0.1, W, 1.08)
    b.box(-0.21, 0.94, -0.27, 0.21, 1.04, 0.27, W, 0.28)
    b.box(-0.15, 0.62, -0.46, 0.17, 1.44, -0.26, W, 0.9)
    b.box(-0.15, 0.62, 0.26, 0.17, 1.44, 0.46, W, 0.9)
  } else if (kind === 'woman') {
    // 襦（短上衣）+ 高腰长裙（下摆展开）+ 腰带；窄袖
    b.box(-0.17, 1.02, -0.23, 0.17, 1.5, 0.23, W, 1.0)
    b.box(0.17, 1.22, -0.1, 0.19, 1.5, 0.1, W, 1.1)
    b.box(-0.2, 0.1, -0.27, 0.2, 1.12, 0.27, W, 0.8)
    b.box(-0.26, 0.08, -0.33, 0.26, 0.42, 0.33, W, 0.76)
    b.box(-0.19, 1.08, -0.25, 0.19, 1.17, 0.25, W, 0.4)
    b.box(-0.1, 0.84, -0.36, 0.12, 1.46, -0.23, W, 0.95)
    b.box(-0.1, 0.84, 0.23, 0.12, 1.46, 0.36, W, 0.95)
  } else {
    // 短褐到膝、草绳束腰、窄袖挽到小臂
    b.box(-0.19, 0.72, -0.25, 0.19, 1.5, 0.25, W, 0.9)
    b.box(-0.2, 0.86, -0.26, 0.2, 0.93, 0.26, W, 0.45)
    b.box(-0.1, 1.0, -0.37, 0.1, 1.46, -0.25, W, 0.9)
    b.box(-0.1, 1.0, 0.25, 0.1, 1.46, 0.37, W, 0.9)
  }
  return b.build()
}

/** 头与定色配饰：面、眉眼、发；士人幞头（两翅平展）、女子高髻金簪簪花与披帛、劳作者斗笠；袖口露手 */
export function figureHead(kind: FigureKind): THREE.BufferGeometry {
  const b = V()
  b.box(-0.2, 1.5, -0.2, 0.2, 1.92, 0.2, T.skin)
  b.box(0.2, 1.72, -0.11, 0.206, 1.76, -0.05, T.hair)
  b.box(0.2, 1.72, 0.05, 0.206, 1.76, 0.11, T.hair)
  b.box(-0.21, 1.78, -0.21, 0.14, 1.94, 0.21, T.hair)
  b.box(-0.21, 1.5, -0.21, -0.14, 1.94, 0.21, T.hair)
  if (kind === 'scholar') {
    b.box(-0.22, 1.9, -0.22, 0.2, 2.02, 0.22, T.hair)
    b.box(-0.15, 2.02, -0.13, 0.07, 2.16, 0.13, T.hair)
    b.box(-0.24, 1.95, -0.62, -0.19, 1.99, 0.62, T.hair)
    // 广袖口露手
    b.box(0.08, 0.64, -0.42, 0.2, 0.74, -0.3, T.skin)
    b.box(0.08, 0.64, 0.3, 0.2, 0.74, 0.42, T.skin)
  } else if (kind === 'woman') {
    b.box(-0.14, 1.94, -0.12, 0.06, 2.24, 0.12, T.hair)
    b.box(-0.1, 2.12, -0.2, 0.02, 2.22, 0.2, T.hair)
    b.box(-0.03, 2.14, -0.26, 0.01, 2.18, 0.26, T.hairpin)
    b.box(0.02, 2.06, 0.1, 0.1, 2.14, 0.18, T.flower)
    // 披帛：搭肩、两端垂到小臂
    b.box(-0.07, 1.44, -0.3, 0.07, 1.54, 0.3, T.scarf)
    b.box(-0.05, 0.62, -0.4, 0.03, 1.44, -0.36, T.scarf)
    b.box(-0.05, 0.62, 0.36, 0.03, 1.44, 0.4, T.scarf)
    b.box(0.06, 0.84, -0.34, 0.16, 0.92, -0.25, T.skin)
    b.box(0.06, 0.84, 0.25, 0.16, 0.92, 0.34, T.skin)
  } else {
    // 斗笠：三层渐收的草编锥顶
    b.box(-0.5, 1.93, -0.5, 0.5, 1.99, 0.5, T.straw)
    b.box(-0.32, 1.99, -0.32, 0.32, 2.07, 0.32, T.straw, 0.95)
    b.box(-0.15, 2.07, -0.15, 0.15, 2.16, 0.15, T.straw, 0.9)
    b.box(-0.04, 2.16, -0.04, 0.04, 2.22, 0.04, T.straw, 0.85)
    b.box(0.02, 0.98, -0.37, 0.12, 1.06, -0.27, T.skin)
    b.box(0.02, 0.98, 0.27, 0.12, 1.06, 0.37, T.skin)
  }
  return b.build()
}

/** 一条腿（布裤 + 布鞋）：原点在髋部，绕横轴摆动；长袍、长裙下只露鞋尖 */
export function legGeometry(): THREE.BufferGeometry {
  return V().box(-0.1, -0.62, -0.1, 0.1, 0, 0.1, T.trousers).box(-0.11, -0.66, -0.11, 0.17, -0.56, 0.11, T.shoe).build()
}

/** 船上的人（渔翁、艄公）：坐或立，斗笠短褐，直接拼进船模型 */
function boatman(b: VoxelModelBuilder, x: number, y: number, z: number, jacket: string, seated: boolean): void {
  const top = y + (seated ? 0.95 : 1.5)
  b.box(x - 0.18, y + 0.1, z - 0.22, x + 0.18, top, z + 0.22, jacket)
  b.box(x - 0.18, top, z - 0.18, x + 0.18, top + 0.38, z + 0.18, T.skin)
  b.box(x - 0.45, top + 0.36, z - 0.45, x + 0.45, top + 0.42, z + 0.45, T.straw)
  b.box(x - 0.26, top + 0.42, z - 0.26, x + 0.26, top + 0.5, z + 0.26, T.straw, 0.93)
  b.box(x - 0.1, top + 0.5, z - 0.1, x + 0.1, top + 0.58, z + 0.1, T.straw, 0.88)
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
  b.box(-2.3, 0.7, 0.3, -2.18, 3.2, 0.42, T.straw) // 竹篙（船尾）
  boatman(b, 1.2, 0.7, 0, '#6a6a5a', true)
  // 钓竿与钓线
  for (let i = 0; i < 6; i++) b.box(1.4 + i * 0.42, 1.2 + i * 0.28, -0.04, 1.84 + i * 0.42, 1.28 + i * 0.28, 0.04, T.mast)
  b.box(3.9, 0.5, -0.01, 3.93, 2.9, 0.01, '#d8d2c4')
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
  // 船尾橹与艄公
  b.box(-6.2, 0.6, -0.08, -4.6, 0.75, 0.08, T.mast)
  boatman(b, -4.2, 0.9, 0, '#5a6a78', false)
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
