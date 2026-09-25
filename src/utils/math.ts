export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}
export const invLerp = (a: number, b: number, v: number): number => clamp((v - a) / (b - a), 0, 1)
export const floorDiv = (a: number, b: number): number => Math.floor(a / b)
/** 始终为非负的取模（负坐标也正确） */
export const mod = (a: number, b: number): number => ((a % b) + b) % b

/* —— 确定性整数哈希：同一输入永远得到同一输出，与调用顺序无关 —— */

export function hash32(n: number): number {
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d)
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b)
  return (n ^ (n >>> 16)) >>> 0
}

export function hash2i(x: number, z: number, seed: number): number {
  return hash32(Math.imul(x | 0, 0x27d4eb2d) ^ hash32(Math.imul(z | 0, 0x165667b1) ^ hash32(seed | 0)))
}

export function hash3i(x: number, y: number, z: number, seed: number): number {
  return hash32(Math.imul(y | 0, 0x9e3779b1) ^ hash2i(x, z, seed))
}

/** 哈希 → [0, 1) */
export const hashUnit = (h: number): number => h / 4294967296

export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** 小而快的确定性随机数（mulberry32） */
export class Random {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }
  int(lo: number, hiInclusive: number): number {
    return lo + Math.floor(this.next() * (hiInclusive - lo + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }
  sign(): 1 | -1 {
    return this.next() < 0.5 ? -1 : 1
  }
  /** 按权重取下标 */
  weighted(weights: readonly number[]): number {
    let total = 0
    for (const w of weights) total += w
    let r = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r < 0) return i
    }
    return weights.length - 1
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      const t = arr[i]
      arr[i] = arr[j]
      arr[j] = t
    }
    return arr
  }
}
