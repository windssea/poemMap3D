import { Random } from '../../utils/math'
import { B } from '../block/Blocks'
import { type PackedState, S, packState } from '../block/BlockState'
import { Axis, Direction } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import { buildRoof, type TileMaterial } from './ChineseRoofBuilder'

/*
 * 建筑一律以正面朝南（+Z）、锚点在地面中心（y = 0 为地面上第一层）搭建，
 * 放置时再整体旋转。所有尺寸单位都是方块，与地形、树木同一网格。
 */

export interface BuildingParams {
  width?: number
  depth?: number
  height?: number
  levels?: number
  tile?: TileMaterial
  double?: boolean
  lanterns?: boolean
  terrace?: number
  length?: number
  seed?: number
  /** 名楼：平面（方 / 十字抱厦）、顶式、台基（石台 / 城台） */
  plan?: 'square' | 'cross'
  top?: 'xieshan' | 'cross' | 'cuanjian' | 'wudian'
  base?: 'stone' | 'wall'
}

const stairs = (id: number, f: Direction, top = false): PackedState => packState({ id, facing: f, half: top ? 'top' : 'bottom' })
const post = (id: number, axis: number = Axis.Y): PackedState => packState({ id, axis: axis as 0 | 1 | 2 })
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const bounds = (w: number, d: number) => {
  const hw = Math.floor(w / 2)
  const hd = Math.floor(d / 2)
  return { x0: -hw, x1: w % 2 ? hw : hw - 1, z0: -hd, z1: d % 2 ? hd : hd - 1 }
}

/** 屋顶下山墙补齐：墙面所在列从墙顶补到屋面下 */
function fillGables(b: StructureBuilder, xs: number[], z0: number, z1: number, fromY: number, fill: PackedState): void {
  for (const x of xs)
    for (let z = z0; z <= z1; z++) {
      let top = fromY
      while (top < fromY + 40 && !b.s.has(x, top, z)) top++
      if (top >= fromY + 40) continue
      for (let y = fromY; y < top; y++) b.s.setIfEmpty(x, y, z, fill)
    }
}

/** 台基 + 正面台阶 */
function platform(b: StructureBuilder, x0: number, x1: number, z0: number, z1: number, h: number, mat: number, stairId: number, both = false): void {
  b.box(x0, 0, z0, x1, h - 1, z1, S(mat))
  const steps = (z: number, f: Direction, dz: number) => {
    for (let k = 0; k < h; k++) for (let x = -1; x <= 1; x++) b.set(x, h - 1 - k, z + dz * (k + 1), stairs(stairId, f))
    for (let k = 1; k < h; k++) for (let x = -1; x <= 1; x++) for (let y = 0; y < h - 1 - k; y++) b.set(x, y, z + dz * (k + 1), S(mat))
  }
  steps(z1, Direction.North, 1)
  if (both) steps(z0, Direction.South, -1)
}

/** 檐下挑枋：倒置的木楼梯托住前后出檐 */
function eaveBrackets(b: StructureBuilder, x0: number, x1: number, z0: number, z1: number, y: number): void {
  for (const x of range(x0, x1)) {
    b.set(x, y, z1 + 1, stairs(B.DARK_PLANKS_STAIRS, Direction.North, true))
    b.set(x, y, z0 - 1, stairs(B.DARK_PLANKS_STAIRS, Direction.South, true))
  }
}

/** 斗拱：在额枋高度向外挑出 depth 圈倒置木楼梯，承托出檐 */
function dougong(b: StructureBuilder, x0: number, x1: number, z0: number, z1: number, y: number, depth = 2): void {
  for (let d = 1; d <= depth; d++) {
    for (let x = x0 - d; x <= x1 + d; x++) {
      b.setIfEmpty(x, y, z1 + d, stairs(B.DARK_PLANKS_STAIRS, Direction.North, true))
      b.setIfEmpty(x, y, z0 - d, stairs(B.DARK_PLANKS_STAIRS, Direction.South, true))
    }
    for (let z = z0 - d + 1; z <= z1 + d - 1; z++) {
      b.setIfEmpty(x1 + d, y, z, stairs(B.DARK_PLANKS_STAIRS, Direction.West, true))
      b.setIfEmpty(x0 - d, y, z, stairs(B.DARK_PLANKS_STAIRS, Direction.East, true))
    }
  }
}

/* ================= 民居 ================= */
export function house(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 1)
  const w = p.width ?? 7
  const d = p.depth ?? 5
  const h = p.height ?? 4
  const b = new StructureBuilder('house')
  const { x0, x1, z0, z1 } = bounds(w, d)
  b.box(x0, 0, z0, x1, 0, z1, S(B.COBBLE))
  b.walls(x0, 1, z0, x1, h, z1, S(B.PLASTER))
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ])
    for (let y = 1; y <= h; y++) b.set(x, y, z, post(B.DARK_PLANKS))
  for (const x of range(x0, x1)) {
    b.set(x, h, z0, post(B.DARK_PLANKS, Axis.X))
    b.set(x, h, z1, post(B.DARK_PLANKS, Axis.X))
  }
  b.box(x0 + 1, 0, z0 + 1, x1 - 1, 0, z1 - 1, S(B.PLANKS))
  eaveBrackets(b, x0, x1, z0, z1, h)
  // 门与窗
  b.set(0, 1, z1, 0).set(0, 2, z1, 0).set(0, 3, z1, S(B.DARK_PLANKS))
  b.set(-1, 1, z1, post(B.DARK_POST)).set(1, 1, z1, post(B.DARK_POST)).set(-1, 2, z1, post(B.DARK_POST)).set(1, 2, z1, post(B.DARK_POST))
  for (const x of [x0 + 1, x1 - 1]) if (Math.abs(x) >= 2) b.set(x, 2, z1, packState({ id: B.LATTICE_WINDOW, facing: Direction.South }))
  if (d >= 5) for (const x of [x0, x1]) b.set(x, 2, 0, packState({ id: B.LATTICE_WINDOW, facing: Direction.East }))
  const roof = buildRoof({ width: w + 2, depth: d + 2, type: 'xuanshan', tile: p.tile ?? (r.chance(0.15) ? 'thatch' : 'gray') })
  b.s.merge(roof, 0, h + 1, 0)
  fillGables(b, [x0, x1], z0 + 1, z1 - 1, h + 1, S(B.PLASTER))
  // 门前灯笼：约半数人家挂灯，夜里有人间烟火
  if (p.lanterns ?? r.chance(0.5)) {
    b.set(-2, 3, z1 + 1, S(B.LANTERN))
    b.set(2, 3, z1 + 1, S(B.LANTERN))
  }
  return b.build()
}

