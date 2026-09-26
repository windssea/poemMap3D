import * as THREE from 'three'
import { CSM } from 'three/examples/jsm/csm/CSM.js'

/**
 * 阴影：级联阴影（CSM）。
 *  - 视锥按距离切成两到三段，各配一张阴影图：近处的建筑、乔木用高精度，远处用低精度；段与段之间渐变过渡；
 *  - 阴影范围随镜头距离伸缩（最远约 700 格），更远的远景片、覆盖图不投影；
 *  - 只有近景区块的实心层与树叶层投影；草、芦苇、花、庄稼（地被层）、远景树一律不投影，靠顶点 AO 与面向明暗表现体积；
 *  - 光源方向、颜色、强度随时辰变化（晨昼暮夜的太阳与月光）。
 *
 * three 的 CSM 会改写公共的光照着色片段：场景里每个受光材质都必须经 registerMaterial 登记，
 * 否则几盏级联灯会叠加照亮它。这里定期扫描场景，把新出现的受光材质登记上（与材质自己的 onBeforeCompile 串接）。
 */
export class ShadowManager {
  /** 对外的太阳：颜色与强度由环境系统写入，每帧同步到各级联灯 */
  readonly light = { color: new THREE.Color(1, 1, 1), intensity: 2.4 }
  private csm: CSM | null = null
  private camera: THREE.PerspectiveCamera | null = null
  private parent: THREE.Object3D | null = null
  private enabled = true
  private cascades = 2
  private mapSize = 1536
  private maxFar = 400
  private readonly registered = new WeakSet<THREE.Material>()
  private scanTick = 0

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    mapSize: number,
  ) {
    this.mapSize = mapSize
    this.renderer.shadowMap.enabled = true
  }

  /** 旧接口：级联灯由 CSM 自己挂进场景 */
  get objects(): THREE.Object3D[] {
    return []
  }

  /** 镜头与场景就绪后调用 */
  attach(camera: THREE.PerspectiveCamera, parent: THREE.Object3D): void {
    this.camera = camera
    this.parent = parent
    this.rebuild()
  }

  setEnabled(on: boolean, mapSize: number, cascades = on ? 2 : 1): void {
    const changed = on !== this.enabled || mapSize !== this.mapSize || cascades !== this.cascades
    this.enabled = on
    this.renderer.shadowMap.enabled = on
    this.mapSize = mapSize
    this.cascades = Math.max(1, cascades)
    if (changed && this.camera) this.rebuild()
  }

  private rebuild(): void {
    if (!this.camera || !this.parent) return
    const old = this.csm
    if (old) {
      old.remove()
      old.dispose()
    }
    const csm = new CSM({
      camera: this.camera,
      parent: this.parent,
      cascades: this.cascades,
      maxFar: this.maxFar,
      mode: 'practical',
      shadowMapSize: this.mapSize,
      lightDirection: new THREE.Vector3(-0.3, -0.85, -0.55).normalize(),
      lightIntensity: this.light.intensity,
      lightNear: 1,
      lightFar: 1600,
      lightMargin: 120,
      shadowBias: -0.0004,
    })
    csm.fade = true
    for (const l of csm.lights) {
      l.castShadow = this.enabled
      l.shadow.normalBias = 0.35
      l.shadow.radius = this.cascades >= 3 ? 2.5 : 1.8 // PCF 模糊：阴影边缘有柔和的半影
    }
    this.csm = csm
    /* 已登记过的材质要重新登记到新的 CSM 上 */
    this.parent.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const mat of Array.isArray(m) ? m : m ? [m] : []) if (this.registered.has(mat)) this.setup(mat, true)
    })
  }

  /** 受光材质登记到 CSM（与材质原有的 onBeforeCompile 串接） */
  registerMaterial(mat: THREE.Material): void {
    if (this.registered.has(mat)) return
    this.registered.add(mat)
    this.setup(mat, false)
  }

  private setup(mat: THREE.Material, again: boolean): void {
    if (!this.csm) return
    const m = mat as THREE.Material & { __ownCompile?: THREE.Material['onBeforeCompile'] }
    if (!again) m.__ownCompile = mat.onBeforeCompile
    const own = m.__ownCompile
    this.csm.setupMaterial(mat)
    const csmHook = mat.onBeforeCompile
    mat.onBeforeCompile = (shader, renderer) => {
      own?.call(mat, shader, renderer)
      csmHook.call(mat, shader, renderer)
    }
    mat.needsUpdate = true
  }

  /** 扫描场景里新出现的受光材质（Lambert / Phong / Standard） */
  private scan(): void {
    if (!this.parent) return
    this.parent.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material
      for (const mat of Array.isArray(m) ? m : [m]) {
        if (!mat || this.registered.has(mat)) continue
        const t = (mat as THREE.Material).type
        if (t === 'MeshLambertMaterial' || t === 'MeshPhongMaterial' || t === 'MeshStandardMaterial') this.registerMaterial(mat)
      }
    })
  }

  /**
   * 每帧：同步光向、颜色、强度；阴影范围随镜头距离伸缩；更新级联。
   * @param sunDir 指向太阳的单位向量
   */
  update(_focus: THREE.Vector3, sunDir: THREE.Vector3, distance: number): void {
    const csm = this.csm
    if (!csm) return
    if (this.scanTick++ % 45 === 0) this.scan()
    const want = this.enabled && distance < 900 && sunDir.y > 0.05
    for (const l of csm.lights) {
      l.castShadow = want
      l.color.copy(this.light.color)
      l.intensity = this.light.intensity
    }
    csm.lightDirection.copy(sunDir).negate().normalize()
    const far = Math.min(700, Math.max(250, distance * 2.6 + 150))
    if (Math.abs(far - this.maxFar) > this.maxFar * 0.12) {
      this.maxFar = far
      csm.maxFar = far
      csm.updateFrustums()
    }
    csm.update()
  }

  dispose(): void {
    this.csm?.remove()
    this.csm?.dispose()
    this.csm = null
  }
}
