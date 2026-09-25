import { BiomeTint, FoliageTokens, MaterialTokens, type MaterialTokenKey } from '../../config/palette'
import { TintClass } from '../block/BlockDefinition'
import { B, Blocks } from '../block/Blocks'
import { TEXTURES } from '../block/BlockTextures'
import { BIOME_KEYS, BiomeId } from '../biome/BiomeId'
import { biomeDef } from '../biome/BiomeRegistry'
import type { WorldContext } from '../generation/WorldContext'
import { WorldConfig } from '../WorldConfig'

/** 一块覆盖图（全国代理）的格点数据，可在 Worker 间传递 */
export interface OverviewTileData {
  tx: number
  tz: number
  /** 块左上角世界坐标（方块） */
  x0: number
  z0: number
  n: number
  cell: number
  /** 地表 Y，(n+2)² 含外边 */
  surface: Int16Array
  /** 水面 Y，-1 为无水，(n+2)² */
  water: Int16Array
  /** 顶面颜色（sRGB 字节）与染色类别，n² */
  color: Uint8Array
  kind: Uint8Array
  /** 侧面颜色（sRGB 字节），n² */
  side: Uint8Array
}

export interface OverviewGrid {
  x0: number
  z0: number
  tilesX: number
  tilesZ: number
  n: number
  cell: number
}

const hexRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
const tokenColor = (key: MaterialTokenKey): [number, number, number] => hexRgb(MaterialTokens[key][0])
const blockColor = (id: number, face: 'top' | 'side'): [number, number, number] => {
  const tex = Blocks.get(id).faces[face]
  return tokenColor(TEXTURES.find((t) => t.key === tex)!.tokens)
}

/** 覆盖图网格：与区块网格对齐（原点为 16 的倍数） */
export function overviewGrid(ctx: WorldContext): OverviewGrid {
  const d = ctx.macro.d
  const cell = WorldConfig.overviewCell
  const n = WorldConfig.overviewTile
  const x0 = Math.floor(d.x0 / 16) * 16
  const z0 = Math.floor(d.z0 / 16) * 16
  const span = n * cell
  return { x0, z0, n, cell, tilesX: Math.ceil((d.x0 + d.w * d.cell - x0) / span), tilesZ: Math.ceil((d.z0 + d.h * d.cell - z0) / span) }
}

/**
 * 覆盖图输入：顶面（地表方块 / 林地色）、宏观地形、水面。
 * 不含完整的树与建筑，只把密林染成林色。
 */
export function buildOverviewTile(ctx: WorldContext, grid: OverviewGrid, tx: number, tz: number): OverviewTileData {
  const { n, cell } = grid
  const x0 = grid.x0 + tx * n * cell
  const z0 = grid.z0 + tz * n * cell
  const { cols, samples } = ctx.terrain.lattice(x0, z0, n, cell)
  const W = n + 2
  const surface = new Int16Array(W * W)
  const water = new Int16Array(W * W).fill(-1)
  for (let k = 0; k < W * W; k++) {
    const c = cols[k]
    surface[k] = Math.floor(c.height)
    if (c.waterY > c.height) water[k] = c.waterY
  }
  const color = new Uint8Array(n * n * 3)
  const side = new Uint8Array(n * n * 3)
  const kind = new Uint8Array(n * n)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const s = samples[j * n + i]
      const x = x0 + i * cell + (cell >> 1)
      const z = z0 + j * cell + (cell >> 1)
      const bd = biomeDef(s.biome)
      let rgb: [number, number, number]
      let k: number = TintClass.None
      const forest = s.waterY < 0 && bd.density[0] >= 4 && s.slope < 2.2 && ctx.trees.spaceClass(x, z, s.biome) === 0
      if (forest) {
        const evergreen = s.biome === BiomeId.Mountain || s.biome === BiomeId.Plateau
        rgb = hexRgb(evergreen ? FoliageTokens.pine : FoliageTokens.broad)
        const bf = hexRgb(BiomeTint[BIOME_KEYS[s.biome]].foliage)
        rgb = [(rgb[0] + bf[0]) >> 1, (rgb[1] + bf[1]) >> 1, (rgb[2] + bf[2]) >> 1]
        k = evergreen ? TintClass.Evergreen : TintClass.Deciduous
      } else if (s.topBlock === B.GRASS) {
        rgb = hexRgb(BiomeTint[BIOME_KEYS[s.biome]].grass)
        k = TintClass.Grass
      } else rgb = blockColor(s.topBlock, 'top')
      const o = (j * n + i) * 3
      color[o] = rgb[0]
      color[o + 1] = rgb[1]
      color[o + 2] = rgb[2]
      kind[j * n + i] = k
      const sd = blockColor(s.soilDepth > 0 ? s.soilBlock : s.rockBlock, 'side')
      side[o] = sd[0]
      side[o + 1] = sd[1]
      side[o + 2] = sd[2]
    }
  return { tx, tz, x0, z0, n, cell, surface, water, color, kind, side }
}

export const overviewTransferables = (t: OverviewTileData): ArrayBuffer[] => [t.surface, t.water, t.color, t.kind, t.side].map((a) => a.buffer as ArrayBuffer)
