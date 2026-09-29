import * as THREE from 'three'
import { WeatherTint } from '../../config/palette'

const MAX = 9000

/**
 * 雨雪：以焦点为中心的一箱粒子，下落动画全在顶点着色器里；雨是细缓的斜线，雪是多频摆动、缓慢摇曳的飘落方片。
 */
export class PrecipitationSystem {
  readonly points: THREE.Points
  private readonly mat: THREE.ShaderMaterial
  scale = 1

  constructor() {
    const g = new THREE.BufferGeometry()
    const seeds = new Float32Array(MAX * 4)
    for (let i = 0; i < MAX * 4; i++) seeds[i] = Math.random()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: new THREE.Vector3(160, 90, 160) },
        uRain: { value: 0 },
        uSnow: { value: 0 },
        uRainColor: { value: new THREE.Color(WeatherTint.rainColor) },
        uSnowColor: { value: new THREE.Color(WeatherTint.snowColor) },
        uPx: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform vec3 uBox;
        uniform float uRain;
        uniform float uSnow;
        uniform float uPx;
        varying float vA;
        varying float vKind;
        void main() {
          float snow = step(aSeed.w, uSnow);
          float rain = step(aSeed.w, uRain);
          vKind = snow;
          vA = max(snow, rain);
          // 雨：一半的速度、细小的水线；雪：更慢的下落
          float speed = snow > 0.5 ? 3.0 + aSeed.z * 2.5 : 34.0 + aSeed.z * 14.0;
          // 以世界坐标为锚、在以焦点为中心的箱子里循环，镜头平移时雨雪不跟着滑
          float wind = snow > 0.5
            ? sin(uTime * 0.7 + aSeed.z * 20.0) * 3.0 + sin(uTime * 0.23 + aSeed.x * 31.0) * 2.2 + uTime * 1.1
            : uTime * 3.5;
          float wx = uCenter.x + mod(aSeed.x * uBox.x + wind - uCenter.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          float wz = uCenter.z + mod(aSeed.y * uBox.z - uCenter.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;
          float wy = uCenter.y + uBox.y * 0.5 - mod(aSeed.z * uBox.y + uTime * speed, uBox.y)
            + (snow > 0.5 ? sin(uTime * 1.3 + aSeed.x * 40.0) * 1.1 : 0.0);
          vec3 w = vec3(wx, wy, wz);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vA * (snow > 0.5 ? 1.5 + aSeed.y * 1.8 : 2.2) * uPx * 220.0 / max(8.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRainColor;
        uniform vec3 uSnowColor;
        varying float vA;
        varying float vKind;
        void main() {
          if (vA < 0.5) discard;
          vec2 q = gl_PointCoord - 0.5;
          if (vKind > 0.5) {
            vec2 a = abs(q);
            if (max(a.x, a.y) > 0.34) discard;
            float soft = smoothstep(0.34, 0.16, max(a.x, a.y));
            gl_FragColor = vec4(uSnowColor, mix(0.3, 0.85, soft));
          } else {
            if (abs(q.x) > 0.05) discard;
            gl_FragColor = vec4(uRainColor, 0.48);
          }
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 6
  }

  update(time: number, focus: THREE.Vector3, distance: number, rain: number, snow: number, pixelRatio: number): void {
    const vis = (rain > 0.02 || snow > 0.02) && distance < 900
    this.points.visible = vis
    if (!vis) return
    const u = this.mat.uniforms
    u.uTime.value = time
    const s = Math.min(3, Math.max(0.6, distance / 180))
    u.uBox.value.set(200 * s, 110 * s, 200 * s)
    u.uCenter.value.copy(focus).setY(focus.y + 55 * s)
    u.uRain.value = rain * this.scale
    u.uSnow.value = snow * this.scale
    u.uPx.value = pixelRatio * Math.min(2, s)
  }

  dispose(): void {
    this.points.geometry.dispose()
    this.mat.dispose()
  }
}
