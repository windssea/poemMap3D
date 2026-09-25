import { clamp, hash2i, hashUnit, lerp, smoothstep } from '../../utils/math'
import { createSimplex2D, fbm, ridged, type Noise2D } from '../../utils/noise'
import { B } from '../block/Blocks'
import type { BlockId } from '../block/BlockState'
import { BiomeId } from '../biome/BiomeId'
import { biomeDef } from '../biome/BiomeRegistry'
import { resolveBiome } from '../biome/BiomeResolver'
import { tintZoneOf } from '../biome/TintZone'
import { SEA_LEVEL, WORLD_HEIGHT } from '../coordinate/constants'
import { type FocusProjection, getProjection } from '../coordinate/GeoProjection'
import { ELEVATION_ANCHORS, GORGES } from '../generation/geography/GeographyData'
import { MacroKind, type MacroSampler } from '../generation/geography/MacroGeography'
import type { LakeManager } from '../water/LakeManager'
import { BANK_MAX, type RiverManager } from '../water/RiverManager'
import { WorldConfig, yToMeters } from '../WorldConfig'
import { type TerrainColumn, type TerrainModifier, type TerrainSample, WaterKind } from './TerrainSample'

/** 地域地貌判定：在该点与四周 20 格处看宏观类型的占比 */
const KIND_TAPS: readonly (readonly [number, number])[] = [
  [0, 0],
  [20, 0],
  [-20, 0],
  [0, 20],
  [0, -20],
]

/** 一块矩形区域的地形取样结果（区块生成用：一次算好，填方块与种树共享） */
export interface TerrainRegion {
  x0: number
  z0: number
  w: number
  h: number
  samples: TerrainSample[]
  at(x: number, z: number): TerrainSample
}

/**
 * 地形：只负责世界地形数据，不创建任何 Three.js 对象。
 *
 * 流水线（逐列）：宏观高度插值 → 方块级细节噪声 → 海岸 → 江河下切与岸坡 → 湖泊 → 地标修改器
 * → 坡度 → 生物群系 → 地表 / 土层 / 岩层方块。
 */
export class TerrainManager {
  private readonly nDetail: Noise2D
  private readonly nRidge: Noise2D
  private readonly nBump: Noise2D
  private readonly nCoast: Noise2D
  private readonly nWidth: Noise2D
  private readonly nMisc: Noise2D
  private readonly nGully: Noise2D
  private readonly P: FocusProjection
  private readonly modifiers: TerrainModifier[]
  /** 名山主峰：方块级细节在峰顶附近收敛，峰高落在校准值上 */
  private readonly peaks: { x: number; z: number; r: number }[]

  constructor(
    readonly macro: MacroSampler,
    readonly rivers: RiverManager,
    readonly lakes: LakeManager,
    modifiers: TerrainModifier[] = [],
    seed: number = WorldConfig.seed,
  ) {
    this.nDetail = createSimplex2D(seed + 101)
    this.nRidge = createSimplex2D(seed + 103)
    this.nBump = createSimplex2D(seed + 107)
    this.nCoast = createSimplex2D(seed + 109)
    this.nWidth = createSimplex2D(seed + 113)
    this.nMisc = createSimplex2D(seed + 127)
    this.nGully = createSimplex2D(seed + 131)
    this.P = getProjection()
    this.modifiers = modifiers
    this.peaks = ELEVATION_ANCHORS.filter((a) => a.kind === 'peak').map((a) => {
      const c = this.P.project(a.lng, a.lat)
      return { x: c.x, z: c.z, r: Math.max(10, a.radius * WorldConfig.projection.blocksPerDegree * this.P.scaleAt(a.lng, a.lat) * 0.5) }
    })
  }

