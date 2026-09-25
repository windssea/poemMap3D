import * as THREE from 'three'
import { AutumnTokens, MaterialTokens, WaterTokens } from '../../config/palette'
import type { Season } from './types'

const DRIFT = 700
const MIST = 240

const DRIFT_COLORS: Record<Season, [string, string, number]> = {
  spring: [MaterialTokens.blossom[0], MaterialTokens.blossomDeep[0], 1],
  summer: [MaterialTokens.bambooStalk[2], MaterialTokens.bambooStalk[1], 0.45],
  autumn: [AutumnTokens.maple, AutumnTokens.gold, 0.9],
  winter: [MaterialTokens.snow[0], MaterialTokens.snow[1], 0],
}

/**
 * 粒子：春天飘花瓣、夏天飘竹叶、秋天飘枫叶（数量克制，下雨时减弱）；名胜瀑布潭口起水雾。
 */
export class ParticleSystem {
  readonly group = new THREE.Group()
  private readonly drift: THREE.Points
  private readonly driftMat: THREE.ShaderMaterial
  private readonly mist: THREE.Points
  private readonly mistMat: THREE.ShaderMaterial
  scale = 1

  constructor(waterfalls: { x: number; y: number; z: number; width: number }[]) {
    const seeds = new Float32Array(DRIFT * 4).map(() => Math.random())
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DRIFT * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    this.driftMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
        uBox: { value: 120 },
        uAmount: { value: 0 },
        uColA: { value: new THREE.Color() },
        uColB: { value: new THREE.Color() },
        uPx: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        uniform float uTime;
        uniform vec3 uCenter;
        uniform float uBox;
        uniform float uAmount;
        uniform float uPx;
        varying float vPick;
        varying float vOn;
        void main() {
          vOn = step(aSeed.w, uAmount);
          vPick = aSeed.z;
          float t = uTime * (0.5 + aSeed.z * 0.5);
          float wx = uCenter.x + mod(aSeed.x * uBox + t * 3.0 - uCenter.x + uBox * 0.5, uBox) - uBox * 0.5 + sin(t + aSeed.y * 30.0) * 2.0;
          float wz = uCenter.z + mod(aSeed.y * uBox + t * 1.5 - uCenter.z + uBox * 0.5, uBox) - uBox * 0.5;
          float wy = uCenter.y + 40.0 - mod(aSeed.z * 60.0 + t * 2.2, 60.0);
          vec4 mv = modelViewMatrix * vec4(wx, wy, wz, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vOn * 2.6 * uPx * 160.0 / max(6.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColA;
        uniform vec3 uColB;
        varying float vPick;
        varying float vOn;
        void main() {
          if (vOn < 0.5) discard;
          vec2 q = gl_PointCoord - 0.5;
          if (max(abs(q.x), abs(q.y)) > 0.3) discard;
          gl_FragColor = vec4(vPick < 0.6 ? uColA : uColB, 0.95);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.drift = new THREE.Points(g, this.driftMat)
    this.drift.frustumCulled = false

    /* 瀑布水雾 */
    const mp = new Float32Array(Math.max(1, waterfalls.length) * MIST * 3)
    const ms = new Float32Array(Math.max(1, waterfalls.length) * MIST).map(() => Math.random())
    waterfalls.forEach((w, k) => {
      for (let i = 0; i < MIST; i++) {
        const o = (k * MIST + i) * 3
        mp[o] = w.x + 0.5 + (Math.random() - 0.5) * (w.width + 4)
        mp[o + 1] = w.y
        mp[o + 2] = w.z + 0.5 + (Math.random() - 0.2) * 5
      }
    })
    const mg = new THREE.BufferGeometry()
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3))
    mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1))
    this.mistMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uCol: { value: new THREE.Color(WaterTokens.foam) }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPx;
        varying float vA;
        void main() {
          float t = fract(uTime * 0.25 + aSeed);
          vec3 p = position + vec3(sin(aSeed * 40.0 + uTime) * 0.6, t * 5.0, cos(aSeed * 30.0) * 0.5);
          vA = (1.0 - t) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (4.0 + t * 8.0) * uPx * 100.0 / max(6.0, -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCol;
        varying float vA;
        void main() {
          vec2 q = gl_PointCoord - 0.5;
          if (max(abs(q.x), abs(q.y)) > 0.45) discard;
          gl_FragColor = vec4(uCol, vA);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
    })
    this.mist = new THREE.Points(mg, this.mistMat)
    this.mist.visible = waterfalls.length > 0
    this.group.add(this.drift, this.mist)
  }

  update(time: number, focus: THREE.Vector3, distance: number, season: Season, wet: number, pixelRatio: number): void {
    const [a, b, amount] = DRIFT_COLORS[season]
    const du = this.driftMat.uniforms
    du.uTime.value = time
    du.uCenter.value.copy(focus)
    du.uBox.value = Math.min(240, Math.max(80, distance * 0.8))
    du.uAmount.value = distance < 420 ? amount * (1 - wet * 0.7) * 0.6 * this.scale : 0
    du.uColA.value.set(a)
    du.uColB.value.set(b)
    du.uPx.value = pixelRatio
    this.drift.visible = du.uAmount.value > 0.01
    this.mistMat.uniforms.uTime.value = time
    this.mistMat.uniforms.uPx.value = pixelRatio
  }

  dispose(): void {
    this.drift.geometry.dispose()
    this.mist.geometry.dispose()
    this.driftMat.dispose()
    this.mistMat.dispose()
  }
}