/** 街灯：木柱挑出一盏灯笼 */
export function lamp(): VoxelStructure {
  const b = new StructureBuilder('lamp')
  b.set(0, 0, 0, S(B.STONE_BRICK_SLAB))
  for (let y = 1; y <= 4; y++) b.set(0, y, 0, post(B.DARK_POST))
  b.set(0, 5, 0, post(B.DARK_PLANKS, Axis.X)).set(1, 5, 0, post(B.DARK_PLANKS, Axis.X))
  b.set(1, 4, 0, S(B.LANTERN))
  return b.build()
}

/* ================= 茅舍 ================= */
export function hut(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 5
  const d = p.depth ?? 5
  const b = new StructureBuilder('hut')
  const { x0, x1, z0, z1 } = bounds(w, d)
  b.box(x0, 0, z0, x1, 0, z1, S(B.PATH))
  b.walls(x0, 1, z0, x1, 3, z1, S(B.PLANKS))
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1],
  ])
    for (let y = 1; y <= 3; y++) b.set(x, y, z, post(B.LOG))
  b.set(0, 1, z1, 0).set(0, 2, z1, 0)
  b.set(x1, 2, 0, packState({ id: B.LATTICE_WINDOW, facing: Direction.East }))
  eaveBrackets(b, x0, x1, z0, z1, 3)
  b.s.merge(buildRoof({ width: w + 2, depth: d + 2, type: 'xuanshan', tile: 'thatch', upturn: false }), 0, 4, 0)
  fillGables(b, [x0, x1], z0 + 1, z1 - 1, 4, S(B.PLANKS))
  b.set(x1 + 1, 1, z1, packState({ id: B.WOOD_FENCE })).set(x1 + 2, 1, z1, packState({ id: B.WOOD_FENCE }))
  return b.build()
}

/* ================= 殿 ================= */
export function hall(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 13
  const d = p.depth ?? 9
  const h = p.height ?? 5
  const t = p.terrace ?? 2
  const b = new StructureBuilder('hall')
  const { x0, x1, z0, z1 } = bounds(w, d)
  platform(b, x0 - 2, x1 + 2, z0 - 2, z1 + 2, t, B.MARBLE, B.MARBLE_STAIRS)
  for (const x of range(x0 - 2, x1 + 2)) if (Math.abs(x) > 1) b.set(x, t, z1 + 2, S(B.MARBLE_FENCE))
  const y0 = t
  /* 檐柱一圈，前廊退进一格 */
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1
      if (!edge) continue
      const colX = (x - x0) % 2 === 0
      const colZ = (z - z0) % 2 === 0
      if ((z === z0 || z === z1) && colX) for (let y = y0; y < y0 + h; y++) b.set(x, y, z, post(B.PILLAR))
      else if ((x === x0 || x === x1) && colZ) for (let y = y0; y < y0 + h; y++) b.set(x, y, z, post(B.PILLAR))
    }
  /* 墙：前檐退一格，隔扇窗 */
  b.walls(x0 + 1, y0, z0, x1 - 1, y0 + h - 1, z1 - 1, (x, y, z) => {
    if (z === z1 - 1 && y > y0 && y < y0 + h - 1 && Math.abs(x) > 0) return packState({ id: B.LATTICE_WINDOW, facing: Direction.South })
    if ((x === x0 + 1 || x === x1 - 1) && y === y0 + 2 && z > z0 + 1 && z < z1 - 2) return packState({ id: B.LATTICE_WINDOW, facing: Direction.East })
    return S(B.LACQUER)
  })
  for (let y = y0; y < y0 + h - 1; y++) b.set(0, y, z1 - 1, 0)
  b.box(x0 + 1, y0 - 1, z0 + 1, x1 - 1, y0 - 1, z1 - 2, S(B.PAVING))
  /* 额枋与斗拱 */
  for (const x of range(x0, x1)) {
    b.set(x, y0 + h, z0, post(B.DARK_PLANKS, Axis.X))
    b.set(x, y0 + h, z1, post(B.DARK_PLANKS, Axis.X))
    b.set(x, y0 + h - 1, z1 + 1, stairs(B.DARK_PLANKS_STAIRS, Direction.North, true))
    b.set(x, y0 + h - 1, z0 - 1, stairs(B.DARK_PLANKS_STAIRS, Direction.South, true))
  }
  for (const z of range(z0, z1)) {
    b.set(x0, y0 + h, z, post(B.DARK_PLANKS, Axis.Z))
    b.set(x1, y0 + h, z, post(B.DARK_PLANKS, Axis.Z))
  }
  b.box(x0 + 1, y0 + h, z0 + 1, x1 - 1, y0 + h, z1 - 1, S(B.DARK_PLANKS))
  dougong(b, x0, x1, z0, z1, y0 + h, 2)
  const tile = p.tile ?? 'gray'
  if (p.double) {
    b.s.merge(buildRoof({ width: w + 4, depth: d + 4, type: 'taiyan', tile }), 0, y0 + h + 1, 0)
    b.box(x0 + 1, y0 + h + 1, z0 + 1, x1 - 1, y0 + h + 2, z1 - 1, S(B.LACQUER))
    dougong(b, x0 + 1, x1 - 1, z0 + 1, z1 - 1, y0 + h + 2, 2)
    b.s.merge(buildRoof({ width: w + 1, depth: d + 1, type: 'xieshan', tile, eaveDepth: 2 }), 0, y0 + h + 3, 0)
  } else b.s.merge(buildRoof({ width: w + 4, depth: d + 4, type: 'xieshan', tile, eaveDepth: 2 }), 0, y0 + h + 1, 0)
  if (p.lanterns) for (const x of [x0, x1]) b.set(x + (x < 0 ? 1 : -1), y0 + h - 1, z1 + 1, S(B.LANTERN))
  return b.build()
}