  /** 地形塑形：到地标修改器为止，得到一列的高度与水 */
  column(x: number, z: number): TerrainColumn {
    const M = this.macro
    const relief = M.relief(x, z)
    let h = M.height(x, z)
    const col: TerrainColumn = { x, z, height: h, waterY: -1, waterKind: WaterKind.None, waterDist: 1e9, biomeOverride: -1, landmark: -1, paved: false }
    if (!M.inBounds(x, z)) {
      col.height = SEA_LEVEL - 12
      col.waterY = SEA_LEVEL
      col.waterKind = WaterKind.Sea
      col.waterDist = 0
      return col
    }

    /* 方块级细节：幅度随当地起伏；平原只留一两格的缓丘 */
    let damp = 1
    for (const p of this.peaks) {
      const dx = x - p.x
      const dz = z - p.z
      if (Math.abs(dx) > p.r * 2.5 || Math.abs(dz) > p.r * 2.5) continue
      damp = Math.min(damp, 1 - 0.75 * Math.exp(-(dx * dx + dz * dz) / (p.r * p.r)))
    }
    const amp = Math.min(24, 0.7 + relief * 0.95) * damp
    const d = fbm(this.nDetail, x / 52, z / 52, 3)
    const r = ridged(this.nRidge, x / 96, z / 96, 3) - 0.45
    const bump = this.nBump(x / 14, z / 14)
    h += d * amp + r * amp * 0.9 * smoothstep(3, 10, relief) + bump * (0.6 + 0.08 * amp)
    h = this.regional(x, z, h, relief)

    /* 海岸：柔化陆地比例 + 噪声 → 方块级弯曲海岸线；近海成滩 */
    const ls = M.landSoft(x, z) + 0.13 * fbm(this.nCoast, x / 30, z / 30, 2)
    if (ls < 0.5) {
      const floor = Math.min(SEA_LEVEL - 2, M.land(x, z) ? SEA_LEVEL - 2 : M.height(x, z))
      col.height = Math.min(floor, SEA_LEVEL - 1 - (0.5 - ls) * 24)
      col.waterY = SEA_LEVEL
      col.waterKind = WaterKind.Sea
      col.waterDist = 0
    } else {
      const f = smoothstep(0.5, 0.64, ls)
      col.height = lerp(SEA_LEVEL + 0.6, Math.max(h, SEA_LEVEL + 1), f)
      col.waterDist = (ls - 0.5) * 60
      col.waterKind = ls < 0.62 ? WaterKind.Sea : WaterKind.None
      if (col.waterKind !== WaterKind.Sea) col.waterDist = 1e9
    }

    /* 江河：河心深、近岸浅；岸坡由滩地缓升，岸不低于水面 */
    const rv = this.rivers.query(x, z)
    if (rv) {
      /* 峡谷：江面收窄，两岸峭壁拔起 */
      let gorge = 0
      let gorgeWall = 0
      for (const g of GORGES) {
        if (this.rivers.rivers[rv.river].def.id !== g.river) continue
        const lng = this.P.lngOf(x)
        const f = smoothstep(g.lng0, g.lng0 + 0.25, lng) * (1 - smoothstep(g.lng1 - 0.25, g.lng1, lng))
        if (f > gorge) {
          gorge = f * g.narrow
          gorgeWall = f * g.wall
        }
      }
      const hw = rv.halfWidth * (1 - gorge) * (1 + 0.3 * this.nWidth(x / 70, z / 70) + 0.1 * this.nWidth(x / 18 + 50, z / 18))
      const L = rv.level
      const edge = rv.dist - hw
      if (edge < 0) {
        const t = clamp(-edge / Math.max(2, hw), 0, 1)
        const bed = L - 1 - Math.round(1 + 3.5 * Math.pow(t, 0.7))
        if (col.waterKind !== WaterKind.Sea || col.height > bed) {
          col.height = Math.min(col.height, bed)
          col.waterY = col.waterY >= 0 ? Math.max(col.waterY, L) : L
          if (col.waterKind !== WaterKind.Sea) col.waterKind = WaterKind.River
        }
        col.waterDist = 0
      } else if (col.waterKind !== WaterKind.Sea || col.waterY < 0) {
        const bank = 5 + Math.min(BANK_MAX - 5, relief * 0.6)
        if (edge < bank) {
          if (col.height >= L + 1) {
            const target = L + 1 + (col.height - L - 1) * smoothstep(0, bank, edge)
            col.height = Math.max(L + 0.5, Math.min(col.height, target))
          } else {
            // 地面低于水位（悬河、宽谷）：筑一道缓坡堤岸，堤外渐落回原地
            col.height = lerp(L + 0.5, col.height, smoothstep(bank * 0.35, bank, edge))
          }
        }
        if (edge < col.waterDist) {
          col.waterDist = edge
          if (col.waterKind === WaterKind.None) col.waterKind = WaterKind.River
        }
        if (gorgeWall > 0 && edge < 70) {
          const n = 0.75 + 0.5 * (0.5 + 0.5 * this.nWidth(x / 24 + 90, z / 24))
          const wall = L + 2 + gorgeWall * n * smoothstep(0, 5, edge) * (1 - smoothstep(40, 70, edge))
          col.height = Math.max(col.height, wall)
        }
      }
    }

    /* 湖泊 */
    const lk = this.lakes.query(x, z)
    if (lk) {
      const L = lk.lake.level
      const rr = lk.r + 0.12 * this.nWidth(x / 22 + 9, z / 22)
      if (rr < 1) {
        col.height = Math.min(col.height, L - 1 - Math.round(4 * (1 - rr)))
        col.waterY = L
        col.waterKind = WaterKind.Lake
        col.waterDist = 0
      } else if (rr < 1.45 && col.waterY < 0) {
        // 湖岸只收一圈窄边：庐山这样临湖拔起的山不被压平
        const target = L + 1 + (col.height - L - 1) * smoothstep(1, 1.45, rr)
        col.height = Math.max(L + 0.5, Math.min(col.height, target))
        const dist = (rr - 1) * Math.min(lk.lake.rx, lk.lake.rz)
        if (dist < col.waterDist) {
          col.waterDist = dist
          col.waterKind = WaterKind.Lake
        }
      }
    }

    /* 地标修改器（按注册顺序） */
    for (const m of this.modifiers) if (x >= m.minX && x <= m.maxX && z >= m.minZ && z <= m.maxZ) m.apply(col)

    col.height = clamp(col.height, 1, WORLD_HEIGHT - 20)
    return col
  }

