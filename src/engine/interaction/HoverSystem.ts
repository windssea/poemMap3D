import * as THREE from 'three'
import { DebugTokens } from '../../config/palette'
import type { RayHit } from './RaycastSystem'

/**
 * 悬停：近景下给光标所指的方块描一圈细黑框（Minecraft 式选框）。
 */
export class HoverSystem {
  readonly outline: THREE.LineSegments
  hit: RayHit | null = null

  constructor() {
    const g = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004))
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(DebugTokens.selection), transparent: true, opacity: 0.55, depthWrite: false })
    this.outline = new THREE.LineSegments(g, m)
    this.outline.visible = false
    this.outline.renderOrder = 10
  }

  set(hit: RayHit | null, enabled: boolean): void {
    this.hit = hit
    if (!enabled || !hit?.block) {
      this.outline.visible = false
      return
    }
    this.outline.visible = true
    this.outline.position.set(hit.block.x + 0.5, hit.block.y + 0.5, hit.block.z + 0.5)
  }

  dispose(): void {
    this.outline.geometry.dispose()
    ;(this.outline.material as THREE.Material).dispose()
  }
}
