import * as THREE from 'three'
import { MaterialTokens } from '../../config/palette'
import { GLSL_HASH } from '../rendering/ShaderLibrary'
import type { SharedUniforms } from '../rendering/SharedUniforms'

/**
 * 天空：天顶—地平渐变；方形的日（Minecraft 式）；夜里一轮满月（像素圆盘、月海暗斑、月晕）、
 * 两层明暗不一的星（亮星闪烁）、一道淡淡的银河。随镜头移动，不受雾影响。
 */
export class SkySystem {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial

  constructor(shared: SharedUniforms) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uSunDir: shared.uSunDir,
        uNight: shared.uNight,
        uTime: shared.uTime,
        uWet: shared.uWet,
        uSunDisc: { value: new THREE.Color(MaterialTokens.gold[2]) },
        uMoonDisc: { value: new THREE.Color(MaterialTokens.snow[1]) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        uniform float uNight;
        uniform float uTime;
        uniform float uWet;
        uniform vec3 uSunDisc;
        uniform vec3 uMoonDisc;
        varying vec3 vDir;
        ${GLSL_HASH}
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
          col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.2, d.y));
          // 月的圆盘画在月光同一方位、贴近地平（约 9°）：镜头多是俯看，月亮挂得高就永远在画面外
          vec3 s = normalize(uSunDir);
          if (uNight > 0.5) s = normalize(vec3(s.x, 0.16 * length(s.xz), s.z));
          float facing = dot(d, s);
          vec3 t1 = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
          vec3 t2 = cross(t1, s);
          vec2 q = vec2(dot(d, t1), dot(d, t2)) / max(facing, 0.01);
          float clearSky = 1.0 - uWet;
          float nearMoon = 0.0;
          if (uNight > 0.5) {
            // 满月：十八格见方的像素圆盘，月海几块暗斑，外面一圈月晕（雨夜隐去）
            if (facing > 0.8) {
              float R = 0.055;
              vec2 pq = floor(q / R * 9.0);
              float rr = length((pq + 0.5) / 9.0);
              float disc = step(rr, 1.0);
              vec2 mp = pq / 9.0;
              float maria = smoothstep(0.42, 0.2, length(mp - vec2(-0.25, 0.3))) * 0.8 + smoothstep(0.32, 0.12, length(mp - vec2(0.3, 0.05))) * 0.7 + smoothstep(0.26, 0.1, length(mp - vec2(-0.05, -0.4))) * 0.6;
              vec3 body = uMoonDisc * (1.18 - 0.3 * maria - 0.1 * hash12(pq) - 0.12 * smoothstep(0.7, 1.0, rr));
              col = mix(col, body, disc * (1.0 - uWet * 0.85));
              float lq = length(q);
              col += uMoonDisc * (0.28 * exp(-lq / (R * 1.4)) + 0.1 * exp(-lq / (R * 6.0))) * (1.0 - disc) * clearSky;
              nearMoon = exp(-lq / (R * 3.0));
            }
          } else if (facing > 0.95) {
            // 方形的日
            float disc = step(max(abs(q.x), abs(q.y)), 0.04);
            vec3 body = uSunDisc * 1.6;
            col = mix(col, body, disc * (1.0 - uWet * 0.8));
            col += body * 0.25 * smoothstep(0.12, 0.0, max(abs(q.x), abs(q.y))) * clearSky;
          }
          if (uNight > 0.05 && d.y > 0.0) {
            float up = smoothstep(0.0, 0.18, d.y) * uNight * clearSky * (1.0 - nearMoon);
            // 银河：斜贯天穹的一道淡光带，带里星更密
            vec3 bandN = normalize(vec3(0.55, 0.35, 0.76));
            float band = exp(-pow(dot(d, bandN) / 0.2, 2.0));
            float haze = band * (0.55 + 0.45 * hash13(floor(d * 40.0))) * (0.6 + 0.4 * hash13(floor(d * 13.0) + 5.0));
            col += vec3(0.62, 0.68, 0.85) * haze * 0.11 * up;
            // 细星：密而暗（每格只点中间一小点，不成大方块）
            vec3 f1 = d * 260.0;
            vec3 g = floor(f1);
            vec3 c1 = abs(fract(f1) - 0.5);
            float dot1 = step(max(c1.x, max(c1.y, c1.z)), 0.3);
            float h1 = hash13(g);
            col += vec3(step(0.9955 - band * 0.006, h1) * dot1 * (0.4 + 0.45 * hash13(g + 3.1))) * up;
            // 亮星：稀而亮，微带冷暖，缓缓闪烁
            vec3 f2 = d * 120.0;
            vec3 g2 = floor(f2);
            vec3 c2 = abs(fract(f2) - 0.5);
            float dot2 = step(max(c2.x, max(c2.y, c2.z)), 0.2);
            float h2 = hash13(g2 + 17.0);
            float tw = 0.65 + 0.35 * sin(uTime * (1.5 + 3.0 * hash13(g2 + 9.0)) + h2 * 60.0);
            vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.9, 0.75), hash13(g2 + 23.0));
            col += tint * step(0.9982, h2) * dot2 * tw * 1.3 * up;
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -10
  }

  update(camera: THREE.Camera, top: THREE.Color, horizon: THREE.Color): void {
    this.mesh.position.copy(camera.position)
    const far = (camera as THREE.PerspectiveCamera).far ?? 5000
    this.mesh.scale.setScalar(far * 0.9)
    ;(this.mat.uniforms.uTop.value as THREE.Color).copy(top)
    ;(this.mat.uniforms.uHorizon.value as THREE.Color).copy(horizon)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
