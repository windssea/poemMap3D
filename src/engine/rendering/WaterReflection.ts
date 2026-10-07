import * as THREE from 'three'
import type { SharedUniforms } from './SharedUniforms'

/**
 * 局部水面倒影：只给当前主景（地标声明了 reflection 的，如枫桥）的一片水面开一张反射图。
 * 做法同 three.js 的 Reflector：镜像相机 + 斜裁剪面（水面以下的东西不进倒影），渲到一张半精度贴图（线性色，
 * 与中、高画质主渲染同一色彩空间）；水面着色器按投影矩阵取样，与天光倒影按区域权重混合。
 *  - 只在衡、高画质、镜头离得够近时开；轻画质与远景仍只用天光倒影。
 *  - 渲倒影时把水面本身藏起来（不反射自己）、关掉阴影图更新（阴影不必再算一遍）。
 *  - 贴图按屏幕一半、最长 1024；每两帧刷新一次（船在动，不能冻住）。
 */
export class WaterReflection {
  private readonly rt: THREE.WebGLRenderTarget
  private readonly cam = new THREE.PerspectiveCamera()
  private readonly plane = new THREE.Plane()
  private readonly clip = new THREE.Vector4()
  private readonly q = new THREE.Vector4()
  private readonly v = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly rot = new THREE.Matrix4()
  private readonly n = new THREE.Vector3(0, 1, 0)
  private readonly size = new THREE.Vector2()
  private frame = 0
  private area: { x: number; z: number; y: number; r: number } | null = null
  private hidden: THREE.Object3D[] = []

  constructor(private readonly shared: SharedUniforms) {
    this.rt = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, depthBuffer: true })
    this.rt.texture.generateMipmaps = false
    shared.uReflTex.value = this.rt.texture
  }

  /** 设定倒影区域（世界坐标水面高度 y、圆心、半径）；null 关掉 */
  setArea(a: { x: number; z: number; y: number; r: number } | null): void {
    this.area = a
    if (!a) this.shared.uReflOn.value = 0
  }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, enabled: boolean): void {
    const a = this.area
    if (!a || !enabled) {
      this.shared.uReflOn.value = 0
      return
    }
    // 镜头在水面以下（或差不多平齐）不反射
    if (camera.position.y < a.y + 0.5) {
      this.shared.uReflOn.value = 0
      return
    }
    if (this.frame++ % 2 === 1 && this.shared.uReflOn.value > 0) return
    const size = renderer.getDrawingBufferSize(this.size)
    const w = Math.max(256, Math.min(1024, Math.round(size.x / 2)))
    const h = Math.max(256, Math.min(1024, Math.round(size.y / 2)))
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h)

    /* 镜像相机（同 Reflector） */
    const P = this.target.set(a.x, a.y, a.z)
    camera.updateMatrixWorld()
    this.rot.extractRotation(camera.matrixWorld)
    const view = this.v.copy(P).sub(camera.position)
    view.reflect(this.n).negate().add(P)
    this.look.set(0, 0, -1).applyMatrix4(this.rot).add(camera.position)
    const lt = new THREE.Vector3().copy(P).sub(this.look).reflect(this.n).negate().add(P)
    this.cam.position.copy(view)
    this.cam.up.set(0, 1, 0).applyMatrix4(this.rot).reflect(this.n)
    this.cam.lookAt(lt)
    this.cam.far = camera.far
    this.cam.near = camera.near
    this.cam.fov = camera.fov
    this.cam.aspect = camera.aspect
    this.cam.updateMatrixWorld()
    this.cam.projectionMatrix.copy(camera.projectionMatrix)

    /* 贴图矩阵：世界坐标 → 反射图 uv */
    const tm = this.shared.uReflMat.value
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
    tm.multiply(this.cam.projectionMatrix).multiply(this.cam.matrixWorldInverse)

    /* 斜裁剪面：水面以下的不进倒影 */
    this.plane.setFromNormalAndCoplanarPoint(this.n, P).applyMatrix4(this.cam.matrixWorldInverse)
    this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant)
    const pm = this.cam.projectionMatrix
    this.q.x = (Math.sign(this.clip.x) + pm.elements[8]) / pm.elements[0]
    this.q.y = (Math.sign(this.clip.y) + pm.elements[9]) / pm.elements[5]
    this.q.z = -1.0
    this.q.w = (1.0 + pm.elements[10]) / pm.elements[14]
    this.clip.multiplyScalar(2.0 / this.clip.dot(this.q))
    pm.elements[2] = this.clip.x
    pm.elements[6] = this.clip.y
    pm.elements[10] = this.clip.z + 1.0 - 0.003
    pm.elements[14] = this.clip.w

    /* 渲：藏起水面，不更新阴影图 */
    this.hidden.length = 0
    scene.traverseVisible((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined
      if (m && !Array.isArray(m) && m.userData?.water) this.hidden.push(o)
    })
    for (const o of this.hidden) o.visible = false
    const prevTarget = renderer.getRenderTarget()
    const prevShadow = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    this.shared.uReflOn.value = 0
    renderer.setRenderTarget(this.rt)
    renderer.clear()
    renderer.render(scene, this.cam)
    renderer.setRenderTarget(prevTarget)
    renderer.shadowMap.autoUpdate = prevShadow
    for (const o of this.hidden) o.visible = true

    this.shared.uReflOn.value = 1
    this.shared.uReflY.value = a.y
    ;(this.shared.uReflArea.value as THREE.Vector3).set(a.x, a.z, a.r)
  }

  dispose(): void {
    this.rt.dispose()
  }
}