/* ================= 亭 ================= */
export function pavilion(p: BuildingParams = {}): VoxelStructure {
  const s = p.width ?? 5
  const tile = p.tile ?? 'gray'
  const b = new StructureBuilder('pavilion')
  const { x0, x1, z0, z1 } = bounds(s, s)
  /* 台明：石砌一圈，正面踏步 */
  b.box(x0 - 1, 0, z0 - 1, x1 + 1, 0, z1 + 1, S(B.STONE_BRICK))
  b.box(x0, 0, z0, x1, 0, z1, S(B.PAVING))
  for (const x of [-1, 0, 1]) b.set(x, 0, z1 + 2, stairs(B.STONE_BRICK_STAIRS, Direction.North))
  /* 柱：四角，大亭每两格一根 */
  const col = (x: number, z: number) => ((x === x0 || x === x1) && (z - z0) % 2 === 0) || ((z === z0 || z === z1) && (x - x0) % 2 === 0)
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
      if (col(x, z)) for (let y = 1; y <= 4; y++) b.set(x, y, z, post(B.PILLAR))
      else {
        // 美人靠（坐凳栏杆），正面当中留口；檐下挂落花格
        if (!(z === z1 && Math.abs(x) <= 0)) b.set(x, 1, z, S(B.WOOD_FENCE))
        b.set(x, 3, z, packState({ id: B.LATTICE_WINDOW, facing: z === z0 || z === z1 ? Direction.South : Direction.East }))
      }
      b.set(x, 4, z, x === x0 || x === x1 ? post(B.DARK_PLANKS, Axis.Z) : post(B.DARK_PLANKS, Axis.X))
    }
  dougong(b, x0, x1, z0, z1, 4, 1)
  if (p.double) {
    /* 重檐：下檐一圈，上立短柱，再起攒尖 */
    b.s.merge(buildRoof({ width: s + 2, depth: s + 2, type: 'taiyan', tile }), 0, 5, 0)
    const ib = bounds(s - 2, s - 2)
    for (const x of [ib.x0, ib.x1]) for (const z of [ib.z0, ib.z1]) for (let y = 5; y <= 7; y++) b.set(x, y, z, post(B.PILLAR))
    b.walls(ib.x0, 6, ib.z0, ib.x1, 7, ib.z1, (x, _y, z) => ((x === ib.x0 || x === ib.x1) && (z === ib.z0 || z === ib.z1) ? post(B.PILLAR) : S(B.LACQUER)))
    b.box(ib.x0, 8, ib.z0, ib.x1, 8, ib.z1, S(B.DARK_PLANKS))
    dougong(b, ib.x0, ib.x1, ib.z0, ib.z1, 8, 1)
    b.s.merge(buildRoof({ width: s, depth: s, type: 'cuanjian', tile }), 0, 9, 0)
  } else b.s.merge(buildRoof({ width: s + 2, depth: s + 2, type: 'cuanjian', tile }), 0, 5, 0)
  /* 宝顶 */
  let top = 5
  while (b.s.has(0, top, 0)) top++
  b.set(0, top, 0, S(B.GOLD))
  if (p.lanterns) for (const [x, z] of [[x0 - 1, z1 + 1], [x1 + 1, z1 + 1]] as const) b.set(x, 3, z, S(B.LANTERN))
  return b.build()
}

/* ================= 木塔（楼阁式） ================= */
export function pagoda(p: BuildingParams = {}): VoxelStructure {
  const levels = p.levels ?? 5
  const base = p.width ?? 7
  const b = new StructureBuilder('pagoda')
  const { x0, x1, z0, z1 } = bounds(base + 2, base + 2)
  b.box(x0, 0, z0, x1, 0, z1, S(B.STONE_BRICK))
  let y = 1
  for (let i = 0; i < levels; i++) {
    const w = Math.max(3, base - 2 * Math.floor(i / 2))
    const bb = bounds(w, w)
    const sh = 3
    b.walls(bb.x0, y, bb.z0, bb.x1, y + sh - 1, bb.z1, (x, yy, z) => {
      const corner = (x === bb.x0 || x === bb.x1) && (z === bb.z0 || z === bb.z1)
      if (corner) return post(B.PILLAR)
      if (yy === y + 1 && (x === 0 || z === 0)) return packState({ id: B.LATTICE_WINDOW, facing: x === 0 ? Direction.South : Direction.East })
      return S(B.PLASTER)
    })
    if (i === 0) b.set(0, y, bb.z1, 0).set(0, y + 1, bb.z1, 0)
    b.box(bb.x0, y + sh, bb.z0, bb.x1, y + sh, bb.z1, S(B.DARK_PLANKS))
    dougong(b, bb.x0, bb.x1, bb.z0, bb.z1, y + sh, 2)
    b.s.merge(buildRoof({ width: w + 4, depth: w + 4, type: 'taiyan', tile: p.tile ?? 'gray' }), 0, y + sh + 1, 0)
    y += sh + 2
  }
  const topW = Math.max(3, base - 2 * Math.floor((levels - 1) / 2))
  b.s.merge(buildRoof({ width: topW + 2, depth: topW + 2, type: 'cuanjian', tile: p.tile ?? 'gray', upturn: false }), 0, y, 0)
  let top = y
  while (b.s.has(0, top, 0)) top++
  for (let k = 0; k < 3; k++) b.set(0, top + k, 0, S(k === 2 ? B.FINIAL : B.GOLD))
  return b.build()
}

