import { B } from '../block/Blocks'
import { type PackedState, S, packState } from '../block/BlockState'
import { Direction } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'

export type RoofType = 'xieshan' | 'xuanshan' | 'wudian' | 'cuanjian' | 'taiyan' | 'fuyan'
export type TileMaterial = 'gray' | 'yellow' | 'green' | 'thatch'

export interface RoofSpec {
  /** 屋檐外沿（含出挑）的宽（X）与深（Z），以原点为中心 */
  width: number
  depth: number
  type: RoofType
  /** 朝向：0 正面朝南（默认），1 朝西……（俯视顺时针） */
  orientation?: number
  /** 楼阁复檐的层数 */
  floorCount?: number
  tile: TileMaterial
  /** 屋脊方块（默认同瓦的整块） */
  ridge?: PackedState
  /** 屋檐出挑（歇山下段的檐宽，层数） */
  eaveDepth?: number
  /** 起翘：檐角抬高一格 */
  upturn?: boolean
}

const TILES: Record<TileMaterial, { stairs: number; slab: number; full: number }> = {
  gray: { stairs: B.ROOF_GRAY_STAIRS, slab: B.ROOF_GRAY_SLAB, full: B.ROOF_GRAY },
  yellow: { stairs: B.ROOF_YELLOW_STAIRS, slab: B.ROOF_YELLOW_SLAB, full: B.ROOF_YELLOW },
  green: { stairs: B.ROOF_GREEN_STAIRS, slab: B.ROOF_GREEN_SLAB, full: B.ROOF_GREEN },
  thatch: { stairs: B.THATCH_STAIRS, slab: B.THATCH_SLAB, full: B.THATCH },
}

/**
 * 中国古建屋顶：一律用楼梯（瓦坡）、半砖（脊、檐）与整块拼成。
 * 输出以屋檐最低一层为 y = 0 的体素结构，建筑工厂再把它放到柱头上。
 *
 * - 悬山：前后两坡，山面出挑；
 * - 歇山：下段四坡，上段两坡（山花），檐角起翘；
 * - 庑殿：四坡收成一条正脊；
 * - 攒尖：四坡收成一点，顶置宝顶；
 * - 塔檐：一圈腰檐；
 * - 楼阁复檐：多重腰檐 + 顶部歇山。
 */
