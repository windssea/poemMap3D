import type { LandmarkView } from '../../world/WorldManager'
import type { CameraPose } from './CameraPose'

/**
 * 聚焦：由地标的取景预设求出镜头姿态；落定后可缓慢环绕（巡游停留时）。
 */
export class FocusController {
  /** 环绕角速度（弧度 / 秒），0 为不环绕 */
  orbitSpeed = 0
  private orbitDir = 1

  poseFor(view: LandmarkView, shot = 1): CameraPose {
    return { target: view.target.clone(), yaw: view.preset.yaw, pitch: view.preset.pitch, distance: view.preset.distance * shot }
  }

  startOrbit(speed = 0.05): void {
    this.orbitSpeed = speed
    this.orbitDir = 1
  }

  stopOrbit(): void {
    this.orbitSpeed = 0
  }

  /** 环绕到会贴山的一侧时反向 */
  reverse(): void {
    this.orbitDir *= -1
  }

  update(dt: number, goal: CameraPose): void {
    if (!this.orbitSpeed) return
    goal.yaw += this.orbitSpeed * this.orbitDir * dt
    goal.distance *= 1 - 0.006 * dt
  }
}
