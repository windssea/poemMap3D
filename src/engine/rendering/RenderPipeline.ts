import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { Quality } from './QualityManager'

/**
 * 调色：像一幅设色的绢本——
 *  - 分色调：暗部偏石青（冷），亮部偏宣纸（暖），晨暮亮部更暖、入夜暗部更蓝；
 *  - 柔和的 S 曲线提一点层次；
 *  - 四角微微压暗；
 *  - 极细的纸纹颗粒（静止的，不闪）。
 * 在 OutputPass 之后（显示空间）做。
 */
/** 「衡」「高」离屏缓冲的多重采样数 */
const MSAA_SAMPLES = 4

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uShadowTint: { value: new THREE.Vector3(0.94, 0.99, 1.05) },
    uHighTint: { value: new THREE.Vector3(1.04, 1.01, 0.95) },
    uStrength: { value: 0.55 },
    uContrast: { value: 0.08 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.012 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uStrength;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * uShadowTint, (1.0 - smoothstep(0.05, 0.55, l)) * uStrength);
      col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l) * uStrength);
      vec3 s = clamp(col, 0.0, 1.0);
      col = mix(col, s * s * (3.0 - 2.0 * s), uContrast);
      vec2 d = vUv - 0.5;
      col *= 1.0 - dot(d, d) * uVignette;
      float g = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      col += g * uGrain;
      gl_FragColor = vec4(col, c.a);
    }`,
}

/**
 * 渲染流水线：
 *  - 「轻」：单次前向渲染；
 *  - 「衡」：+ 泛光 + 调色；
 *  - 「高」：+ 屏幕空间环境光遮蔽（GTAO：檐下、墙脚、楼与楼之间的接触阴影）。
 * 泛光白天阈值高、只让水面闪点微晕；入夜灯笼、窗光柔和晕开。色调映射与色彩空间在 OutputPass 里做。
 */
export class RenderPipeline {
  private composer: EffectComposer | null = null
  private bloom: UnrealBloomPass | null = null
  private ao: GTAOPass | null = null
  private grade: ShaderPass | null = null
  private quality: Quality = 'low'
  private night = -1
  private warm = -1
  /** 非「完整」调试视图时关掉调色、泛光和屏幕空间 AO，避免把隔离结果再压暗 */
  private isolated = false
  /** 顶点 AO 滑条：屏幕空间 AO 跟着收，避免第二套遮蔽把刚抬起来的暗部压回去 */
  aoScale = 1

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  /** 按画质搭流水线（画质切换时调用） */
  setQuality(q: Quality): void {
    if (q === this.quality && (q === 'low') === !this.composer) return
    this.quality = q
    this.dispose()
    if (q === 'low') return
    const size = this.renderer.getSize(new THREE.Vector2())
    // 离屏缓冲显式开 4× 多重采样：渲染器的 antialias 只管直接画到屏幕（「轻」），
    // EffectComposer 默认的离屏目标不带采样，「衡」「高」此前完全没有抗锯齿——瓦脊、栏杆、窗棂边缘一动就闪
    const target = new THREE.WebGLRenderTarget(Math.max(1, size.x * this.renderer.getPixelRatio()), Math.max(1, size.y * this.renderer.getPixelRatio()), { type: THREE.HalfFloatType, samples: MSAA_SAMPLES })
    const composer = new EffectComposer(this.renderer, target)
    composer.setPixelRatio(this.renderer.getPixelRatio())
    composer.setSize(size.x, size.y)
    composer.addPass(new RenderPass(this.scene, this.camera))
    if (q === 'high') {
      const ao = new GTAOPass(this.scene, this.camera, size.x, size.y)
      ao.output = GTAOPass.OUTPUT.Default
      // 屏幕空间 AO 只作低强度补充（主要的 AO 来自网格生成时的顶点 AO），半径小、强度低，不出黑边
      ao.blendIntensity = 0.14
      ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 2, thickness: 1, scale: 0.8, samples: 12, distanceFallOff: 1, screenSpaceRadius: false })
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 })
      composer.addPass(ao)
      this.ao = ao
    }
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.1, 0.5, 1.3)
    composer.addPass(this.bloom)
    composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    composer.addPass(this.grade)
    this.composer = composer
    this.night = -1
    this.warm = -1
  }

  /** 兼容旧调用：开关泛光即在「轻」与「衡」之间切换 */
  setBloom(on: boolean): void {
    this.setQuality(on ? (this.quality === 'low' ? 'mid' : this.quality) : 'low')
  }

  setSize(w: number, h: number): void {
    if (!this.composer) return
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
  }

  /**
   * 按天色调泛光与调色：night 0 白天、1 深夜；warm 0 正午、1 晨暮（太阳低）。
   */
  /** 调试视图不是「完整」时，后处理不再改亮度 */
  setIsolated(on: boolean): void {
    if (on === this.isolated) return
    this.isolated = on
    this.night = -1
  }

  setAoScale(scale: number): void {
    if (Math.abs(scale - this.aoScale) < 0.001) return
    this.aoScale = scale
    this.night = -1
  }

  setLight(night: number, warm: number): void {
    if (Math.abs(night - this.night) < 0.01 && Math.abs(warm - this.warm) < 0.01) return
    this.night = night
    this.warm = warm
    if (this.isolated) {
      if (this.bloom) this.bloom.strength = 0
      if (this.ao) this.ao.blendIntensity = 0
      if (this.grade) {
        const u = this.grade.uniforms as Record<string, { value: number }>
        u.uStrength.value = 0
        u.uVignette.value = 0
        u.uContrast.value = 0
      }
      return
    }
    if (this.bloom) {
      this.bloom.strength = 0.1 + 0.24 * night
      this.bloom.threshold = 1.3 - 0.33 * night
      this.bloom.radius = 0.5 + 0.2 * night
    }
    if (this.grade) {
      const u = this.grade.uniforms as Record<string, { value: THREE.Vector3 | number }>
      ;(u.uShadowTint.value as THREE.Vector3).set(0.94 - 0.06 * night, 0.99 - 0.02 * night, 1.05 + 0.08 * night)
      ;(u.uHighTint.value as THREE.Vector3).set(1.04 + 0.05 * warm, 1.01 + 0.01 * warm, 0.95 - 0.06 * warm + 0.04 * night)
      u.uStrength.value = 0.5 + 0.2 * Math.max(night, warm)
      u.uVignette.value = 0.34 + 0.28 * night
      u.uContrast.value = 0.08
    }
    if (this.ao) this.ao.blendIntensity = 0.14 * this.aoScale * (1 - 0.4 * night)
  }

  /** 旧接口 */
  setNight(n: number): void {
    this.setLight(n, this.warm < 0 ? 0 : this.warm)
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
    // composer.dispose 只释放它的两张读写缓冲，各个 pass 自己的资源要逐个释放
    for (const p of this.composer?.passes ?? []) p.dispose()
    this.composer?.dispose()
    this.composer = null
    this.bloom = null
    this.ao = null
    this.grade = null
  }
}
