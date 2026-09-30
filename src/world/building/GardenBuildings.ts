import { Random } from '../../utils/math'
import { B } from '../block/Blocks'
import { type PackedState, S, packState } from '../block/BlockState'
import { Axis, Direction } from '../block/Direction'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import { type BuildingParams, bounds, fillGables, platform, post, range } from './BuildingFactory'
import { buildRoof } from './ChineseRoofBuilder'

/*
 * 园林建筑（苏州园林一类的宅园）：正面朝南（+Z）、锚点在地面中心，与 BuildingFactory 同一套约定。
 */

/**
 * 四面厅（远香堂一类的主厅）：一层青砖台基，前后各有踏步；四周落地长窗（上下两格花窗、窗下美人靠），
 * 前后正中一间敞开为门；檐下一圈深色额枋，歇山灰瓦顶；厅内木地板、两盏宫灯。
 */
export function gardenHall(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 9
  const d = p.depth ?? 7
  const b = new StructureBuilder('garden-hall')
  const { x0, x1, z0, z1 } = bounds(w, d)
  platform(b, x0 - 1, x1 + 1, z0 - 1, z1 + 1, 1, B.STONE_BRICK, B.STONE_BRICK_STAIRS, true)
  b.box(x0, 0, z0, x1, 0, z1, S(B.PLANKS))
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      if (x !== x0 && x !== x1 && z !== z0 && z !== z1) continue
      const frontBack = z === z0 || z === z1
      if (frontBack && Math.abs(x) <= 1) continue // 正中一间敞开为门
      const col = ((x === x0 || x === x1) && (z - z0) % 2 === 0) || (frontBack && ((x - x0) % 2 === 0 || Math.abs(x) === 2))
      if (col) {
        for (let y = 1; y <= 3; y++) b.set(x, y, z, post(B.PILLAR))
      } else {
        b.set(x, 1, z, S(B.WOOD_FENCE))
        for (const y of [2, 3]) b.set(x, y, z, packState({ id: B.LATTICE_WINDOW, facing: frontBack ? Direction.South : Direction.East }))
      }
    }
  for (const x of range(x0, x1)) for (const z of [z0, z1]) b.set(x, 4, z, post(B.DARK_PLANKS, Axis.X))
  for (const z of range(z0, z1)) for (const x of [x0, x1]) b.set(x, 4, z, post(B.DARK_PLANKS, Axis.Z))
  for (const x of range(x0, x1)) b.set(x, 4, 0, post(B.DARK_PLANKS, Axis.X)) // 厅心一道横梁，宫灯挂在梁下
  b.s.merge(buildRoof({ width: w + 3, depth: d + 3, type: 'xieshan', tile: p.tile ?? 'gray', eaveDepth: 1 }), 0, 5, 0)
  fillGables(b, [x0 - 1, x1 + 1], z0, z1, 5, S(B.PLASTER))
  b.set(-2, 3, 0, S(B.LANTERN)).set(2, 3, 0, S(B.LANTERN))
  if (p.lanterns ?? true) b.set(x0, 3, z1 + 1, S(B.LANTERN)).set(x1, 3, z1 + 1, S(B.LANTERN))
  return b.build()
}

/**
 * 九曲桥：沿 X 通长的折桥，每四格折一次、每次偏两格，木板桥面、两侧木栏、折角立柱挂灯，木桩入水。
 * 锚点在桥的中点；桥面与水面齐平（放置时 atLevel + overWater）。
 */
export function zigzagBridge(p: BuildingParams = {}): VoxelStructure {
  const L = p.length ?? 9
  const hl = Math.floor(L / 2)
  const b = new StructureBuilder('zigzag-bridge')
  const cells: [number, number][] = []
  const turns: [number, number][] = []
  let z = 0
  let dz = 1
  for (let x = -hl; x <= hl; x++) {
    cells.push([x, z])
    if ((x + hl) % 4 === 3 && x < hl) {
      turns.push([x, z])
      for (let k = 1; k <= 2; k++) cells.push([x, z + dz * k])
      z += dz * 2
      dz = -dz
      turns.push([x, z])
    }
  }
  const zs = cells.map((c) => c[1])
  const zc = Math.round((Math.min(...zs) + Math.max(...zs)) / 2)
  const has = new Set(cells.map(([x, cz]) => `${x},${cz}`))
  cells.forEach(([x, cz], i) => {
    const zz = cz - zc
    b.set(x, 0, zz, S(B.PLANKS))
    if (i % 3 === 0) for (let y = -4; y < 0; y++) b.set(x, y, zz, S(B.STONE_BRICK))
    const free = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([a, c]) => !has.has(`${x + a},${cz + c}`))
    if (free && x !== -hl && x !== hl) b.set(x, 1, zz, S(B.WOOD_FENCE))
  })
  for (const [x, cz] of turns) b.set(x, 1, cz - zc, post(B.PILLAR)).set(x, 2, cz - zc, post(B.PILLAR)).set(x, 3, cz - zc, S(B.LANTERN))
  return b.build()
}

/**
 * 石舫（香洲一类的旱船）：青砖船身，船头（南）收尖；前舱敞台带栏杆与灯，中舱花窗小屋低檐，后舱两层楼（粉墙、朱栏）歇山顶。
 * 船尾（北）靠岸、船头入水，放置时 atLevel + overWater。
 */