  /**
   * 地域地貌（按宏观类型在周围的占比平滑叠加，不在区域边上起硬坎）：
   *  - 喀斯特：拔地而起的石灰岩孤峰（峰林），峰间是平坦的谷地与水田；
   *  - 黄土：流水切出的树枝状沟壑，塬面与坡上是一级级梯田；
   *  - 沙漠：成行的新月形沙丘。
   */
  private regional(x: number, z: number, h: number, relief: number): number {
    const M = this.macro
    let karst = 0
    let loess = 0
    let desert = 0
    for (const [ox, oz] of KIND_TAPS) {
      const k = M.kind(x + ox, z + oz)
      if (k === MacroKind.Karst) karst++
      else if (k === MacroKind.Loess) loess++
      else if (k === MacroKind.Desert) desert++
    }
    const n = KIND_TAPS.length
    if (karst) h += this.karstTower(x, z) * smoothstep(0, 1, karst / n)
    if (loess) {
      const w = smoothstep(0, 1, loess / n)
      const g = Math.abs(fbm(this.nGully, x / 70, z / 70, 3))
      const gully = smoothstep(0.16, 0.02, g)
      h -= gully * (6 + Math.min(14, relief * 0.8)) * w
      const q = h / 2
      const fr = q - Math.floor(q)
      h = lerp(h, (Math.floor(q) + smoothstep(0.7, 1, fr)) * 2, 0.9 * w * (1 - gully))
    }
    if (desert) {
      const warp = this.nGully(x / 90, z / 90) * 2.5 + this.nBump(x / 60, z / 60)
      h += Math.pow(1 - Math.abs(Math.sin(x / 23 + warp)), 2.2) * 7 * (desert / n)
    }
    return h
  }

