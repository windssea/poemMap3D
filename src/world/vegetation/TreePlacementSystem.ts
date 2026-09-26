import { clamp, hash2i, hashUnit, Random } from '../../utils/math'
import { createSimplex2D, fbm, type Noise2D } from '../../utils/noise'
import { B } from '../block/Blocks'
import { BiomeId } from '../biome/BiomeId'
import { type TreeType, biomeDef } from '../biome/BiomeRegistry'
import { Occupancy, type OccupancyMap } from '../structure/OccupancyMap'
import type { TerrainSample } from '../terrain/TerrainSample'
import { WorldConfig } from '../WorldConfig'
import type { TreeScale } from './TreeDefinition'
import { TREE_SCALE_HEIGHT, TREE_TYPES, TREES, TreeCache } from './TreeRegistry'

/** 一棵树的放置决定（只描述「种什么、种在哪」，与「树怎么长」分离） */
export interface TreeInstance {
  type: TreeType
  variant: number
  height: number
  slot: number
  rotation: number
  x: number
  y: number
  z: number
  /** 放置顺序键（跨区块一致） */
  order: number
}

/** 地标对植被的调整 */
export interface VegetationProfile {
  weights?: Partial<Record<TreeType, number>>
  /** 密度倍数 */
  density?: number
  /** 只用庭院尺度 */
  gardenScale?: boolean
}

const CELL = 4
const TREE_GROUND = new Set<number>([B.GRASS, B.DIRT, B.LOESS, B.RED_EARTH, B.MOSS_STONE])

interface Pre {
  x: number
  z: number
  y: number
  type: TreeType
  variant: number
  scale: TreeScale
  spacing: number
  priority: number
}

/**
 * 种树决策：这里应该种什么？是否应该种？密度多少？
 * 每 4×4 方块一个抖动候选点；先做「预接受」（地形、生物群系、空间配额、占用、离水），
 * 再与周围更高优先级的预接受候选比较株距。全部只依赖世界坐标，因而与区块划分无关、确定可复现。
 */
export class TreePlacementSystem {
  private readonly nSpace: Noise2D
  private readonly nGrove: Noise2D
  private readonly memo = new Map<number, Pre | null>()
  readonly cache = new TreeCache()

  constructor(
    private readonly sample: (x: number, z: number) => TerrainSample,
    private readonly occupancy: OccupancyMap,
    private readonly profileOf: (landmark: number) => VegetationProfile | null = () => null,
    private readonly seed: number = WorldConfig.seed,
    /** 到地标中心的相对距离（0 中心 … 1 营造边缘）：地标留白用 */
    private readonly landmarkRel: (landmark: number, x: number, z: number) => number = () => 1,
  ) {
    this.nSpace = createSimplex2D(seed + 211)
    this.nGrove = createSimplex2D(seed + 223)
  }

  /**
   * 森林群落：0 密林（树冠相连，山谷、阴坡、远山）/ 1 疏林（丘陵、建筑外围、河谷）/ 2 留白（林中空地、草地）/
   * 3 林缘（密林外沿的一圈：小树、灌木，由林入草不突兀）。
   * 按大尺度噪声分区（片与片之间界线自然），密林配额整体收两成，空地至少留两成。
   */
  spaceClass(x: number, z: number, biome: number): number {
    const q = biomeDef(biome).space
    const u = clamp(0.5 + 1.35 * fbm(this.nSpace, x / 64, z / 64, 2), 0, 1)
    const dense = q.dense * 0.8
    const sparse = q.sparse * 0.85
    if (u < dense) return 0
    if (u < dense + 0.06) return 3
    if (u < dense + 0.06 + sparse) return 1
    return 2
  }

  private pre(cx: number, cz: number): Pre | null {
    const mk = ((cx + 32768) << 16) | (cz + 32768)
    if (this.memo.has(mk)) return this.memo.get(mk)!
    const r = this.evaluate(cx, cz)
    if (this.memo.size > 60000) this.memo.clear()
    this.memo.set(mk, r)
    return r
  }

