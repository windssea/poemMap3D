import { Random } from './math'

export type Noise2D = (x: number, y: number) => number

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const GRAD = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]

/** 带种子的二维 Simplex 噪声，输出约在 [-1, 1] */
export function createSimplex2D(seed: number): Noise2D {
  const rnd = new Random(seed)
  const perm = new Uint8Array(512)
  const p = Array.from({ length: 256 }, (_, i) => i)
  rnd.shuffle(p)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  return (x, y) => {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = 1 - i1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    let n = 0
    let tt = 0.5 - x0 * x0 - y0 * y0
    if (tt > 0) {
      const g = (perm[ii + perm[jj]] & 7) * 2
      tt *= tt
      n += tt * tt * (GRAD[g] * x0 + GRAD[g + 1] * y0)
    }
    tt = 0.5 - x1 * x1 - y1 * y1
    if (tt > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2
      tt *= tt
      n += tt * tt * (GRAD[g] * x1 + GRAD[g + 1] * y1)
    }
    tt = 0.5 - x2 * x2 - y2 * y2
    if (tt > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2
      tt *= tt
      n += tt * tt * (GRAD[g] * x2 + GRAD[g + 1] * y2)
    }
    return 70 * n
  }
}

/** 分形布朗运动，归一到约 [-1, 1] */
export function fbm(n: Noise2D, x: number, y: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * n(x * freq, y * freq)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** 脊状噪声，[0, ~1]，适合山脊 */
export function ridged(n: Noise2D, x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 0.55
  let freq = 1
  let weight = 1
  for (let i = 0; i < octaves; i++) {
    let v = 1 - Math.abs(n(x * freq, y * freq))
    v *= v
    v *= weight
    weight = Math.min(1, v * 1.6)
    sum += v * amp
    amp *= 0.5
    freq *= 2.1
  }
  return sum
}