/* ================= 砖塔（大雁塔式） ================= */
export function brickPagoda(p: BuildingParams = {}): VoxelStructure {
  const levels = p.levels ?? 7
  const base = p.width ?? 11
  const b = new StructureBuilder('brick-pagoda')
  const pb = bounds(base + 6, base + 6)
  platform(b, pb.x0, pb.x1, pb.z0, pb.z1, 3, B.STONE_BRICK, B.STONE_BRICK_STAIRS, true)
  let y = 3
  for (let i = 0; i < levels; i++) {
    const w = Math.max(3, base - 2 * Math.floor((i * 4) / levels))
    const bb = bounds(w, w)
    const sh = i === 0 ? 5 : 3
    b.box(bb.x0, y, bb.z0, bb.x1, y + sh - 1, bb.z1, (x, yy, z) => {
      const face = x === bb.x0 || x === bb.x1 || z === bb.z0 || z === bb.z1
      if (!face) return 0
      if ((x === 0 || z === 0) && yy >= y + sh - 3 && yy < y + sh - 1) return 0
      return S((x + z + yy) % 5 === 0 ? B.COBBLE : B.STONE_BRICK)
    })
    /* 叠涩出檐 */
    const eb = bounds(w + 2, w + 2)
    for (const x of range(eb.x0, eb.x1))
      for (const z of range(eb.z0, eb.z1)) if (x === eb.x0 || x === eb.x1 || z === eb.z0 || z === eb.z1) b.set(x, y + sh, z, S(B.STONE_BRICK_SLAB))
    b.box(bb.x0, y + sh, bb.z0, bb.x1, y + sh, bb.z1, S(B.STONE_BRICK))
    y += sh + 1
  }
  const tw = Math.max(3, base - 2 * Math.floor(((levels - 1) * 4) / levels))
  b.s.merge(buildRoof({ width: tw, depth: tw, type: 'cuanjian', tile: 'gray', upturn: false }), 0, y, 0)
  let top = y
  while (b.s.has(0, top, 0)) top++
  for (let k = 0; k < 3; k++) b.set(0, top + k, 0, S(k === 2 ? B.FINIAL : B.GOLD))
  return b.build()
}

/* ================= 楼阁（黄鹤楼、岳阳楼式） ================= */
export function tower(p: BuildingParams = {}): VoxelStructure {
  const floors = p.levels ?? 3
  const base = p.width ?? 11
  const tile = p.tile ?? 'yellow'
  const b = new StructureBuilder('tower')
  const pb = bounds(base + 6, base + 6)
  platform(b, pb.x0, pb.x1, pb.z0, pb.z1, 2, B.STONE_BRICK, B.STONE_BRICK_STAIRS)
  let y = 2
  for (let f = 0; f < floors; f++) {
    const w = base - 2 * Math.floor(f * 0.7)
    const bb = bounds(w, w)
    const fh = 4
    /* 回廊平座 */
    if (f > 0) {
      const gb = bounds(w + 2, w + 2)
      b.box(gb.x0, y - 1, gb.z0, gb.x1, y - 1, gb.z1, S(B.DARK_PLANKS))
      for (const x of range(gb.x0, gb.x1))
        for (const z of range(gb.z0, gb.z1)) if (x === gb.x0 || x === gb.x1 || z === gb.z0 || z === gb.z1) b.set(x, y, z, S(B.WOOD_FENCE))
    }
    b.walls(bb.x0, y, bb.z0, bb.x1, y + fh - 1, bb.z1, (x, yy, z) => {
      const corner = (x === bb.x0 || x === bb.x1) && (z === bb.z0 || z === bb.z1)
      if (corner || (x - bb.x0) % 3 === 0 || (z - bb.z0) % 3 === 0) return post(B.PILLAR)
      if (yy > y && yy < y + fh - 1) return packState({ id: B.LATTICE_WINDOW, facing: x === bb.x0 || x === bb.x1 ? Direction.East : Direction.South })
      return S(B.LACQUER)
    })
    if (f === 0) for (let k = 0; k < 3; k++) b.set(0, y + k, bb.z1, 0)
    b.box(bb.x0, y + fh, bb.z0, bb.x1, y + fh, bb.z1, S(B.DARK_PLANKS))
    dougong(b, bb.x0, bb.x1, bb.z0, bb.z1, y + fh, 2)
    if (f < floors - 1) b.s.merge(buildRoof({ width: w + 4, depth: w + 4, type: 'taiyan', tile }), 0, y + fh + 1, 0)
    else b.s.merge(buildRoof({ width: w + 4, depth: w + 4, type: 'xieshan', tile, eaveDepth: 2 }), 0, y + fh + 1, 0)
    if (p.lanterns) for (const x of [bb.x0 - 1, bb.x1 + 1]) b.set(x, y + fh - 1, bb.z1 + 1, S(B.LANTERN))
    y += fh + 3
  }
  return b.build()
}

/* ================= 城门 ================= */
export function gate(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 13
  const d = p.depth ?? 7
  const h = p.height ?? 7
  const b = new StructureBuilder('gate')
  const { x0, x1, z0, z1 } = bounds(w, d)
  b.box(x0, 0, z0, x1, h - 1, z1, S(B.CITY_BRICK))
  /* 券门：3 宽 4 高，拱顶收一格 */
  b.box(-1, 0, z0, 1, 3, z1, 0)
  b.box(0, 4, z0, 0, 4, z1, 0)
  for (const z of [z0, z1]) b.set(-1, 4, z, stairs(B.STONE_BRICK_STAIRS, Direction.East, true)).set(1, 4, z, stairs(B.STONE_BRICK_STAIRS, Direction.West, true))
  b.box(-1, -1, z0, 1, -1, z1, S(B.PAVING))
  /* 垛口 */
  for (const x of range(x0, x1))
    for (const z of [z0, z1]) if ((x - x0) % 2 === 0) b.set(x, h, z, S(B.CITY_BRICK))
  /* 城楼 */
  const lou = hall({ width: w - 4, depth: d - 2, height: 4, terrace: 1, tile: p.tile ?? 'gray', lanterns: p.lanterns })
  b.s.merge(lou, 0, h - 1, 0)
  return b.build()
}

/** 一段城墙（沿 X 方向，长度 length），供地标沿折线铺设 */
export function wallSegment(p: BuildingParams = {}): VoxelStructure {
  const L = p.length ?? 8
  const h = p.height ?? 6
  const b = new StructureBuilder('wall')
  for (let x = 0; x < L; x++) {
    for (let z = -1; z <= 1; z++) for (let y = 0; y < h; y++) b.set(x, y, z, S(B.CITY_BRICK))
    b.set(x, h - 1, 0, S(B.PAVING))
    if (x % 2 === 0) b.set(x, h, -1, S(B.CITY_BRICK)).set(x, h, 1, S(B.CITY_BRICK))
    else b.set(x, h, -1, S(B.CITY_BRICK_SLAB)).set(x, h, 1, S(B.CITY_BRICK_SLAB))
  }
  return b.build()
}

