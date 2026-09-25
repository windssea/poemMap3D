/** 水平朝向：北 = -Z，东 = +X，南 = +Z，西 = -X */
export const Direction = { North: 0, East: 1, South: 2, West: 3 } as const
export type Direction = (typeof Direction)[keyof typeof Direction]

export const Axis = { Y: 0, X: 1, Z: 2 } as const
export type Axis = (typeof Axis)[keyof typeof Axis]

export const DIRECTION_VECTORS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]

export const DIRECTION_NAMES = ['north', 'east', 'south', 'west'] as const

/** 顺时针（俯视）旋转 quarter 个 90° */
export const rotateDirection = (d: Direction, quarter: number): Direction => ((((d + quarter) % 4) + 4) % 4) as Direction

export const oppositeDirection = (d: Direction): Direction => ((d + 2) % 4) as Direction

/** 镜像：axis = 'x' 表示沿 X 翻转（东西互换），'z' 表示南北互换 */
export function mirrorDirection(d: Direction, axis: 'x' | 'z'): Direction {
  if (axis === 'x') return d === Direction.East ? Direction.West : d === Direction.West ? Direction.East : d
  return d === Direction.North ? Direction.South : d === Direction.South ? Direction.North : d
}

export function rotateAxis(a: Axis, quarter: number): Axis {
  if (a === Axis.Y || (((quarter % 2) + 2) % 2) === 0) return a
  return a === Axis.X ? Axis.Z : Axis.X
}

/** 平面坐标绕原点顺时针旋转（与 rotateDirection 一致：北 → 东） */
export function rotateXZ(x: number, z: number, quarter: number): [number, number] {
  switch ((((quarter % 4) + 4) % 4)) {
    case 1:
      return [-z, x]
    case 2:
      return [-x, -z]
    case 3:
      return [z, -x]
    default:
      return [x, z]
  }
}

/** 六个面：0 +X，1 -X，2 +Y，3 -Y，4 +Z，5 -Z */
export const Face = { PX: 0, NX: 1, PY: 2, NY: 3, PZ: 4, NZ: 5 } as const
export type Face = (typeof Face)[keyof typeof Face]
export const FACE_NORMALS: readonly (readonly [number, number, number])[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]
