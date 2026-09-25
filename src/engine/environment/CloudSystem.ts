import * as THREE from 'three'
import { createSimplex2D, fbm } from '../../utils/noise'

const CELL = 16
const SPAN = 150 // 格：覆盖焦点周围 ±1200 方块
const HEIGHT = 300
const MAX = 9000

/**
 * 云：Minecraft 式的扁平方块云层，随风缓慢漂移；雨雪时云量增多、变暗。
 */
export class CloudSystem {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.MeshLambertMaterial
  private readonly noise = createSimplex2D(9173)
  private drift = 0
  private lastKey = ''
  private coverage = 0.14
  enabled = true

  constructor() {
    this.mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(1, 1, 1), transparent: true, opacity: 0.82, depthWrite: false })
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, 4, CELL), this.mat, MAX)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 2
  }

  update(dt: number, focus: THREE.Vector3, color: THREE.Color, wet: number): void {
    this.mesh.visible = this.enabled
    if (!this.enabled) return
    this.drift += dt * 2.2
    this.mat.color.copy(color).multiplyScalar(1 - wet * 0.35)
    const cov = 0.1 + wet * 0.3
    const fx = Math.floor(focus.x / CELL / 8) * 8
    const fz = Math.floor(focus.z / CELL / 8) * 8
    const shift = Math.floor(this.drift / CELL)
    const key = `${fx},${fz},${shift},${cov.toFixed(2)}`
    this.mesh.position.x = (this.drift % CELL)
    if (key === this.lastKey && Math.abs(cov - this.coverage) < 0.01) return
    this.lastKey = key
    this.coverage = cov
    const m = new THREE.Matrix4()
    let n = 0
    for (let j = -SPAN / 2; j < SPAN / 2 && n < MAX; j++)
      for (let i = -SPAN / 2; i < SPAN / 2 && n < MAX; i++) {
        const gx = fx + i - shift
        const gz = fz + j
        const v = fbm(this.noise, gx / 16, gz / 16, 3) * 0.5 + 0.5
        if (v < 1 - cov * 1.6) continue
        m.makeTranslation((gx + shift) * CELL, HEIGHT, gz * CELL)
        this.mesh.setMatrixAt(n++, m)
      }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
