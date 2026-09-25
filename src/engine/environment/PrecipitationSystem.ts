import * as THREE from 'three'
import { WeatherTint } from '../../config/palette'

const MAX = 9000

/**
 * 雨雪：以焦点为中心的一箱粒子，下落动画全在顶点着色器里；雨是斜长的线，雪是缓飘的方片。
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
          float speed = snow > 0.5 ? 6.0 + aSeed.z * 3.0 : 70.0 + aSeed.z * 30.0;
          // 以世界坐标为锚、在以焦点为中心的箱子里循环，镜头平移时雨雪不跟着滑
          float wind = snow > 0.5 ? sin(uTime * 0.8 + aSeed.z * 20.0) * 2.0 : uTime * 6.0;
          float wx = uCenter.x + mod(aSeed.x * uBox.x + wind - uCenter.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          float wz = uCenter.z + mod(aSeed.y * uBox.z - uCenter.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;
          float wy = uCenter.y + uBox.y * 0.5 - mod(aSeed.z * uBox.y + uTime * speed, uBox.y);
          vec3 w = vec3(wx, wy, wz);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vA * (snow > 0.5 ? 2.2 : 3.2) * uPx * 220.0 / max(8.0, -mv.z);
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
            if (max(abs(q.x), abs(q.y)) > 0.32) discard;
            gl_FragColor = vec4(uSnowColor, 0.9);
          } else {
            if (abs(q.x) > 0.06) discard;
            gl_FragColor = vec4(uRainColor, 0.55);
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