/* ================= 拱桥 ================= */
export function archBridge(p: BuildingParams = {}): VoxelStructure {
  const L = (p.length ?? 11) | 1
  const hl = (L - 1) / 2
  const rise = Math.max(2, Math.round(hl * 0.45))
  const b = new StructureBuilder('bridge')
  const deckY = (x: number) => Math.round(rise * (1 - (x / (hl + 1)) ** 2))
  const opening = Math.max(1, Math.floor(hl * 0.55))
  for (let x = -hl; x <= hl; x++) {
    const y = deckY(x)
    const next = deckY(x + Math.sign(x || 1))
    for (let z = -1; z <= 1; z++) {
      const up = x < 0 ? deckY(x + 1) > y : x > 0 ? deckY(x - 1) > y : false
      b.set(x, y, z, up ? stairs(B.STONE_BRICK_STAIRS, x < 0 ? Direction.East : Direction.West) : S(B.STONE_BRICK_SLAB))
      if (up || y > next) b.set(x, y - 1, z, S(B.STONE_BRICK))
      /* 券洞之外实砌到水下 */
      const floor = Math.abs(x) <= opening ? y - 1 - Math.max(0, Math.round((opening - Math.abs(x)) * 0.6)) : -4
      for (let yy = y - 1; yy >= Math.max(-4, floor); yy--) if (Math.abs(x) > opening || yy >= floor) b.setIfEmpty(x, yy, z, S(B.STONE_BRICK))
    }
    b.set(x, y + 1, -2, S(B.MARBLE_FENCE))
    b.set(x, y + 1, 2, S(B.MARBLE_FENCE))
    b.set(x, y, -2, S(B.STONE_BRICK))
    b.set(x, y, 2, S(B.STONE_BRICK))
  }
  /* 券洞：挖空 */
  for (let x = -opening + 1; x <= opening - 1; x++) {
    const top = deckY(x) - 2
    for (let yy = -4; yy <= top - Math.round(Math.abs(x) * 0.5); yy++) for (let z = -2; z <= 2; z++) b.set(x, yy, z, 0)
  }
  return b.build()
}

/* ================= 白塔（覆钵式） ================= */
export function stupa(p: BuildingParams = {}): VoxelStructure {
  const r = p.width ?? 4
  const b = new StructureBuilder('stupa')
  b.box(-r - 2, 0, -r - 2, r + 2, 1, r + 2, S(B.MARBLE))
  b.box(-r - 1, 2, -r - 1, r + 1, 2, r + 1, S(B.MARBLE_SLAB))
  b.blob(0, 3, 0, r + 0.5, r + 1, r + 0.5, S(B.MARBLE), (_x, y) => y >= 3, false)
  const top = 3 + r + 1
  b.box(-1, top, -1, 1, top + 1, 1, S(B.MARBLE))
  for (let k = 0; k < 4; k++) b.set(0, top + 2 + k, 0, S(k % 2 ? B.MARBLE : B.GOLD))
  b.set(0, top + 6, 0, S(B.FINIAL))
  return b.build()
}

/* ================= 台基 ================= */
export function terrace(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 15
  const d = p.depth ?? 11
  const h = p.height ?? 2
  const b = new StructureBuilder('terrace')
  const { x0, x1, z0, z1 } = bounds(w, d)
  platform(b, x0, x1, z0, z1, h, B.MARBLE, B.MARBLE_STAIRS)
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) if ((x === x0 || x === x1 || z === z0 || z === z1) && !(z === z1 && Math.abs(x) <= 1)) b.set(x, h, z, S(B.MARBLE_FENCE))
  return b.build()
}

/* ================= 楼（两层：底层店面、上层回廊） ================= */
export function loft(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 3)
  const w = p.width ?? 9
  const d = p.depth ?? 7
  const b = new StructureBuilder('loft')
  const { x0, x1, z0, z1 } = bounds(w, d)
  b.box(x0, 0, z0, x1, 0, z1, S(B.STONE_BRICK))
  /* 底层：开间木门板 */
  b.walls(x0, 1, z0, x1, 3, z1, (x, y, z) => {
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1)
    if (corner || (z === z1 && (x - x0) % 2 === 0)) return post(B.PILLAR)
    if (z === z1) return y === 3 ? packState({ id: B.LATTICE_WINDOW, facing: Direction.South }) : S(B.DARK_PLANKS)
    return S(B.PLASTER)
  })
  b.set(0, 1, z1, 0).set(0, 2, z1, 0)
  b.box(x0, 4, z0, x1, 4, z1, S(B.DARK_PLANKS))
  /* 平座回廊 */
  for (const x of range(x0 - 1, x1 + 1)) b.set(x, 4, z1 + 1, S(B.DARK_PLANKS_SLAB)).set(x, 5, z1 + 1, S(B.WOOD_FENCE))
  /* 二层：隔扇窗 */
  b.walls(x0, 5, z0, x1, 7, z1, (x, y, z) => {
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1)
    if (corner) return post(B.PILLAR)
    if ((z === z1 || z === z0) && y === 6) return packState({ id: B.LATTICE_WINDOW, facing: Direction.South })
    return S(B.LACQUER)
  })
  eaveBrackets(b, x0, x1, z0, z1, 7)
  b.s.merge(buildRoof({ width: w + 2, depth: d + 2, type: r.chance(0.5) ? 'xieshan' : 'xuanshan', tile: p.tile ?? 'gray', eaveDepth: 1 }), 0, 8, 0)
  fillGables(b, [x0, x1], z0 + 1, z1 - 1, 8, S(B.PLASTER))
  b.set(x0 + 1, 6, z1 + 1, S(B.LANTERN)).set(x1 - 1, 6, z1 + 1, S(B.LANTERN))
  if (p.lanterns ?? r.chance(0.6)) b.set(x1, 3, z1 + 1, S(r.chance(0.5) ? B.BANNER_RED : B.BANNER_BLUE))
  return b.build()
}

