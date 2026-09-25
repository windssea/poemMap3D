import * as THREE from 'three'
import { MaterialTokens } from '../../config/palette'
import { GLSL_HASH } from '../rendering/ShaderLibrary'
import type { SharedUniforms } from '../rendering/SharedUniforms'

/**
 * 天空：天顶—地平渐变；方形的日与月（Minecraft 式）；夜里的星。随镜头移动，不受雾影响。
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
          // 方形的日 / 月
          vec3 s = normalize(uSunDir);
          float facing = dot(d, s);
          if (facing > 0.95) {
            vec3 t1 = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
            vec3 t2 = cross(t1, s);
            vec2 q = vec2(dot(d, t1), dot(d, t2)) / facing;
            float r = uNight > 0.5 ? 0.028 : 0.04;
            float disc = step(max(abs(q.x), abs(q.y)), r);
            vec3 body = uNight > 0.5 ? uMoonDisc : uSunDisc * 1.6;
            col = mix(col, body, disc * (1.0 - uWet * 0.8));
            col += body * 0.25 * smoothstep(0.12, 0.0, max(abs(q.x), abs(q.y))) * (1.0 - uWet);
          }
          // 星
          if (uNight > 0.05 && d.y > 0.0) {
            vec3 g = floor(d * 180.0);
            float st = step(0.9965, hash13(g));
            col += vec3(st) * uNight * (1.0 - uWet) * 0.9;
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