  /** 峰林：每 15 格一格抖动的中心，约八成有峰；峰壁近乎直立、峰顶圆，脚下一圈缓坡 */
  private karstTower(x: number, z: number): number {
    const S = 15
    const gx = Math.floor(x / S)
    const gz = Math.floor(z / S)
    let best = 0
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = gx + i
        const cz = gz + j
        if (hashUnit(hash2i(cx, cz, 7717)) < 0.22) continue
        const px = (cx + 0.2 + 0.6 * hashUnit(hash2i(cx, cz, 7723))) * S
        const pz = (cz + 0.2 + 0.6 * hashUnit(hash2i(cx, cz, 7727))) * S
        const r = 3.2 + 3.4 * hashUnit(hash2i(cx, cz, 7729))
        const H = 14 + 26 * hashUnit(hash2i(cx, cz, 7741))
        const d = (Math.hypot(x - px, z - pz) / r) * (1 + 0.18 * this.nBump(x / 6, z / 6))
        if (d >= 1.35) continue
        const f = d < 1 ? Math.pow(1 - d * d * d, 0.45) : (0.12 * (1.35 - d)) / 0.35
        best = Math.max(best, H * f)
      }
    return best
  }

  /**
   * 农田：错缝的田块（12 × 9 格），田埂留草；平原、盆地成片，别处零散。
   * 秦岭—淮河以南是水田，以北是麦田，间有休耕地。
   */
  private fieldAt(x: number, z: number, lat: number, kind: number): number {
    const PX = 12
    const PZ = 9
    const row = Math.floor(z / PZ)
    const off = (((row * 5) % PX) + PX) % PX
    const col = Math.floor((x + off) / PX)
    if (x + off - col * PX === 0 || z - row * PZ === 0) return 0
    const u = hashUnit(hash2i(col, row, 9173))
    const farm = kind === MacroKind.Plain || kind === MacroKind.RedBasin ? 0.72 : kind === MacroKind.Karst ? 0.55 : 0.42
    const cluster = 0.5 + 0.5 * this.nMisc(x / 90 + 17, z / 90)
    if (u > farm * (0.4 + 0.8 * cluster)) return 0
    if (lat < 32.3 + (u - 0.5) * 1.2) return 2
    return u < farm * 0.22 ? 3 : 1
  }

  /** 地表高度（方块 Y，整数）；includeWater 为真时取水面 */
  surfaceHeightAt(x: number, z: number, includeWater = false): number {
    const c = this.column(Math.floor(x), Math.floor(z))
    const y = Math.floor(c.height)
    return includeWater && c.waterY >= 0 ? Math.max(y, c.waterY) : y
  }

  /** 由一列及其坡度得到完整取样 */
  private finish(c: TerrainColumn, slope: number): TerrainSample {
    const surfaceY = Math.floor(c.height)
    const inWater = c.waterY > surfaceY
    const lat = this.P.latOf(c.z)
    const lng = this.P.lngOf(c.x)
    const macroKind = this.macro.kind(c.x, c.z)
    const noise = this.nMisc(c.x / 120, c.z / 120)
    const biome = resolveBiome({
      lat,
      lng,
      height: surfaceY,
      slope,
      waterDistance: c.waterDist,
      waterKind: c.waterKind,
      inWater,
      override: c.biomeOverride,
      macroKind,
      relief: this.macro.relief(c.x, c.z),
      noise,
    })
    const bd = biomeDef(biome)
    let top: BlockId = bd.surface.top
    let soil: BlockId = bd.surface.soil
    let rock: BlockId = bd.surface.rock
    let soilDepth = bd.surface.soilDepth
    const n2 = this.nMisc(c.x / 9 + 300, c.z / 9)

    if (macroKind === MacroKind.Loess && biome !== BiomeId.Snow) {
      soil = B.LOESS
      soilDepth = 6
      if (slope > 0.9 || n2 > 0.35) top = B.LOESS
    } else if (lat < 27.5 && (biome === BiomeId.Hillside || biome === BiomeId.Mountain)) soil = B.RED_EARTH
    if ((biome === BiomeId.Mountain || biome === BiomeId.Hillside) && slope > 2.6) {
      // 陡坡裸岩：土层也换成岩层，台阶侧面不出一道道土带
      top = n2 > 0 ? B.ROCK : B.STONE
      soil = rock
    }
    if (macroKind === MacroKind.Karst) {
      // 峰林是灰白石灰岩：陡处露岩，平处红壤
      rock = B.LIMESTONE
      if (biome === BiomeId.Cliff || slope > 2.2) {
        top = B.LIMESTONE
        soil = B.LIMESTONE
      }
    } else if (macroKind === MacroKind.RedBasin) {
      // 巴蜀紫色土：坡上常露土
      soil = B.PURPLE_EARTH
      if (slope > 1.1 && n2 > 0.1) top = B.PURPLE_EARTH
    }
    if (biome === BiomeId.Taiga || (lat > 43 && lng > 121 && biome === BiomeId.Plain)) soil = B.BLACK_EARTH
    if (biome === BiomeId.Plateau && n2 > 0.45) top = B.GRAVEL
    if (biome === BiomeId.Snow && slope > 2.2) top = B.ROCK

    if (inWater) {
      const depth = c.waterY - surfaceY
      if (c.waterKind === WaterKind.Sea) top = depth > 6 ? B.GRAVEL : B.SAND
      else top = n2 > 0.25 ? B.GRAVEL : depth > 3 ? B.MUD : lat < 30 && n2 < -0.3 ? B.MUD : B.SAND
      soil = top === B.MUD ? B.MUD : B.SAND
      soilDepth = 2
    } else if (c.waterDist < 1.6 && c.waterKind !== WaterKind.None && biome !== BiomeId.Cliff) {
      top = c.waterKind === WaterKind.Sea ? B.SAND : n2 > 0.3 ? B.GRAVEL : B.SAND
      soil = B.SAND
    } else if (c.waterKind === WaterKind.Sea && surfaceY <= SEA_LEVEL + 1) {
      top = B.SAND
      soil = B.SAND
    }
    if (c.paved) {
      top = B.PAVING
      soil = B.DIRT
    }
    let field = 0
    if (
      top === B.GRASS &&
      !inWater &&
      c.landmark < 0 &&
      c.waterDist > 3 &&
      yToMeters(surfaceY) < 1500 &&
      (biome === BiomeId.Plain || ((biome === BiomeId.Karst || biome === BiomeId.Tropical || biome === BiomeId.Hillside) && slope < 0.6) || (biome === BiomeId.Steppe && macroKind === MacroKind.Loess && slope < 0.6))
    )
      field = this.fieldAt(c.x, c.z, lat, macroKind)
    return {
      field,
      surfaceY,
      waterY: inWater ? c.waterY : -1,
      waterKind: c.waterKind,
      slope,
      biome,
      tintZone: tintZoneOf(biome, yToMeters(surfaceY), lat, noise, hashUnit(hash2i(c.x, c.z, 7331))),
      topBlock: top,
      soilBlock: soil,
      rockBlock: rock,
      soilDepth,
      waterDistance: inWater ? 0 : c.waterDist,
      landmark: c.landmark,
      paved: c.paved,
    }
  }

  sample(x: number, z: number): TerrainSample {
    const c = this.column(x, z)
    const hN = this.column(x, z - 1).height
    const hS = this.column(x, z + 1).height
    const hE = this.column(x + 1, z).height
    const hW = this.column(x - 1, z).height
    const slope = Math.max(Math.abs(hN - c.height), Math.abs(hS - c.height), Math.abs(hE - c.height), Math.abs(hW - c.height))
    return this.finish(c, slope)
  }

  /**
   * 稀疏格点取样（覆盖图用）：每 step 方块取一列，坡度由相邻格点差分估计。
   * 返回 (n+2)² 个格点（含一圈外边），外边只用于侧面判断。
   */
  lattice(x0: number, z0: number, n: number, step: number): { cols: TerrainColumn[]; samples: TerrainSample[] } {
    const W = n + 2
    const cols: TerrainColumn[] = new Array(W * W)
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) cols[j * W + i] = this.column(x0 + (i - 1) * step + (step >> 1), z0 + (j - 1) * step + (step >> 1))
    const samples: TerrainSample[] = new Array(n * n)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = (j + 1) * W + (i + 1)
        const y = cols[k].height
        const slope = Math.max(Math.abs(cols[k - 1].height - y), Math.abs(cols[k + 1].height - y), Math.abs(cols[k - W].height - y), Math.abs(cols[k + W].height - y)) / step
        samples[j * n + i] = this.finish(cols[k], slope)
      }
    return { cols, samples }
  }

  /** 一次取样整块区域（外扩 1 格求坡度） */
  region(x0: number, z0: number, w: number, h: number): TerrainRegion {
    const W = w + 2
    const H = h + 2
    const cols: TerrainColumn[] = new Array(W * H)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) cols[j * W + i] = this.column(x0 - 1 + i, z0 - 1 + j)
    const samples: TerrainSample[] = new Array(w * h)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const k = (j + 1) * W + (i + 1)
        const c = cols[k]
        const f = (o: number) => Math.floor(cols[o].height)
        const y = Math.floor(c.height)
        const slope = Math.max(Math.abs(f(k - 1) - y), Math.abs(f(k + 1) - y), Math.abs(f(k - W) - y), Math.abs(f(k + W) - y))
        samples[j * w + i] = this.finish(c, slope)
      }
    return {
      x0,
      z0,
      w,
      h,
      samples,
      at: (x: number, z: number) => samples[(z - z0) * w + (x - x0)],
    }
  }
}
