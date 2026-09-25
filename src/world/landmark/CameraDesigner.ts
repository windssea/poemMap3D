import { BiomeId } from '../biome/BiomeId'
import { type FogMap, fogAt } from '../overview/EdgeFog'
import type { TerrainManager } from '../terrain/TerrainManager'
import type { TreePlacementSystem } from '../vegetation/TreePlacementSystem'
import type { CameraPreset } from './LandmarkDefinition'
import type { ResolvedLandmark } from './LandmarkRegistry'

const TAU = Math.PI * 2
const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a))

export interface DesignedView {
  preset: CameraPreset
  /** 注视点高度（方块 Y）：名楼取楼身三分之一处，而不是地面 */
  targetY: number
}

/**
 * 为一处地点设计镜头：在 16 个方位 × 3 个俯角 × 2 个距离里挑最好的一个。
 *  - 视线不被山体、树冠挡住（沿视线取样，离镜头越近的遮挡越要紧）；
 *  - 镜头离地（含树冠）留足高度，不钻进林子；
 *  - 建筑都朝南，偏好从南面看；
 *  - 前景有水（江、湖、河）加分——山水诗的地点多半临水；
 *  - 不进雾里。
 * 纯函数，按地形与植被数据计算，结果缓存。
 */
export function designCamera(lm: ResolvedLandmark, terrain: TerrainManager, trees: TreePlacementSystem, fog?: FogMap): DesignedView {
  /* 注视点：主体建筑的三分之一高处 */
  let top = lm.level
  for (const p of lm.placements) if (Math.hypot(p.x - lm.x, p.z - lm.z) < 14) top = Math.max(top, p.world.maxY)
  const tall = top - lm.level
  const targetY = lm.level + 1 + Math.min(16, tall * 0.35)
  const base = Math.max(55, Math.min(170, lm.def.radius * 2.2), tall * 2.4)

  const canopy = new Map<number, number>()
  /** 地表高度 + 树冠（密林约 13 格、疏林约 7 格）+ 地标建筑 */
  const ground = (x: number, z: number): number => {
    const xi = Math.floor(x)
    const zi = Math.floor(z)
    const k = xi * 73856093 ^ zi * 19349663
    const hit = canopy.get(k)
    if (hit !== undefined) return hit
    const s = terrain.sample(xi, zi)
    let h = Math.max(s.surfaceY, s.waterY)
    if (s.waterY < 0 && s.biome !== BiomeId.Desert && s.biome !== BiomeId.Gobi) {
      const sp = trees.spaceClass(xi, zi, s.biome)
      h += sp === 0 ? 13 : sp === 1 ? 7 : 1
    }
    canopy.set(k, h)
    return h
  }
  const wet = (x: number, z: number): boolean => {
    const c = terrain.column(Math.floor(x), Math.floor(z))
    return c.waterY >= 0 && c.height < c.waterY
  }

  let best: CameraPreset = { yaw: 0, pitch: 0.55, distance: base }
  let bestScore = -Infinity
  for (let i = 0; i < 16; i++) {
    const yaw = angleDelta(0, (i / 16) * TAU)
    for (const pitch of [0.42, 0.55, 0.7])
      for (const dm of [1, 1.3]) {
        const d = base * dm
        const cp = Math.cos(pitch)
        const cx = lm.x + Math.sin(yaw) * cp * d
        const cy = targetY + Math.sin(pitch) * d
        const cz = lm.z + Math.cos(yaw) * cp * d
        let score = 0
        /* 1. 视线 */
        for (let k = 1; k < 18; k++) {
          const t = k / 18
          const px = cx + (lm.x - cx) * t
          const py = cy + (targetY - cy) * t
          const pz = cz + (lm.z - cz) * t
          const g = ground(px, pz)
          if (py < g + 1.5) score -= 30 * (1.2 - t * 0.6)
        }
        /* 2. 镜头离地 */
        const clear = cy - ground(cx, cz)
        if (clear < 14) score -= (14 - clear) * 6
        /* 3. 从南面看（建筑朝南） */
        score -= Math.abs(angleDelta(yaw, 0)) * 5
        /* 4. 前景有水 */
        let water = 0
        for (let k = 2; k <= 8; k++) {
          const t = k / 10
          if (wet(cx + (lm.x - cx) * t, cz + (lm.z - cz) * t)) water++
        }
        score += Math.min(4, water) * 3
        /* 5. 俯角、距离偏好 */
        score -= Math.abs(pitch - 0.55) * 12 + (dm - 1) * 10
        /* 6. 不进雾 */
        if (fog && fogAt(fog, cx, cz) > 0.3) score -= 60
        if (score > bestScore) {
          bestScore = score
          best = { yaw, pitch, distance: Math.round(d) }
        }
      }
  }
  return { preset: best, targetY }
}