  private evaluate(cx: number, cz: number): Pre | null {
    const h = hash2i(cx, cz, this.seed + 17)
    const x = cx * CELL + (h & 3)
    const z = cz * CELL + ((h >>> 2) & 3)
    const s = this.sample(x, z)
    if (s.waterY >= 0 || s.paved) return null
    if (!TREE_GROUND.has(s.topBlock)) return null
    const occ = this.occupancy.get(x, z)
    if (occ & (Occupancy.Building | Occupancy.Buffer | Occupancy.Entrance | Occupancy.Paved)) return null
    const bd = biomeDef(s.biome)
    const profile = s.landmark >= 0 ? this.profileOf(s.landmark) : null
    const weights = { ...bd.trees, ...(profile?.weights ?? {}) }
    if (!Object.values(weights).some((w) => w && w > 0)) return null
    if (s.slope > (s.biome === BiomeId.Cliff ? 3 : 2)) return null
    if (s.field) return null

    const space = this.spaceClass(x, z, s.biome)
    if (space === 2 && !profile) return null
    /* 地标留白：建筑核心（相对半径 < 0.45）不栽自然乔木（设计好的行道树另行种），
       0.45–0.8 只栽庭院小树、稀；0.8 以外渐入自然 */
    const rel = s.landmark >= 0 ? this.landmarkRel(s.landmark, x, z) : 2
    if (rel < 0.45) return null
    const landmarkK = rel < 0.8 ? 0.35 : rel < 1.2 ? 0.7 : 1
    /* 水岸：一半的岸不栽乔木（留给芦苇、草、石） */
    const shore = s.waterDistance < 6
    if (shore && hashUnit(hash2i(cx, cz, this.seed + 41)) < 0.5) return null
    const per100 = space === 0 ? bd.density[0] : space === 1 ? bd.density[1] : space === 3 ? (bd.density[0] + bd.density[1]) * 0.4 : bd.density[1] * 0.5
    const p = (per100 * CELL * CELL * (profile?.density ?? 1) * landmarkK * 0.82) / 100
    const roll = hashUnit(hash2i(cx, cz, this.seed + 29))
    if (roll >= p) return null

    /* 成片取种：同一片林子用同一优势树种，约两成混入其他树种 */
    const types = TREE_TYPES.filter((t) => (weights[t] ?? 0) > 0)
    const w = types.map((t) => weights[t]!)
    const rnd = new Random(hash2i(cx, cz, this.seed + 31))
    let type: TreeType
    if (rnd.chance(0.2)) type = types[rnd.weighted(w)]
    else {
      const u = clamp(0.5 + 1.4 * fbm(this.nGrove, x / 44, z / 44, 2), 0, 0.9999)
      let acc = 0
      const tot = w.reduce((a, b) => a + b, 0)
      type = types[types.length - 1]
      for (let i = 0; i < types.length; i++) {
        acc += w[i] / tot
        if (u < acc) {
          type = types[i]
          break
        }
      }
    }
    /* 水岸树种：柳约六成、阔叶三成、竹与桃一成——不是每段河岸都是一排柳 */
    if (shore && !profile) {
      const u = hashUnit(hash2i(cx, cz, this.seed + 43))
      const want: TreeType = u < 0.6 ? 'willow' : u < 0.9 ? 'broadleaf' : u < 0.95 ? 'bamboo' : 'peach'
      if ((weights[want] ?? 0) > 0 || want === 'willow' || want === 'broadleaf') type = want
    } else if (type === 'willow' && !shore && !profile) type = (weights.broadleaf ?? 0) > 0 ? 'broadleaf' : type
    const def = TREES[type]
    if (!def.allowedBiomes.includes(s.biome as never) && !profile) return null
    const minWater = type === 'willow' ? 1.5 : type === 'bamboo' ? 2 : 2.5
    if (s.waterDistance < minWater) return null

    /* 变体与尺度 */
    let variant = rnd.int(0, def.variants - 1)
    if (type === 'broadleaf') variant = s.biome === BiomeId.Garden || profile?.gardenScale ? 4 : rnd.int(0, 3)
    if (type === 'pine') variant = (s.biome === BiomeId.Cliff || s.slope > 1.4 || rel < 1.3) && rnd.chance(0.6) ? 2 : s.surfaceY > 150 || rnd.chance(0.25) ? 1 : 0
    if (type === 'willow') variant = s.biome === BiomeId.Garden || profile?.gardenScale ? 2 : rnd.chance(0.2) ? 1 : 0
    let scale = def.variantInfo[variant].scale
    if ((space === 3 || rel < 0.8) && scale !== 'garden') {
      // 林缘与地标外圈：换成小树（阔叶用庭院小树形）
      if (type === 'broadleaf') variant = 4
      scale = 'garden'
    }
    if (occ & Occupancy.Sightline) {
      if (scale !== 'garden' || rnd.chance(0.5)) return null
    }
    if (profile?.gardenScale && scale === 'grand') scale = 'mature'
    return { x, z, y: s.surfaceY + 1, type, variant, scale, spacing: def.minSpacing, priority: hash2i(cx, cz, this.seed + 37) }
  }

  /** 最终决定：与邻近更高优先级的候选保持株距 */
  decide(cx: number, cz: number): TreeInstance | null {
    const p = this.pre(cx, cz)
    if (!p) return null
    const R = 2
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        if (!dx && !dz) continue
        const q = this.pre(cx + dx, cz + dz)
        if (!q || q.priority < p.priority || (q.priority === p.priority && (dx < 0 || (dx === 0 && dz < 0)))) continue
        if (Math.hypot(q.x - p.x, q.z - p.z) < Math.max(p.spacing, q.spacing)) return null
      }
    const h = p.priority
    const [lo, hi] = p.type === 'bamboo' ? [9, 13] : TREE_SCALE_HEIGHT[p.scale]
    return {
      type: p.type,
      variant: p.variant,
      height: lo + (h % (hi - lo + 1)),
      slot: (h >>> 8) % TreeCache.SEED_SLOTS,
      rotation: (h >>> 12) & 3,
      x: p.x,
      y: p.y,
      z: p.z,
      order: p.priority,
    }
  }

  /** 树根落在 [x0, x1] × [z0, z1] 内的所有树 */
  collect(x0: number, z0: number, x1: number, z1: number): TreeInstance[] {
    const out: TreeInstance[] = []
    for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++)
      for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) {
        const t = this.decide(cx, cz)
        if (t && t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1) out.push(t)
      }
    return out
  }
}
