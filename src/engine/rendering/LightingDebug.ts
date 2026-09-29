/** 光照调试。滑条和质量开关都写进这条状态，环境系统每帧读它来改真正的灯和 uniform。 */
export type LightView = 'final' | 'albedo' | 'ao' | 'face' | 'shadow' | 'fog'

/** 世界几何的调试保留范围：全部 / 只近中景 / 只远景 / 全隐藏（只看天空） */
export type WorldLayer = 'all' | 'near' | 'far' | 'none'

export interface LightingTweaks {
  /** 顶点 AO 曲线强度，0 为不遮蔽 */
  ao: number
  /** 天空光倍数：半球光和对向补光 */
  sky: number
  /** 太阳 / 月光倍数，不改时辰里的方向 */
  sun: number
  /** 乘在该时辰的曝光上 */
  exposure: number
  /** 面向明暗强度，只作用间接光 */
  face: number
  shadow: boolean
  fog: boolean
  view: LightView
  /** 保留哪一层世界几何（Phase 0 定位白色山形用，'all' 时完全不干预） */
  world: WorldLayer
}

export const VIEW_CODE: Record<LightView, number> = { final: 0, albedo: 1, ao: 2, face: 3, shadow: 4, fog: 5 }

export const defaultLighting = (shadow: boolean): LightingTweaks => ({
  ao: 1,
  sky: 1,
  sun: 1,
  exposure: 1,
  face: 1,
  shadow,
  fog: true,
  view: 'final',
  world: 'all',
})

/** 隔离实验：一次只留一条光，用来看暗部是哪一层压出来的 */
export const ISOLATION: { id: string; label: string; patch: Partial<LightingTweaks> }[] = [
  { id: 'albedo', label: 'A 材质', patch: { view: 'albedo', ao: 0, sky: 0, sun: 0, face: 0, shadow: false, fog: false } },
  { id: 'sky', label: 'B 天空', patch: { view: 'final', ao: 0, sky: 1, sun: 0, face: 0, shadow: false, fog: false } },
  { id: 'sun', label: 'C 太阳', patch: { view: 'final', ao: 0, sky: 0, sun: 1, face: 0, shadow: false, fog: false } },
  { id: 'ao', label: 'D 顶点AO', patch: { view: 'ao', ao: 1, sky: 0, sun: 0, face: 0, shadow: false, fog: false } },
  { id: 'shadow', label: 'E 阴影', patch: { view: 'final', ao: 0, sky: 0, sun: 1, face: 0, shadow: true, fog: false } },
]

/**
 * Phase 0 根因排查（任务书《山河诗卷 V3.2》第一部分）：固定机位下逐项关掉一层，
 * 确定「背景白色阶梯山形」的真实来源。全部只在现有 LightingDebug 体系上开基础位。
 */
export const PHASE0: { id: string; label: string; patch: Partial<LightingTweaks> }[] = [
  { id: 'skyOnly', label: 'P0 只看天空', patch: { world: 'none', fog: false, shadow: false } },
  { id: 'noDistant', label: 'P0 无远景', patch: { world: 'near' } },
  { id: 'farOnly', label: 'P0 只远景', patch: { world: 'far', fog: false, shadow: false } },
  { id: 'fogFactor', label: 'P0 雾伪彩', patch: { view: 'fog', shadow: false } },
  { id: 'worldNoFog', label: 'P0 世界无雾', patch: { view: 'final', world: 'all', fog: false } },
]
