import * as THREE from 'three'

/**
 * 雾：线性雾（Minecraft 式远景淡出），起止距离随镜头远近与天气变化，颜色取地平线天色。
 */
export class FogSystem {
  readonly fog = new THREE.Fog(new THREE.Color(1, 1, 1), 400, 3000)
  /** 场景主题可额外加雾 */
  extra = 1

  update(distance: number, color: THREE.Color, weatherFog: number): void {
    this.fog.color.copy(color)
    const k = 1 / (weatherFog * this.extra)
    const near = (distance * 1.1 + 180) * k
    const far = (distance * 3.2 + 900) * Math.sqrt(k)
    this.fog.near = near
    this.fog.far = Math.max(near + 200, far)
  }
}
