export type Quality = 'low' | 'mid' | 'high'

export interface QualityPreset {
  label: string
  pixelRatio: number
  /** 近景区块物化半径（区块） */
  chunkRadius: number
  /** 远景（2×2×2 合并）区块半径 = 近景半径 × 此倍数；0 为不用远景 */
  farFactor: number
  /** 远景片（4×4×4 合并）铺到的半径（区块）：镜头放低时画面到天边都是体素山水 */
  coarseRadius: number
  shadows: boolean
  /** 每级阴影图边长 */
  shadowSize: number
  /** 级联数（近处高精度、远处低精度） */
  shadowCascades: number
  /** 粒子数量倍数 */
  particles: number
  workers: number
  anisotropy: number
  /** 每帧最多上传到 GPU 的区块数 */
  uploadsPerFrame: number
}

const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4

export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  low: { label: '轻', pixelRatio: 1, chunkRadius: 7, farFactor: 1.6, coarseRadius: 36, shadows: false, shadowSize: 1024, shadowCascades: 1, particles: 0.35, workers: Math.max(1, Math.min(2, cores - 1)), anisotropy: 1, uploadsPerFrame: 2 },
  mid: { label: '衡', pixelRatio: Math.min(dpr, 1.5), chunkRadius: 13, farFactor: 1.8, coarseRadius: 60, shadows: true, shadowSize: 1024, shadowCascades: 2, particles: 0.7, workers: Math.max(1, Math.min(3, cores - 1)), anisotropy: 4, uploadsPerFrame: 4 },
  high: { label: '高', pixelRatio: Math.min(dpr, 2), chunkRadius: 17, farFactor: 2.0, coarseRadius: 76, shadows: true, shadowSize: 2048, shadowCascades: 3, particles: 1, workers: Math.max(1, Math.min(5, cores - 1)), anisotropy: 8, uploadsPerFrame: 6 },
}

/** 画质：按设备给默认值，可切换；变化时通知订阅者 */
export class QualityManager {
  private level: Quality
  private readonly listeners = new Set<(q: Quality, p: QualityPreset) => void>()

  constructor(initial?: Quality) {
    const mobile = typeof matchMedia !== 'undefined' && (matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600)
    this.level = initial ?? (mobile ? 'low' : 'mid')
  }

  get quality(): Quality {
    return this.level
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level]
  }

  set(q: Quality): void {
    if (q === this.level) return
    this.level = q
    for (const fn of this.listeners) fn(q, this.preset)
  }

  onChange(fn: (q: Quality, p: QualityPreset) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}
