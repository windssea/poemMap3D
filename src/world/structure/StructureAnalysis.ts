import type { VoxelStructure } from './VoxelStructure'

const N6 = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
]
const k = (x: number, y: number, z: number) => `${x},${y},${z}`

export interface ConnectivityReport {
  /** 面相邻的连通块数量 */
  components: number
  /** 不与最底层相连的方块数（漂浮方块） */
  floating: number
  /** 各连通块大小 */
  sizes: number[]
}

/** 面相邻连通性分析：树与建筑都不允许出现漂浮方块 */
export function analyzeConnectivity(s: VoxelStructure): ConnectivityReport {
  const blocks = s.blocks
  const set = new Set(blocks.map((b) => k(b.x, b.y, b.z)))
  const seen = new Set<string>()
  const groundY = Math.max(s.bounds().minY, 0)
  const sizes: number[] = []
  let grounded = 0
  for (const b of blocks) {
    const start = k(b.x, b.y, b.z)
    if (seen.has(start)) continue
    let size = 0
    let touchesGround = false
    const stack = [[b.x, b.y, b.z]]
    seen.add(start)
    while (stack.length) {
      const [x, y, z] = stack.pop()!
      size++
      if (y <= groundY) touchesGround = true
      for (const [dx, dy, dz] of N6) {
        const nk = k(x + dx, y + dy, z + dz)
        if (set.has(nk) && !seen.has(nk)) {
          seen.add(nk)
          stack.push([x + dx, y + dy, z + dz])
        }
      }
    }
    sizes.push(size)
    if (touchesGround) grounded += size
  }
  return { components: sizes.length, floating: blocks.length - grounded, sizes }
}

/** 删去所有不与地面层（y ≤ 0，或结构最低层）面相连的方块 */
export function pruneFloating(s: VoxelStructure): VoxelStructure {
  const blocks = s.blocks
  const set = new Set(blocks.map((b) => k(b.x, b.y, b.z)))
  const groundY = Math.max(s.bounds().minY, 0)
  const keep = new Set<string>()
  const stack: number[][] = []
  for (const b of blocks)
    if (b.y <= groundY) {
      keep.add(k(b.x, b.y, b.z))
      stack.push([b.x, b.y, b.z])
    }
  while (stack.length) {
    const [x, y, z] = stack.pop()!
    for (const [dx, dy, dz] of N6) {
      const nk = k(x + dx, y + dy, z + dz)
      if (set.has(nk) && !keep.has(nk)) {
        keep.add(nk)
        stack.push([x + dx, y + dy, z + dz])
      }
    }
  }
  for (const b of blocks) if (!keep.has(k(b.x, b.y, b.z))) s.set(b.x, b.y, b.z, 0)
  return s
}
