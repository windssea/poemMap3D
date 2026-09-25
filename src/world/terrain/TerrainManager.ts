import { clamp, lerp, smoothstep } from '../../utils/math'
import { createSimplex2D, fbm, ridged, type Noise2D } from '../../utils/noise'
import { B } from '../block/Blocks'
import type { BlockId } from '../block/BlockState'
import { BiomeId } from '../biome/BiomeId'
import { biomeDef } from '../biome/BiomeRegistry'
import { resolveBiome } from '../biome/BiomeResolver'
import { SEA_LEVEL, WORLD_HEIGHT } from '../coordinate/constants'
import { type FocusProjection, getProjection } from '../coordinate/GeoProjection'
import { MacroKind, type MacroSampler } from '../generation/geography/MacroGeography'
import type { LakeManager } from '../water/LakeManager'
import { BANK_MAX, type RiverManager } from '../water/RiverManager'
import { WorldConfig } from '../WorldConfig'
import { type TerrainColumn, type TerrainModifier, type TerrainSample, WaterKind } from './TerrainSample'

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
  private readonly P: FocusProjection
  private readonly modifiers: TerrainModifier[]

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
    this.P = getProjection()
    this.modifiers = modifiers
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
    const amp = Math.min(24, 0.7 + relief * 0.95)
    const d = fbm(this.nDetail, x / 52, z / 52, 3)
    const r = ridged(this.nRidge, x / 96, z / 96, 3) - 0.45
    const bump = this.nBump(x / 14, z / 14)
    h += d * amp + r * amp * 0.9 * smoothstep(3, 10, relief) + bump * (0.6 + 0.08 * amp)

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
      const hw = rv.halfWidth * (1 + 0.3 * this.nWidth(x / 70, z / 70) + 0.1 * this.nWidth(x / 18 + 50, z / 18))
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
          const target = L + 1 + (col.height - L - 1) * smoothstep(0, bank, edge)
          col.height = Math.max(L + 0.5, Math.min(col.height, target))
        }
        if (edge < col.waterDist) {
          col.waterDist = edge
          if (col.waterKind === WaterKind.None) col.waterKind = WaterKind.River
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
      } else if (rr < 2.2 && col.waterY < 0) {
        const target = L + 1 + (col.height - L - 1) * smoothstep(1, 2.2, rr)
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
    if (biome === BiomeId.Mountain && slope > 1.8) top = n2 > 0 ? B.ROCK : B.STONE
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
    return {
      surfaceY,
      waterY: inWater ? c.waterY : -1,
      waterKind: c.waterKind,
      slope,
      biome,
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
