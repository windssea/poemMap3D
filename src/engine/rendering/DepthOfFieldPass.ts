import * as THREE from 'three'
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'

/** 场景渲染：记下这一帧渲进了哪张缓冲（景深从它的深度贴图读，不受后面各遍交换读写缓冲的影响） */
export class SceneRenderPass extends RenderPass {
  target: THREE.WebGLRenderTarget | null = null

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    this.target = this.renderToScreen ? null : readBuffer
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive)
  }
}

const DofShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uNear: { value: 1 },
    uFar: { value: 1000 },
    uFocus: { value: 100 },
    uMaxR: { value: 8 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uDir;
    uniform float uNear;
    uniform float uFar;
    uniform float uFocus;
    uniform float uMaxR;
    varying vec2 vUv;
    float viewZ(float d) {
      return (uNear * uFar) / (uFar - d * (uFar - uNear));
    }
    // 弥散圆半径（像素）：离对焦距离越远越大；对焦面前后各约六成一的距离内清楚
    float coc(vec2 uv) {
      float z = viewZ(texture2D(tDepth, uv).x);
      float f = abs(1.0 - uFocus / z);
      return smoothstep(0.06, 0.66, f) * uMaxR;
    }
    void main() {
      float r = coc(vUv);
      vec4 c = texture2D(tDiffuse, vUv);
      if (r < 0.35) {
        gl_FragColor = c;
        return;
      }
      vec4 acc = c;
      float ws = 1.0;
      for (int i = -6; i <= 6; i++) {
        if (i == 0) continue;
        float x = float(i) / 6.0;
        float o = x * r;
        vec2 uv = vUv + uDir * o;
        // 取样点自己的弥散圆够大才算进来：清楚的主景不会渗进背后的虚化里
        float w = exp(-x * x * 2.0) * clamp(coc(uv) - abs(o) + 1.0, 0.0, 1.0);
        acc += texture2D(tDiffuse, uv) * w;
        ws += w;
      }
      gl_FragColor = acc / ws;
    }`,
}

/**
 * 真实景深：自动对焦在镜头注视的地方（取景中心），焦外按深度虚化，光圈越大（uMaxR 越大）越虚。
 * 横、竖两遍可分离模糊（各 13 次取样），深度取自场景渲染那张缓冲的深度贴图——不为景深多渲一遍场景。
 * 天空在最远处，按最大半径虚化；雨雪粒子、透明水面不写深度，随身后的景一起虚。
 */
export class DepthOfFieldPass extends Pass {
  private readonly mat = new THREE.ShaderMaterial({ ...DofShader, uniforms: THREE.UniformsUtils.clone(DofShader.uniforms), depthTest: false, depthWrite: false })
  private readonly quad = new FullScreenQuad(this.mat)
  private readonly tmp = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
  private w = 1
  private h = 1
  /** 对焦距离（镜头到注视点的真实距离） */
  focus = 100
  /** 最大弥散圆半径（按 900 像素高计；会随画面高度缩放） */
  maxR = 0

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: SceneRenderPass,
  ) {
    super()
  }

  setSize(width: number, height: number): void {
    this.w = Math.max(1, width)
    this.h = Math.max(1, height)
    this.tmp.setSize(this.w, this.h)
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const depth = this.scene.target?.depthTexture ?? null
    const u = this.mat.uniforms
    u.tDepth.value = depth
    u.uNear.value = this.camera.near
    u.uFar.value = this.camera.far
    u.uFocus.value = this.focus
    u.uMaxR.value = depth ? this.maxR * (this.h / 900) : 0
    /* 横 */
    u.tDiffuse.value = readBuffer.texture
    ;(u.uDir.value as THREE.Vector2).set(1 / this.w, 0)
    renderer.setRenderTarget(this.tmp)
    this.quad.render(renderer)
    /* 竖 */
    u.tDiffuse.value = this.tmp.texture
    ;(u.uDir.value as THREE.Vector2).set(0, 1 / this.h)
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  dispose(): void {
    this.mat.dispose()
    this.quad.dispose()
    this.tmp.dispose()
  }
}
