import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/**
 * 渲染流水线：前向渲染；画质「衡」「高」时加一道泛光——
 * 白天阈值高、只让日光在水面的闪点微微晕开；入夜阈值降低，灯笼、窗光、河灯、孔明灯柔柔地晕出一圈暖光。
 * 色调映射与色彩空间在最后一道 OutputPass 里做。截图时临时保留绘制缓冲。
 */
export class RenderPipeline {
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private night = -1

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  /** 开关泛光（画质切换时调用） */
  setBloom(on: boolean): void {
    if (on === !!this.composer) return
    if (!on) {
      this.composer?.dispose()
      this.bloom?.dispose()
      this.composer = null
      this.bloom = null
      return
    }
    const size = this.renderer.getSize(new THREE.Vector2())
    const composer = new EffectComposer(this.renderer)
    composer.setPixelRatio(this.renderer.getPixelRatio())
    composer.setSize(size.x, size.y)
    composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.2, 0.55, 1.3)
    composer.addPass(this.bloom)
    composer.addPass(new OutputPass())
    this.composer = composer
    this.night = -1
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
  }

  /** 按夜色调泛光：0 白天、1 深夜 */
  setNight(n: number): void {
    if (!this.bloom || Math.abs(n - this.night) < 0.01) return
    this.night = n
    this.bloom.strength = 0.1 + 0.32 * n
    this.bloom.threshold = 1.3 - 0.5 * n
    this.bloom.radius = 0.5 + 0.2 * n
  }

  render(): void {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  /** 截图（PNG data URL） */
  capture(): string {
    this.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  dispose(): void {
    this.setBloom(false)
  }
}
