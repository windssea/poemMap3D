import * as THREE from 'three'
import { WeatherTint } from '../../config/palette'

const MAX = 20000

/**
 * 雨雪：以焦点为中心的一箱粒子，下落动画全在顶点着色器里；雨是细缓的斜线。
 * 雪是大雪：大小两档，大片少而慢；整片雪随阵风缓缓吹移，每片又打着旋儿左右飘摆、边缘参差并慢慢翻转。
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
        varying float vBig;
        varying float vRot;
        varying float vSeed;
        void main() {
          // 雪用四成的粒子（约 8000）：看得出在下雪，又不遮景
          float snow = step(aSeed.w, uSnow * 0.4);
          // 雨只用四成五的粒子（约 9000，与从前一样密）
          float rain = step(aSeed.w, uRain * 0.45);
          vKind = snow;
          vA = max(snow, rain);
          vSeed = aSeed.x * 7.0 + aSeed.z * 13.0;
          // 大片约三成：略大、更慢
          float big = snow * step(0.7, aSeed.y);
          vBig = big;
          float speed = snow > 0.5 ? (big > 0.5 ? 1.5 + aSeed.z * 1.1 : 2.4 + aSeed.z * 1.8) : 34.0 + aSeed.z * 14.0;
          // 风：雪整体随阵风缓缓吹移（几十秒一个来回），雨是固定的斜落
          float wind = snow > 0.5
            ? uTime * 1.2 + sin(uTime * 0.09) * 10.0 + sin(uTime * 0.041 + 1.7) * 14.0
            : uTime * 3.5;
          float windZ = snow > 0.5 ? sin(uTime * 0.07 + 0.6) * 8.0 : 0.0;
          // 以世界坐标为锚、在以焦点为中心的箱子里循环，镜头平移时雨雪不跟着滑
          float wx = uCenter.x + mod(aSeed.x * uBox.x + wind - uCenter.x + uBox.x * 0.5, uBox.x) - uBox.x * 0.5;
          float wz = uCenter.z + mod(aSeed.y * uBox.z + windZ - uCenter.z + uBox.z * 0.5, uBox.z) - uBox.z * 0.5;
          float wy = uCenter.y + uBox.y * 0.5 - mod(aSeed.z * uBox.y + uTime * speed, uBox.y);
          if (snow > 0.5) {
            // 每片打着旋儿飘：水平画小圈、上下轻轻一顿一顿，大片摆得更开
            float ph = aSeed.z * 40.0 + aSeed.x * 17.0;
            float r = big > 0.5 ? 2.4 : 1.3;
            float f = 0.45 + aSeed.x * 0.5;
            wx += sin(uTime * f + ph) * r + sin(uTime * 1.9 + ph * 1.3) * 0.3 * r;
            wz += cos(uTime * f * 0.9 + ph) * r;
            wy += sin(uTime * 1.1 + ph) * 0.55;
            vRot = uTime * (0.4 + aSeed.y * 0.9) * (aSeed.z > 0.5 ? 1.0 : -1.0) + ph;
          } else {
            vRot = 0.0;
          }
          vec3 w = vec3(wx, wy, wz);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = snow > 0.5 ? (big > 0.5 ? 3.0 + aSeed.x * 1.8 : 1.5 + aSeed.y * 1.3) : 2.2;
          // 贴着镜头的雪片也不至于糊满屏
          gl_PointSize = vA * min(size * uPx * 220.0 / max(8.0, -mv.z), 24.0 * uPx);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uRainColor;
        uniform vec3 uSnowColor;
        varying float vA;
        varying float vKind;
        varying float vBig;
        varying float vRot;
        varying float vSeed;
        void main() {
          if (vA < 0.5) discard;
          vec2 q = gl_PointCoord - 0.5;
          if (vKind > 0.5) {
            // 鹅毛：蓬松的圆片，边缘按片参差（三五瓣），随下落慢慢翻转
            float d = length(q);
            float ang = atan(q.y, q.x) + vRot;
            float edge = 0.4 + (0.05 * sin(ang * 3.0 + vSeed) + 0.035 * sin(ang * 5.0 + vSeed * 2.3)) * (0.5 + vBig);
            if (d > edge) discard;
            float soft = smoothstep(edge, edge * 0.3, d);
            gl_FragColor = vec4(uSnowColor, soft * mix(0.7, 0.85, vBig));
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