/* ================= 四合院：正房、两厢、院墙与门楼 ================= */
export function courtyard(p: BuildingParams = {}): VoxelStructure {
  const s = p.width ?? 17
  const b = new StructureBuilder('courtyard')
  const { x0, x1, z0, z1 } = bounds(s, s)
  b.box(x0, 0, z0, x1, 0, z1, S(B.PAVING))
  /* 院墙：白墙青瓦压顶 */
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
      b.set(x, 1, z, S(B.PLASTER)).set(x, 2, z, S(B.PLASTER)).set(x, 3, z, S(B.ROOF_GRAY_SLAB))
    }
  /* 门楼（南墙正中） */
  for (let y = 1; y <= 3; y++) b.set(0, y, z1, 0)
  b.set(-1, 1, z1, post(B.PILLAR)).set(1, 1, z1, post(B.PILLAR)).set(-1, 2, z1, post(B.PILLAR)).set(1, 2, z1, post(B.PILLAR))
  b.s.merge(buildRoof({ width: 5, depth: 3, type: 'xuanshan', tile: p.tile ?? 'gray', upturn: false }), 0, 3, z1)
  /* 正房与两厢 */
  const main = house({ width: s - 6, depth: 5, height: 4, seed: (p.seed ?? 1) + 1, tile: p.tile ?? 'gray', lanterns: true })
  b.s.merge(main, 0, 0, z0 + 3)
  const wing = house({ width: 7, depth: 5, height: 3, seed: (p.seed ?? 1) + 2, tile: p.tile ?? 'gray', lanterns: false })
  b.s.merge(wing.rotate(3), x0 + 3, 0, 2)
  b.s.merge(wing.rotate(1), x1 - 3, 0, 2)
  return b.build()
}

/* ================= 店铺：敞开的铺面、柜台、布幌、货桶 ================= */
export function shop(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 5)
  const w = p.width ?? 7
  const d = p.depth ?? 5
  const b = new StructureBuilder('shop')
  const { x0, x1, z0, z1 } = bounds(w, d)
  b.box(x0, 0, z0, x1, 0, z1, S(B.PLANKS))
  b.walls(x0, 1, z0, x1, 3, z1, (x, _y, z) => ((x === x0 || x === x1) && (z === z0 || z === z1) ? post(B.DARK_POST) : z === z1 ? 0 : S(B.PLASTER)))
  for (const x of range(x0, x1)) b.set(x, 3, z1, post(B.DARK_PLANKS, Axis.X))
  for (const x of range(x0 + 1, x1 - 1)) b.set(x, 1, z1 - 1, S(B.PLANKS_SLAB))
  b.set(x0 + 1, 1, z0 + 1, S(B.BARREL)).set(x1 - 1, 1, z0 + 1, S(B.BARREL))
  /* 布篷 */
  const awn = r.pick([B.CLOTH_BUFF_SLAB, B.CLOTH_RED_SLAB, B.CLOTH_BLUE_SLAB])
  for (const x of range(x0, x1)) b.set(x, 3, z1 + 1, packState({ id: awn, half: 'top' }))
  b.s.merge(buildRoof({ width: w + 2, depth: d + 2, type: 'xuanshan', tile: p.tile ?? 'gray', upturn: false }), 0, 4, 0)
  fillGables(b, [x0, x1], z0 + 1, z1 - 1, 4, S(B.PLASTER))
  b.set(x1 + 1, 3, z1 + 1, post(B.DARK_POST)).set(x1 + 1, 2, z1 + 1, S(r.chance(0.5) ? B.BANNER_RED : B.BANNER_BLUE))
  b.set(x0, 2, z1 + 1, S(B.LANTERN))
  return b.build()
}

/* ================= 摊：四柱布棚、案板与货 ================= */
export function stall(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 7)
  const b = new StructureBuilder('stall')
  const top = r.pick([B.CLOTH_BUFF_SLAB, B.CLOTH_RED_SLAB, B.CLOTH_BLUE_SLAB])
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    for (let y = 0; y < 3; y++) b.set(x, y, z, post(B.DARK_POST))
  b.box(-1, 3, -1, 1, 3, 1, S(top))
  b.set(-1, 0, 0, S(B.PLANKS_SLAB)).set(0, 0, 0, S(B.PLANKS_SLAB)).set(1, 0, 0, S(B.PLANKS_SLAB))
  const goods = r.pick([B.BARREL, B.FLOWER_RED, B.FLOWER_YELLOW, B.PEBBLE])
  b.set(0, 1, 0, S(goods))
  if (r.chance(0.5)) b.set(0, 2, -1, S(B.LANTERN))
  return b.build()
}

/* ================= 钟鼓楼：砖台券洞 + 楼阁 ================= */
export function bellTower(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 11
  const b = new StructureBuilder('bell-tower')
  const { x0, x1, z0, z1 } = bounds(w, w)
  b.box(x0, 0, z0, x1, 5, z1, S(B.CITY_BRICK))
  /* 十字券洞 */
  b.box(-1, 0, z0, 1, 3, z1, 0)
  b.box(x0, 0, -1, x1, 3, 1, 0)
  for (const x of range(x0, x1)) for (const z of [z0, z1]) if ((x - x0) % 2 === 0) b.set(x, 6, z, S(B.CITY_BRICK_SLAB))
  const top = hall({ width: w - 4, depth: w - 4, height: 4, terrace: 1, tile: p.tile ?? 'green', lanterns: true, double: true })
  b.s.merge(top, 0, 5, 0)
  return b.build()
}

/* ================= 牌坊：四柱三间 ================= */
export function archway(p: BuildingParams = {}): VoxelStructure {
  const b = new StructureBuilder('archway')
  const tile = p.tile ?? 'gray'
  for (const x of [-4, -2, 2, 4]) {
    for (let y = 0; y <= (Math.abs(x) === 2 ? 7 : 5); y++) b.set(x, y, 0, post(B.PILLAR))
    b.set(x, 0, 0, S(B.STONE_BRICK))
  }
  for (let x = -4; x <= 4; x++) b.set(x, 5, 0, post(B.DARK_PLANKS, Axis.X))
  for (let x = -2; x <= 2; x++) b.set(x, 7, 0, post(B.DARK_PLANKS, Axis.X))
  b.set(0, 6, 0, S(B.GOLD))
  const st = tile === 'yellow' ? B.ROOF_YELLOW_STAIRS : tile === 'green' ? B.ROOF_GREEN_STAIRS : B.ROOF_GRAY_STAIRS
  const full = tile === 'yellow' ? B.ROOF_YELLOW : tile === 'green' ? B.ROOF_GREEN : B.ROOF_GRAY
  const cap = (xa: number, xb: number, y: number) => {
    for (let x = xa; x <= xb; x++) {
      b.set(x, y, -1, stairs(st, Direction.South))
      b.set(x, y, 1, stairs(st, Direction.North))
      b.set(x, y, 0, S(full))
    }
    b.set(xa - 1, y, 0, packState({ id: B.RIDGE_END, facing: Direction.West }))
    b.set(xb + 1, y, 0, packState({ id: B.RIDGE_END, facing: Direction.East }))
  }
  cap(-3, 3, 8)
  cap(-5, -3, 6)
  cap(3, 5, 6)
  return b.build()
}

