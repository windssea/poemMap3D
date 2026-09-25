import * as THREE from 'three'

/**
 * 阴影：一盏平行光，阴影相机跟随镜头焦点，范围随镜头远近变化；
 * 位置按阴影贴图像素对齐，镜头移动时阴影边缘不闪。
 */
export class ShadowManager {
  readonly light: THREE.DirectionalLight
  private readonly target = new THREE.Object3D()
  private enabled = true
  private extent = 120
  private readonly v0 = new THREE.Vector3()
  private readonly v1 = new THREE.Vector3()
  private readonly v2 = new THREE.Vector3()
  private readonly v3 = new THREE.Vector3()

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    mapSize: number,
  ) {
    this.light = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 2.4)
    this.light.target = this.target
    this.light.castShadow = true
    this.light.shadow.mapSize.set(mapSize, mapSize)
    this.light.shadow.bias = -0.0006
    this.light.shadow.normalBias = 0.35
    const c = this.light.shadow.camera
    c.near = 1
    c.far = 1200
    this.renderer.shadowMap.enabled = true
  }

  get objects(): THREE.Object3D[] {
    return [this.light, this.target]
  }

  setEnabled(on: boolean, mapSize: number): void {
    this.enabled = on
    this.renderer.shadowMap.enabled = on
    this.light.castShadow = on
    if (this.light.shadow.mapSize.x !== mapSize) {
      this.light.shadow.mapSize.set(mapSize, mapSize)
      this.light.shadow.map?.dispose()
      this.light.shadow.map = null
    }
  }

  /** 每帧：跟随焦点；distance 越大阴影覆盖越广（远看时关掉以省开销） */
  update(focus: THREE.Vector3, sunDir: THREE.Vector3, distance: number): void {
    const want = this.enabled && distance < 700 && sunDir.y > 0.05
    this.light.castShadow = want
    if (!want) return
    const ext = Math.min(260, Math.max(60, distance * 0.9))
    if (Math.abs(ext - this.extent) > 4) {
      this.extent = ext
      const c = this.light.shadow.camera
      c.left = -ext
      c.right = ext
      c.top = ext
      c.bottom = -ext
      c.updateProjectionMatrix()
    }
    /* 在光源空间里按阴影贴图像素对齐（斜射的日月光也不会让阴影边缘爬动闪烁） */
    const texel = (this.extent * 2) / this.light.shadow.mapSize.x
    const fwd = this.v0.copy(sunDir).normalize().negate()
    const right = this.v1.set(0, 1, 0).cross(fwd)
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
    right.normalize()
    const up = this.v2.copy(fwd).cross(right).normalize()
    const u = focus.dot(right)
    const v = focus.dot(up)
    const snapped = this.v3.copy(focus).addScaledVector(right, Math.round(u / texel) * texel - u).addScaledVector(up, Math.round(v / texel) * texel - v)
    this.target.position.copy(snapped)
    this.light.position.set(snapped.x + sunDir.x * 500, snapped.y + sunDir.y * 500, snapped.z + sunDir.z * 500)
    this.target.updateMatrixWorld()
  }
}
