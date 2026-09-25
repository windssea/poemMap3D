import * as THREE from 'three'
import { MaterialTokens } from '../../config/palette'
import { TEXTURES, type TexturePattern } from '../../world/block/BlockTextures'
import { hash3i, hashUnit } from '../../utils/math'

export const TILE = 16

type RGBA = [number, number, number, number]
const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 方块贴图数组：每张 16×16 像素，按 BlockTextures 表的图案与色组程序生成（不使用任何现成贴图）。
 *
 * 通道约定：
 *  - Solid 层：alpha 为「染色遮罩」，255 = 不染色，0 = 完全按生物群系色染（草皮口、草顶）；
 *  - Cutout 层：alpha 为镂空（< 0.5 丢弃），染色作用于全部像素；
 *  - Translucent 层：alpha 为不透明度。
 */
export function generateTexturePixels(): Uint8Array {
  const n = TEXTURES.length
  const data = new Uint8Array(TILE * TILE * 4 * n)
  TEXTURES.forEach((t, layer) => {
    const cols = MaterialTokens[t.tokens].map(hex)
    const seed = layer * 101 + 7
    const rnd = (x: number, y: number, s = 0) => hashUnit(hash3i(x, y, s, seed))
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const px = paint(t.pattern, x, y, cols, rnd)
        const o = ((layer * TILE + y) * TILE + x) * 4
        data[o] = px[0]
        data[o + 1] = px[1]
        data[o + 2] = px[2]
        data[o + 3] = px[3]
      }
  })
  return data
}

const SNOW = MaterialTokens.snow.map(hex)
const GOLD = MaterialTokens.gold.map(hex)
const pick = (cols: [number, number, number][], i: number, a = 255): RGBA => [...cols[Math.max(0, Math.min(cols.length - 1, i))], a] as RGBA
/** 基础噪点：主色为主，辅以明暗 */
const noiseIdx = (r: number): number => (r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.92 ? 2 : 3)

