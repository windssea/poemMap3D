import type { LandmarkRegistry } from '../../world/landmark/LandmarkRegistry'
import type { RayHit } from './RaycastSystem'

/**
 * 选择：点中的地面落在哪个地标范围里（取最近），就选中那处诗词地点。
 */
export class SelectionSystem {
  constructor(private readonly landmarks: LandmarkRegistry) {}

  pick(hit: RayHit | null): string | null {
    if (!hit) return null
    let best: string | null = null
    let bd = Infinity
    for (const lm of this.landmarks.landmarks) {
      const d = Math.hypot(lm.x - hit.point.x, lm.z - hit.point.z)
      if (d < Math.max(12, lm.def.radius * 0.7) && d < bd) {
        bd = d
        best = lm.def.poetryPlaceId
      }
    }
    return best
  }
}
