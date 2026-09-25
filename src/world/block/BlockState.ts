import { type Axis, type Direction, mirrorDirection, rotateAxis, rotateDirection } from './Direction'

export type BlockId = number
/** 打包后的方块状态：Chunk 里存的就是它（16 位） */
export type PackedState = number

/**
 * 方块状态。方向、半砖、轴向等都通过状态表达，不另建 Mesh。
 *
 * 打包格式（16 位）：
 *   bit 0–7   id
 *   bit 8–9   facing（北东南西）
 *   bit 10    half（0 下 / 1 上）
 *   bit 11–12 axis（Y / X / Z）
 *   bit 13–15 variant / level（0–7）
 */
export interface BlockState {
  id: BlockId
  facing?: Direction
  axis?: Axis
  half?: 'top' | 'bottom'
  variant?: number
  level?: number
}

export const MAX_BLOCK_ID = 255

export function packState(s: BlockState): PackedState {
  const v = s.level ?? s.variant ?? 0
  return (
    (s.id & 0xff) |
    (((s.facing ?? 0) & 3) << 8) |
    ((s.half === 'top' ? 1 : 0) << 10) |
    (((s.axis ?? 0) & 3) << 11) |
    ((v & 7) << 13)
  )
}

export function unpackState(p: PackedState): BlockState {
  return {
    id: stateId(p),
    facing: stateFacing(p),
    half: stateHalf(p) ? 'top' : 'bottom',
    axis: stateAxis(p),
    variant: stateVariant(p),
  }
}

export const stateId = (p: PackedState): BlockId => p & 0xff
export const stateFacing = (p: PackedState): Direction => ((p >> 8) & 3) as Direction
export const stateHalf = (p: PackedState): 0 | 1 => ((p >> 10) & 1) as 0 | 1
export const stateAxis = (p: PackedState): Axis => ((p >> 11) & 3) as Axis
export const stateVariant = (p: PackedState): number => (p >> 13) & 7

export const withFacing = (p: PackedState, d: Direction): PackedState => (p & ~(3 << 8)) | ((d & 3) << 8)
export const withAxis = (p: PackedState, a: Axis): PackedState => (p & ~(3 << 11)) | ((a & 3) << 11)

/** 状态随结构旋转（俯视顺时针 quarter 个 90°） */
export function rotateState(p: PackedState, quarter: number): PackedState {
  return withAxis(withFacing(p, rotateDirection(stateFacing(p), quarter)), rotateAxis(stateAxis(p), quarter))
}

export function mirrorState(p: PackedState, axis: 'x' | 'z'): PackedState {
  return withFacing(p, mirrorDirection(stateFacing(p), axis))
}

/** 只含 id 的默认状态 */
export const S = (id: BlockId): PackedState => id & 0xff