export function buildRoof(spec: RoofSpec): VoxelStructure {
  const t = TILES[spec.tile]
  const b = new StructureBuilder(`roof-${spec.type}`)
  const hw = Math.floor(spec.width / 2)
  const hd = Math.floor(spec.depth / 2)
  const x0 = -hw
  const x1 = spec.width % 2 ? hw : hw - 1
  const z0 = -hd
  const z1 = spec.depth % 2 ? hd : hd - 1
  const stair = (f: Direction, top = false) => packState({ id: t.stairs, facing: f, half: top ? 'top' : 'bottom' })
  const ridge = spec.ridge ?? S(t.full)
  /** 屋面之下的椽望（藏在屋顶里，只为让各层瓦面面相连） */
  const inner = S(B.DARK_PLANKS)

  /** 一圈四坡：矩形边上的瓦，朝内 */
  const ring = (ax: number, az: number, bx: number, bz: number, y: number) => {
    for (let x = ax; x <= bx; x++) {
      b.set(x, y, bz, stair(Direction.North))
      b.set(x, y, az, stair(Direction.South))
    }
    for (let z = az + 1; z < bz; z++) {
      b.set(bx, y, z, stair(Direction.West))
      b.set(ax, y, z, stair(Direction.East))
    }
    for (let x = ax + 1; x < bx; x++) for (let z = az + 1; z < bz; z++) b.setIfEmpty(x, y, z, inner)
  }
  /** 两坡：只有前后两排，沿 X 通长 */
  const gable = (ax: number, bx: number, az: number, bz: number, y: number, fillGable: PackedState | null) => {
    for (let x = ax; x <= bx; x++) {
      b.set(x, y, bz, stair(Direction.North))
      b.set(x, y, az, stair(Direction.South))
    }
    for (let x = ax; x <= bx; x++) for (let z = az + 1; z < bz; z++) b.setIfEmpty(x, y, z, fillGable && (x === ax || x === bx) ? fillGable : inner)
  }
  /** 正脊：一条整块 + 两端鸱吻 */
  const ridgeLine = (ax: number, bx: number, z: number, y: number) => {
    for (let x = ax; x <= bx; x++) b.set(x, y, z, ridge)
    if (bx - ax >= 2) {
      b.set(ax, y + 1, z, packState({ id: B.RIDGE_END, facing: Direction.West }))
      b.set(bx, y + 1, z, packState({ id: B.RIDGE_END, facing: Direction.East }))
    }
  }
  const upturn = (ax: number, az: number, bx: number, bz: number, y: number) => {
    if (spec.upturn === false) return
    for (const [x, z, f] of [
      [ax, az, Direction.South],
      [bx, az, Direction.South],
      [ax, bz, Direction.North],
      [bx, bz, Direction.North],
    ] as const) {
      b.set(x, y, z, S(t.slab))
      b.set(x, y + 1, z, stair(f))
    }
  }

  switch (spec.type) {
    case 'xuanshan': {
      let k = 0
      for (; z0 + k < z1 - k; k++) gable(x0, x1, z0 + k, z1 - k, k, null)
      const y = k
      if (z0 + k === z1 - k) ridgeLine(x0, x1, z0 + k, y - 1 + 1)
      else ridgeLine(x0, x1, z1 - k + 1, y)
      break
    }
    case 'wudian':
    case 'xieshan': {
      const hip = spec.type === 'wudian' ? 99 : Math.max(1, Math.min(spec.eaveDepth ?? 2, hd - 1))
      let ax = x0
      let bx = x1
      let az = z0
      let bz = z1
      let y = 0
      while (az < bz) {
        if (y < hip && bx - ax > 2) {
          ring(ax, az, bx, bz, y)
          ax++
          bx--
        } else gable(ax, bx, az, bz, y, spec.type === 'xieshan' ? S(B.PLASTER) : null)
        az++
        bz--
        y++
      }
      if (az === bz) ridgeLine(ax, bx, az, y)
      else ridgeLine(ax, bx, bz + 1, y)
      upturn(x0, z0, x1, z1, 0)
      break
    }
    case 'cuanjian': {
      let ax = x0
      let bx = x1
      let az = z0
      let bz = z1
      let y = 0
      while (ax < bx && az < bz) {
        ring(ax, az, bx, bz, y)
        ax++
        bx--
        az++
        bz--
        y++
      }
      for (let x = ax; x <= bx; x++) for (let z = az; z <= bz; z++) b.set(x, y, z, S(t.full))
      b.set(Math.round((ax + bx) / 2), y + 1, Math.round((az + bz) / 2), S(B.FINIAL))
      upturn(x0, z0, x1, z1, 0)
      break
    }
    case 'taiyan': {
      ring(x0, z0, x1, z1, 0)
      for (let x = x0 + 1; x <= x1 - 1; x++) for (let z = z0 + 1; z <= z1 - 1; z++) b.setIfEmpty(x, 0, z, S(t.slab))
      upturn(x0, z0, x1, z1, 0)
      break
    }
    case 'fuyan': {
      const floors = Math.max(2, spec.floorCount ?? 2)
      for (let f = 0; f < floors - 1; f++) {
        const s = f
        ring(x0 + s, z0 + s, x1 - s, z1 - s, f * 4)
        upturn(x0 + s, z0 + s, x1 - s, z1 - s, f * 4)
      }
      const top = buildRoof({ ...spec, type: 'xieshan', width: spec.width - (floors - 1) * 2, depth: spec.depth - (floors - 1) * 2 })
      b.s.merge(top, 0, (floors - 1) * 4, 0)
      break
    }
  }
  let s = b.build()
  if (spec.orientation) s = s.rotate(spec.orientation)
  return s
}
