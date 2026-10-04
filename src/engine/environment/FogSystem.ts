import * as THREE from 'three'

/**
 * 线性雾（不是指数雾）。距离随镜头缩放：
 * 区域镜头大约 500 格，近景在雾开始之前；文档里 100 格左右的 near 是小场景实验值，这里按镜头距离折算。
 * 颜色用时段雾色，和天空地平线分开，避免远山和天连成一块。
 */
export class FogSystem {
  readonly fog = new THREE.Fog(new THREE.Color(1, 1, 1), 400, 3000)
  /** 场景主题可额外加雾 */
  extra = 1

  /**
   * mist：雾天 0–1。按乘子把 near 拉近不够——地标镜头 80 来格，晴天 near 在 500 格外，乘 0.65 还在 300 格外，
   * 画里什么都看不出。雾天直接按镜头距离给：注视点处已薄薄一层（near≈0.3D），过了注视点一倍半就白茫茫。
   */
  update(distance: number, color: THREE.Color, weatherFog: number, enabled = true, mist = 0): void {
    this.fog.color.copy(color)
    if (!enabled) {
      this.fog.near = 1e6
      this.fog.far = 1e7
      return
    }
    const k = 1 / (weatherFog * this.extra)
    // 相对上一轮再远。文档 130–160 / 360–460 是小场景；这里镜头距离 D 时 near≈2.8D，far≈2.7×near。
    const near = (distance * 2.8 + 250) * k
    const far = (distance * 7.5 + 700) * Math.sqrt(k)
    const mNear = distance * 0.3 + 8
    const mFar = distance * 1.45 + 70
    this.fog.near = near + (mNear - near) * mist
    this.fog.far = Math.max(this.fog.near + 60 + 360 * (1 - mist), far + (mFar - far) * mist)
  }
}