export function stoneBoat(_p: BuildingParams = {}): VoxelStructure {
  const b = new StructureBuilder('stone-boat')
  // 船身：宽 5、长 11，船头（z 4、5）收窄成尖
  for (let z = -5; z <= 5; z++) {
    const half = z <= 3 ? 2 : z === 4 ? 1 : 0
    for (let x = -half; x <= half; x++) {
      b.set(x, 0, z, S(z >= 3 ? B.STONE_BRICK : B.PLANKS))
      if ((x + z) % 3 === 0) for (let y = -4; y < 0; y++) b.set(x, y, z, S(B.STONE_BRICK))
    }
    if (z >= 2) for (const x of half === 0 ? [0] : [-half, half]) b.set(x, 1, z, S(B.WOOD_FENCE))
  }
  b.set(0, 2, 5, S(B.LANTERN))
  // 中舱（z −1…2）：四角立柱，四面花窗，低檐悬山
  const cabin = (x: number, y: number, z: number): PackedState => {
    if ((x === -2 || x === 2) && (z === -1 || z === 2)) return post(B.PILLAR)
    return y === 1 ? S(B.WOOD_FENCE) : packState({ id: B.LATTICE_WINDOW, facing: z === -1 || z === 2 ? Direction.South : Direction.East })
  }
  b.walls(-2, 1, -1, 2, 3, 2, cabin)
  for (const x of range(-2, 2)) for (const z of [-1, 2]) b.set(x, 4, z, post(B.DARK_PLANKS, Axis.X))
  b.s.merge(buildRoof({ width: 7, depth: 6, type: 'xuanshan', tile: 'gray', eaveDepth: 1 }), 0, 5, 0)
  // 后舱（z −5…−2）：两层楼，下层粉墙带花窗，上层朱漆花窗，歇山顶
  b.walls(-2, 1, -5, 2, 3, -2, (x, y, z) => {
    if ((x === -2 || x === 2) && (z === -5 || z === -2)) return post(B.PILLAR)
    return y === 2 && Math.abs(x) !== 1 ? packState({ id: B.LATTICE_WINDOW, facing: Direction.South }) : S(B.PLASTER)
  })
  b.box(-2, 4, -5, 2, 4, -2, S(B.DARK_PLANKS))
  b.walls(-2, 5, -5, 2, 6, -2, (x, y, z) => {
    if ((x === -2 || x === 2) && (z === -5 || z === -2)) return post(B.PILLAR)
    return y === 6 ? packState({ id: B.LATTICE_WINDOW, facing: z === -2 ? Direction.South : Direction.East }) : S(B.LACQUER)
  })
  b.s.merge(buildRoof({ width: 7, depth: 6, type: 'xieshan', tile: 'gray', eaveDepth: 1 }), 0, 7, -4)
  b.set(-2, 6, -1, S(B.LANTERN)).set(2, 6, -1, S(B.LANTERN))
  return b.build()
}

/**
 * 园门（门楼）：两侧青砖门垛，中间三间宽的门洞（门槛一级半砖），门头一道深色横梁与磨砖（城砖）门额，
 * 上覆起翘的灰瓦悬山顶；门垛两侧接粉墙、开漏窗；门前两盏灯笼。
 */
export function gardenGate(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 11
  const b = new StructureBuilder('garden-gate')
  const { x0, x1 } = bounds(w, 3)
  for (let x = x0; x <= x1; x++) {
    const bay = Math.abs(x) <= 1
    const pier = Math.abs(x) === 2 || Math.abs(x) === 3
    for (let y = 0; y <= 5; y++) {
      if (bay && y >= 1 && y <= 3) continue
      let id: number = B.PLASTER
      if (y === 0) id = B.STONE_BRICK
      else if (pier) id = B.CITY_BRICK
      else if (bay && y === 4) id = B.DARK_PLANKS
      else if (bay && y === 5) id = B.CITY_BRICK
      else if (y === 5) id = B.ROOF_GRAY_SLAB
      b.set(x, y, 0, S(id))
    }
    if (bay) b.set(x, 0, 0, S(B.STONE_BRICK_SLAB))
    if (Math.abs(x) >= 5 && Math.abs(x) % 2 === 1) for (const y of [2, 3]) b.set(x, y, 0, packState({ id: B.LATTICE_WINDOW, facing: Direction.South }))
  }
  b.s.merge(buildRoof({ width: 9, depth: 4, type: 'xuanshan', tile: 'gray', upturn: true }), 0, 5, 0)
  b.set(-2, 3, 1, S(B.LANTERN)).set(2, 3, 1, S(B.LANTERN))
  return b.build()
}

/** 花街铺地：方形同心纹样，青砖半砖为边、条石半砖与青砖半砖间隔（铺在地面之上一层半砖） */
export function gardenPaving(p: BuildingParams = {}): VoxelStructure {
  const w = p.width ?? 9
  const d = p.depth ?? 9
  const b = new StructureBuilder('garden-paving')
  const { x0, x1, z0, z1 } = bounds(w, d)
  for (const x of range(x0, x1))
    for (const z of range(z0, z1)) {
      const ring = Math.min(x - x0, x1 - x, z - z0, z1 - z)
      b.set(x, 0, z, S(ring % 2 === 1 ? B.PAVING_SLAB : B.STONE_BRICK_SLAB))
    }
  return b.build()
}

/** 花台：青砖砌三格见方的台，台内种花，中间一丛花树 */
export function flowerBed(p: BuildingParams = {}): VoxelStructure {
  const r = new Random(p.seed ?? 4)
  const b = new StructureBuilder('flower-bed')
  b.box(-1, 0, -1, 1, 0, 1, S(B.STONE_BRICK))
  for (const x of range(-1, 1))
    for (const z of range(-1, 1)) {
      if (x === 0 && z === 0) b.set(0, 1, 0, S(B.BLOSSOM_DEEP)).set(0, 2, 0, S(B.BLOSSOM))
      else b.set(x, 1, z, S(r.chance(0.5) ? B.FLOWER_RED : B.FLOWER_YELLOW))
    }
  return b.build()
}