/* ================= 名楼（黄鹤楼、岳阳楼、滕王阁、鹳雀楼、多景楼式） ================= */

/**
 * 高台之上层层楼阁：
 *  - 台基：石台或城台，四面石栏，前后踏道；
 *  - 每层：内槽隔扇门窗（下裙板、上额），外圈回廊檐柱，二层以上有平座栏杆，檐下挂落花格；
 *  - 额枋上一圈斗拱挑出腰檐，层层收分；
 *  - 十字平面（黄鹤楼）：一、二层四面正中出抱厦，各自一个小歇山，檐角层层叠叠；
 *  - 顶：十字脊歇山 / 歇山 / 庑殿 / 攒尖，宝顶鎏金；回廊四角挂灯。
 */
export function grandTower(p: BuildingParams = {}): VoxelStructure {
  const floors = p.levels ?? 3
  const W = (p.width ?? 11) | 1
  const tile = p.tile ?? 'yellow'
  const T = p.terrace ?? 3
  const cross = p.plan === 'cross'
  const b = new StructureBuilder('grand-tower')
  const tb = bounds(W + (cross ? 14 : 10), W + (cross ? 14 : 10))
  platform(b, tb.x0, tb.x1, tb.z0, tb.z1, T, p.base === 'wall' ? B.CITY_BRICK : B.STONE_BRICK, B.STONE_BRICK_STAIRS, true)
  for (const x of range(tb.x0, tb.x1))
    for (const z of range(tb.z0, tb.z1)) {
      if (x !== tb.x0 && x !== tb.x1 && z !== tb.z0 && z !== tb.z1) continue
      if ((z === tb.z0 || z === tb.z1) && Math.abs(x) <= 1) continue
      b.set(x, T, z, S(p.base === 'wall' ? B.CITY_BRICK_SLAB : B.MARBLE_FENCE))
    }
  let y = T
  for (let f = 0; f < floors; f++) {
    const w = W - 2 * Math.floor(f * 0.7)
    const bb = bounds(w, w)
    const gb = bounds(w + 2, w + 2)
    const fh = f === 0 ? 5 : 4
    const last = f === floors - 1
    /* 楼面 */
    b.box(gb.x0, y - 1, gb.z0, gb.x1, y - 1, gb.z1, S(f === 0 ? B.PAVING : B.DARK_PLANKS))
    /* 回廊：檐柱、平座栏杆、挂落 */
    for (const x of range(gb.x0, gb.x1))
      for (const z of range(gb.z0, gb.z1)) {
        if (x !== gb.x0 && x !== gb.x1 && z !== gb.z0 && z !== gb.z1) continue
        const colAt = ((x === gb.x0 || x === gb.x1) && (z - gb.z0) % 2 === 0) || ((z === gb.z0 || z === gb.z1) && (x - gb.x0) % 2 === 0)
        if (colAt) for (let yy = y; yy < y + fh; yy++) b.set(x, yy, z, post(B.PILLAR))
        else {
          if (f > 0) b.set(x, y, z, S(B.WOOD_FENCE))
          b.set(x, y + fh - 1, z, packState({ id: B.LATTICE_WINDOW, facing: z === gb.z0 || z === gb.z1 ? Direction.South : Direction.East }))
        }
        b.set(x, y + fh, z, x === gb.x0 || x === gb.x1 ? post(B.DARK_PLANKS, Axis.Z) : post(B.DARK_PLANKS, Axis.X))
      }
    /* 内槽：隔扇门窗，一层四面正中开门 */
    b.walls(bb.x0, y, bb.z0, bb.x1, y + fh - 1, bb.z1, (x, yy, z) => {
      const corner = (x === bb.x0 || x === bb.x1) && (z === bb.z0 || z === bb.z1)
      if (corner) return post(B.PILLAR)
      if (yy === y) return S(B.DARK_PLANKS)
      if (yy === y + fh - 1) return S(B.LACQUER)
      return packState({ id: B.LATTICE_WINDOW, facing: x === bb.x0 || x === bb.x1 ? Direction.East : Direction.South })
    })
    if (f === 0)
      for (let k = 0; k < 3; k++) {
        b.set(0, y + k, bb.z1, 0).set(0, y + k, bb.z0, 0)
        b.set(bb.x0, y + k, 0, 0).set(bb.x1, y + k, 0, 0)
      }
    b.box(bb.x0, y + fh, bb.z0, bb.x1, y + fh, bb.z1, S(B.DARK_PLANKS))
    dougong(b, gb.x0, gb.x1, gb.z0, gb.z1, y + fh, 2)
    /* 抱厦 */
    if (cross && f < 2) {
      const wing = new StructureBuilder('wing')
      const z0w = gb.z1 + 1
      const z1w = gb.z1 + 3
      wing.box(-2, y - 1, z0w, 2, y - 1, z1w, S(f === 0 ? B.PAVING : B.DARK_PLANKS))
      for (const [x, z] of [[-2, z1w], [2, z1w], [-2, z0w], [2, z0w]] as const) for (let yy = y; yy < y + fh; yy++) wing.set(x, yy, z, post(B.PILLAR))
      for (const x of [-1, 0, 1]) {
        if (f > 0) wing.set(x, y, z1w, S(B.WOOD_FENCE))
        wing.set(x, y + fh - 1, z1w, packState({ id: B.LATTICE_WINDOW, facing: Direction.South }))
      }
      for (const x of [-2, -1, 0, 1, 2]) wing.set(x, y + fh, z1w, post(B.DARK_PLANKS, Axis.X))
      for (const z of range(z0w, z1w)) wing.set(-2, y + fh, z, post(B.DARK_PLANKS, Axis.Z)).set(2, y + fh, z, post(B.DARK_PLANKS, Axis.Z))
      wing.s.merge(buildRoof({ width: 7, depth: 6, type: 'xieshan', tile, eaveDepth: 1, orientation: 1 }), 0, y + fh + 1, z0w + 1)
      const ws = wing.build()
      for (let r = 0; r < 4; r++) b.s.merge(r ? ws.rotate(r) : ws, 0, 0, 0)
    }
    /* 腰檐 / 顶 */
    const ry = y + fh + 1
    if (!last) b.s.merge(buildRoof({ width: w + 8, depth: w + 8, type: 'taiyan', tile }), 0, ry, 0)
    else {
      const top = p.top ?? 'xieshan'
      if (top === 'cross') {
        b.s.merge(buildRoof({ width: w + 6, depth: w + 2, type: 'xieshan', tile, eaveDepth: 2 }), 0, ry, 0)
        b.s.merge(buildRoof({ width: w + 6, depth: w + 2, type: 'xieshan', tile, eaveDepth: 2 }).rotate(1), 0, ry, 0)
      } else b.s.merge(buildRoof({ width: w + 6, depth: w + 6, type: top, tile, eaveDepth: 2 }), 0, ry, 0)
      let t = ry
      while (b.s.has(0, t, 0)) t++
      b.set(0, t, 0, S(B.GOLD)).set(0, t + 1, 0, S(B.FINIAL))
    }
    /* 回廊四角挂灯（悬在斗拱下） */
    if (p.lanterns ?? true) for (const [x, z] of [[gb.x0 - 1, gb.z0 - 1], [gb.x1 + 1, gb.z0 - 1], [gb.x0 - 1, gb.z1 + 1], [gb.x1 + 1, gb.z1 + 1]] as const) b.set(x, y + fh - 1, z, S(B.LANTERN))
    y += fh + 3
  }
  return b.build()
}

