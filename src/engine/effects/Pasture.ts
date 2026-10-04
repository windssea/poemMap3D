/**
 * 牲畜的活动场地检查（纯函数，可单测）。
 * pasture：可站的格（x * 65536 + z）；margin：体型净空——牛马四周一格也得是可站格，羊猪鸡只看脚下一格。
 */
export type CellSet = ReadonlySet<number>

const key = (x: number, z: number) => x * 65536 + z

/** 这一格能不能站（连同体型净空） */
export function standable(pasture: CellSet, x: number, z: number, margin: number): boolean {
  const cx = Math.floor(x)
  const cz = Math.floor(z)
  for (let dz = -margin; dz <= margin; dz++) for (let dx = -margin; dx <= margin; dx++) if (!pasture.has(key(cx + dx, cz + dz))) return false
  return true
}

/**
 * 直线走过去，沿途每一格都能站、相邻两格地面高差不超过一格（不跨陡坎）。
 * height：取地面高度（省略时不查高差）
 */
export function segmentClear(pasture: CellSet, x0: number, z0: number, x1: number, z1: number, margin: number, height?: (x: number, z: number) => number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.25))
  let px = Math.floor(x0)
  let pz = Math.floor(z0)
  let ph = height ? height(px, pz) : 0
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    const z = z0 + ((z1 - z0) * i) / n
    const cx = Math.floor(x)
    const cz = Math.floor(z)
    if (cx === px && cz === pz) continue
    if (!standable(pasture, x, z, margin)) return false
    if (height) {
      const h = height(cx, cz)
      if (Math.abs(h - ph) > 1) return false
      ph = h
    }
    px = cx
    pz = cz
  }
  return true
}