function paint(p: TexturePattern, x: number, y: number, c: [number, number, number][], rnd: (x: number, y: number, s?: number) => number): RGBA {
  const r = rnd(x, y)
  const clump = rnd(x >> 1, y >> 1, 5)
  switch (p) {
    case 'noise':
      return pick(c, noiseIdx(r * 0.7 + clump * 0.3))
    case 'grassTop':
      return pick(c, noiseIdx(r * 0.6 + clump * 0.4), 0)
    case 'grassSide': {
      const fringe = y < 3 || (y === 3 && r < 0.55) || (y === 4 && r < 0.18)
      if (fringe) return [224 - (r * 40) | 0, 224 - (r * 40) | 0, 224 - (r * 40) | 0, 0]
      return pick(c, noiseIdx(r * 0.7 + clump * 0.3))
    }
    case 'snowSide': {
      const fringe = y < 3 || (y === 3 && r < 0.6) || (y === 4 && r < 0.2)
      if (fringe) return [...SNOW[r < 0.8 ? 0 : 3], 255] as RGBA
      return pick(c, noiseIdx(r * 0.7 + clump * 0.3))
    }
    case 'strata': {
      const band = (y + (rnd(0, y >> 2, 9) < 0.5 ? 0 : 1)) % 5
      const base = band === 0 ? 3 : band === 3 ? 2 : 0
      return pick(c, r < 0.2 ? 1 : base)
    }
    case 'cobble': {
      // 石块：以 4×4 网格上的抖动点为中心的 Voronoi，缝为暗色
      let d1 = 99
      let d2 = 99
      for (let gy = -1; gy <= 4; gy++)
        for (let gx = -1; gx <= 4; gx++) {
          const cx = gx * 4 + rnd(gx & 3, gy & 3, 21) * 4
          const cy = gy * 4 + rnd(gx & 3, gy & 3, 22) * 4
          const d = Math.hypot(x - cx, y - cy)
          if (d < d1) {
            d2 = d1
            d1 = d
          } else if (d < d2) d2 = d
        }
      if (d2 - d1 < 1) return pick(c, 2)
      return pick(c, r < 0.25 ? 3 : r < 0.5 ? 1 : 0)
    }
    case 'speckle':
      return pick(c, r < 0.08 ? 3 : r < 0.25 ? 2 : r < 0.45 ? 1 : 0)
    case 'logSide': {
      const col = rnd(x, 0, 3)
      const stripe = col < 0.3 ? 1 : col > 0.8 ? 2 : 0
      return pick(c, r < 0.12 ? 3 : stripe)
    }
    case 'logTop': {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5))
      if (d > 6.5) return pick(c, 2)
      return pick(c, Math.floor(d) % 2 === 0 ? 0 : 1)
    }
    case 'planks': {
      const row = y >> 2
      const seamY = (y & 3) === 3
      const seamX = (x + row * 5) % 16 === 0
      if (seamY || seamX) return pick(c, 3)
      return pick(c, r < 0.15 ? 1 : r > 0.85 ? 2 : 0)
    }
    case 'leaves': {
      if (r < 0.035) return [0, 0, 0, 0]
      const shade = clump < 0.35 ? 3 : clump < 0.6 ? 1 : r < 0.3 ? 2 : 0
      return pick(c, shade)
    }
    case 'needles': {
      if (r < 0.06) return [0, 0, 0, 0]
      const diag = (x + y * 2) % 5 === 0 || (x * 2 - y + 16) % 7 === 0
      return pick(c, diag ? 2 : clump < 0.4 ? 3 : r < 0.5 ? 1 : 0)
    }
    case 'willowLeaves': {
      const col = rnd(x, 0, 4)
      if (r < 0.04 || (col < 0.2 && r < 0.18)) return [0, 0, 0, 0]
      return pick(c, col > 0.7 ? 2 : col < 0.4 ? 1 : (y + (col * 8) | 0) % 5 === 0 ? 3 : 0)
    }
    case 'blossom': {
      if (r < 0.05) return [0, 0, 0, 0]
      return pick(c, clump < 0.25 ? 3 : r < 0.35 ? 2 : r < 0.6 ? 1 : 0)
    }
    case 'bambooStalk': {
      if (x < 6 || x > 9) return pick(c, 1)
      if (y === 0 || y === 8) return pick(c, 3)
      return pick(c, x === 7 ? 2 : x === 9 ? 1 : 0)
    }
    case 'bambooLeaves': {
      if (r < 0.1) return [0, 0, 0, 0]
      const stroke = (x - y + 32) % 6 < 2
      return pick(c, stroke ? 2 : clump < 0.4 ? 3 : 0)
    }
    case 'cross': {
      const col = rnd(x, 0, 6)
      const h = 4 + col * 12
      if (15 - y > h || col < 0.35) return [0, 0, 0, 0]
      return pick(c, y < 5 ? 3 : r < 0.3 ? 1 : 0)
    }
    case 'reed': {
      const stalk = x === 4 || x === 8 || x === 12
      if (!stalk) return [0, 0, 0, 0]
      const head = y < 4 && x !== 12
      return head ? pick(c, 3) : pick(c, r < 0.3 ? 1 : 0)
    }
    case 'flower': {
      const d = Math.hypot(x - 7.5, y - 5)
      if (d < 2.6) return pick(c, d < 1.2 ? 1 : 0)
      if ((x === 7 || x === 8) && y > 6) return pick(c, 2)
      if (y === 11 && (x === 6 || x === 9)) return pick(c, 3)
      return [0, 0, 0, 0]
    }
    case 'plaster':
      return pick(c, y === 15 ? 3 : r < 0.1 ? 1 : r > 0.9 ? 2 : 0)
    case 'lacquer':
      return pick(c, rnd(x, 0, 8) < 0.25 ? 1 : r < 0.1 ? 3 : r > 0.9 ? 2 : 0)
    case 'roofTiles': {
      // 筒瓦：竖向瓦垄，每 4 行一道檐影
      const ridge = x % 4
      const row = y % 4 === 3
      if (row) return pick(c, 3)
      return pick(c, ridge === 0 ? 2 : ridge === 3 ? 1 : r < 0.1 ? 1 : 0)
    }
    case 'bricks': {
      const row = y >> 2
      const off = row % 2 ? 4 : 0
      if ((y & 3) === 3 || (x + off) % 8 === 7) return pick(c, 3)
      return pick(c, r < 0.2 ? 1 : r > 0.85 ? 2 : 0)
    }
    case 'bigBricks': {
      const row = Math.floor(y / 5)
      const off = row % 2 ? 5 : 0
      if (y % 5 === 4 || (x + off) % 10 === 9) return pick(c, 3)
      return pick(c, r < 0.25 ? 1 : r > 0.85 ? 2 : 0)
    }
    case 'marble': {
      const vein = Math.abs(Math.sin((x + y * 0.6) * 0.7 + rnd(0, y >> 2, 11) * 2)) < 0.12
      return pick(c, vein ? 3 : r < 0.15 ? 1 : r > 0.85 ? 2 : 0)
    }
    case 'paving': {
      if (x % 8 === 7 || y % 8 === 7) return pick(c, 3)
      return pick(c, clump < 0.3 ? 1 : r > 0.88 ? 2 : 0)
    }
    case 'lattice': {
      if (x === 0 || x === 15 || y === 0 || y === 15) return pick(c, 0)
      if (x % 3 === 0 || y % 3 === 0) return pick(c, 1)
      return pick(c, r < 0.3 ? 3 : 2)
    }
    case 'gold':
      return pick(c, (x + y) % 7 === 0 ? 2 : r < 0.2 ? 3 : r < 0.5 ? 1 : 0)
    case 'lantern': {
      if (y < 2 || y > 13) return [...GOLD[0], 255] as RGBA
      const d = Math.abs(x - 7.5)
      return pick(c, d < 2.5 ? 2 : d < 5 ? 1 : x % 5 === 0 ? 3 : 0)
    }
    case 'thatch': {
      const stroke = (x + y * 3 + ((rnd(x, 0, 12) * 4) | 0)) % 5 === 0
      return pick(c, stroke ? 3 : r < 0.3 ? 1 : r > 0.85 ? 2 : 0)
    }
    case 'water':
      return pick(c, (x + y * 3) % 11 === 0 ? 2 : clump < 0.3 ? 1 : 0, 190)
    case 'ice': {
      const crack = (x * 3 + y) % 13 === 0
      return pick(c, crack ? 2 : r < 0.3 ? 1 : 0, 200)
    }
    case 'pebble':
      return pick(c, r < 0.3 ? 1 : r > 0.8 ? 2 : 0)
    case 'cloth': {
      // 布：细密经纬，边上一道镶边
      if (y === 1 || y === 14) return pick(c, 3)
      return pick(c, (x + y) % 4 === 0 ? 2 : r < 0.2 ? 1 : 0)
    }
  }
}

/** 生成 WebGL2 贴图数组（带 mipmap，放大时最近邻，保留像素块感） */
export function createBlockTextureArray(anisotropy = 4): THREE.DataArrayTexture {
  const tex = new THREE.DataArrayTexture(generateTexturePixels(), TILE, TILE, TEXTURES.length)
  tex.format = THREE.RGBAFormat
  tex.type = THREE.UnsignedByteType
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapLinearFilter
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.anisotropy = anisotropy
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