/* ================= 水榭：立在水上的敞轩 ================= */

/** 木桩入水，木平台，四周美人靠，檐下挂落，歇山卷棚顶；背面（北）接岸 */
export function waterPavilion(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 7
  const d = p.depth ?? 5
  const b = new StructureBuilder('water-pavilion')
  const { x0, x1, z0, z1 } = bounds(w, d)
  for (let x = x0; x <= x1; x += 2) for (let z = z0; z <= z1; z += 2) for (let y = -4; y < 0; y++) b.set(x, y, z, S(B.STONE_BRICK))
  b.box(x0 - 1, 0, z0 - 1, x1 + 1, 0, z1 + 1, S(B.DARK_PLANKS))
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
      const colAt = ((x === x0 || x === x1) && (z - z0) % 2 === 0) || ((z === z0 || z === z1) && (x - x0) % 2 === 0)
      if (colAt) for (let y = 1; y <= 3; y++) b.set(x, y, z, post(B.PILLAR))
      else {
        if (!(z === z0 && Math.abs(x) <= 0)) b.set(x, 1, z, S(B.WOOD_FENCE))
        b.set(x, 3, z, packState({ id: B.LATTICE_WINDOW, facing: z === z0 || z === z1 ? Direction.South : Direction.East }))
      }
      b.set(x, 4, z, x === x0 || x === x1 ? post(B.DARK_PLANKS, Axis.Z) : post(B.DARK_PLANKS, Axis.X))
    }
  b.s.merge(buildRoof({ width: w + 3, depth: d + 3, type: 'xieshan', tile: p.tile ?? 'gray', eaveDepth: 1 }), 0, 5, 0)
  fillGables(b, [x0 - 1, x1 + 1], z0, z1, 5, S(B.PLASTER))
  if (p.lanterns ?? true) b.set(x0, 3, z1 + 1, S(B.LANTERN)).set(x1, 3, z1 + 1, S(B.LANTERN))
  return b.build()
}

/* ================= 廊：有顶的游廊 ================= */

/** 沿 X 通长：铺地、两侧柱列与坐凳栏杆、挂落，悬山灰瓦 */
export function corridor(p: BuildingParams = {}): VoxelStructure {
  const L = p.length ?? 9
  const b = new StructureBuilder('corridor')
  const hl = Math.floor(L / 2)
  b.box(-hl, 0, -1, hl, 0, 1, S(B.PAVING))
  for (let x = -hl; x <= hl; x++)
    for (const z of [-1, 1]) {
      if ((x + hl) % 3 === 0 || x === hl) for (let y = 1; y <= 3; y++) b.set(x, y, z, post(B.PILLAR))
      else {
        b.set(x, 1, z, S(B.WOOD_FENCE))
        b.set(x, 3, z, packState({ id: B.LATTICE_WINDOW, facing: Direction.South }))
      }
      b.set(x, 4, z, post(B.DARK_PLANKS, Axis.X))
    }
  for (let x = -hl; x <= hl; x++) b.set(x, 4, 0, S(B.DARK_PLANKS))
  b.s.merge(buildRoof({ width: L + 2, depth: 5, type: 'xuanshan', tile: p.tile ?? 'gray', upturn: false }), 0, 5, 0)
  return b.build()
}

/* ================= 假山：太湖石叠山 ================= */

/** 几团石灰岩 / 苔石，按哈希缺块成洞，顶上略有苔 */
export function rockery(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 9)
  const b = new StructureBuilder('rockery')
  const n = 3 + r.int(0, 2)
  for (let i = 0; i < n; i++) {
    const cx = r.int(-3, 3)
    const cz = r.int(-2, 2)
    const h = r.range(2.5, 5)
    const rad = r.range(1.4, 2.4)
    b.blob(cx, h / 2, cz, rad, h / 2 + 0.6, rad, S(r.chance(0.7) ? B.LIMESTONE : B.MOSS_STONE), (x, y, z, dd) => y >= 0 && (dd < 0.55 || ((x * 7 + y * 13 + z * 5 + i) & 3) !== 0), false)
  }
  return b.build()
}
