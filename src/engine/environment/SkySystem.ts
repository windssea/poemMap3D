import * as THREE from 'three'
import { MaterialTokens, SkyTokens } from '../../config/palette'
import { GLSL_HASH, GLSL_SKY_BASE } from '../rendering/ShaderLibrary'
import type { SharedUniforms } from '../rendering/SharedUniforms'

/**
 * 天空：天顶—地平渐变（渐变带随镜头俯仰自适应：俯视压进俯角带、仰视铺满全带）；日轮（核、缘、晕，角尺寸不跟镜头远近变）；夜里独立的满月（像素圆盘、月海、月晕）、
 * 两层明暗不一的星、一道淡淡的银河。日轮画在太阳方向上，深度测试让山体挡住它。不受雾影响。
 */
export class SkySystem {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial

  constructor(shared: SharedUniforms) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uSkyTop: shared.uSkyTop,
        uSkyMid: shared.uSkyMid,
        uHorizonColor: shared.uHorizonColor,
        uSkyLift: shared.uSkyLift,
        uGlowDir: shared.uGlowDir,
        uGlowCol: shared.uGlowCol,
        uGlowCol2: shared.uGlowCol2,
        uGlowK: shared.uGlowK,
        uNight: shared.uNight,
        uTime: shared.uTime,
        uWet: shared.uWet,
        uSunBody: { value: new THREE.Vector3(0.3, 0.85, 0.55) },
        uMoonDir: { value: new THREE.Vector3(0.4, 0.5, -0.6) },
        uSunCore: { value: new THREE.Color(SkyTokens.day.core) },
        uSunRim: { value: new THREE.Color(SkyTokens.day.rim) },
        uSunHalo: { value: new THREE.Color(SkyTokens.day.halo) },
        uSunR: { value: 0.011 },
        uHalo: { value: 0.18 },
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
        uniform float uNight;
        uniform float uTime;
        uniform float uWet;
        uniform vec3 uSunBody;
        uniform vec3 uMoonDir;
        uniform vec3 uSunCore;
        uniform vec3 uSunRim;
        uniform vec3 uSunHalo;
        uniform float uSunR;
        uniform float uHalo;
        uniform vec3 uMoonDisc;
        varying vec3 vDir;
        ${GLSL_SKY_BASE}
        ${GLSL_HASH}
        void main() {
          vec3 d = normalize(vDir);
          // 底色由 skyBase 给出（俯看压进俯角带、平视仰视铺满全带，晨暮加霞光），与地形边缘雾共用
          vec3 col = skyBase(d);
          float clearSky = 1.0 - uWet;
          float nearMoon = 0.0;
          // 日轮跟太阳同一方向。落到地平线下就不画。角半径不跟镜头距离变。
          // 造型和月亮同一套：九格像素圆，核亮、缘深，不是光滑光斑。
          vec3 sunS = normalize(uSunBody);
          float sunFacing = dot(d, sunS);
          if (sunS.y > 0.0 && sunFacing > 0.94) {
            vec3 upv = abs(sunS.y) > 0.97 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
            vec3 t1 = normalize(cross(sunS, upv));
            vec3 t2 = cross(t1, sunS);
            vec2 q = vec2(dot(d, t1), dot(d, t2)) / max(sunFacing, 0.2);
            float R = max(uSunR, 0.004);
            vec2 pq = floor(q / R * 9.0);
            float rr = length((pq + 0.5) / 9.0);
            float disc = step(rr, 1.0);
            float core = step(rr, 0.56);
            vec3 body = mix(uSunRim, uSunCore, core);
            float risen = smoothstep(0.0, 0.02, sunS.y);
            float lq = length(q);
            col = mix(col, uSunHalo, exp(-lq / (R * 1.45)) * (1.0 - disc) * uHalo * risen * clearSky);
            col = mix(col, body, disc * risen * (1.0 - uWet * 0.85));
          }
          // 月亮是自己的像素圆盘，随夜色连续淡入（不在某个夜色值上突然出现）。
          // 月盘固定在月光的方位上（与影子、受光面一致，不随镜头挪动）。
          // 俯看时挂得高就在画面外，所以俯看时圆盘压到贴近地平（约 9°，方位不变）；平视 / 仰视（uSkyLift→1）挂在真实的月光高度上。
          float moonA = smoothstep(0.2, 0.7, uNight);
          if (moonA > 0.001) {
            vec3 moonS = normalize(uMoonDir);
            float facing = dot(d, moonS);
            if (facing > 0.8) {
              vec3 upv = abs(moonS.y) > 0.97 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
              vec3 t1 = normalize(cross(moonS, upv));
              vec3 t2 = cross(t1, moonS);
              vec2 q = vec2(dot(d, t1), dot(d, t2)) / max(facing, 0.2);
              float R = 0.036;
              vec2 pq = floor(q / R * 9.0);
              float rr = length((pq + 0.5) / 9.0);
              float disc = step(rr, 1.0);
              vec2 mp = pq / 9.0;
              float maria = smoothstep(0.42, 0.2, length(mp - vec2(-0.25, 0.3))) * 0.8 + smoothstep(0.32, 0.12, length(mp - vec2(0.3, 0.05))) * 0.7 + smoothstep(0.26, 0.1, length(mp - vec2(-0.05, -0.4))) * 0.6;
              vec3 body = uMoonDisc * (1.18 - 0.3 * maria - 0.1 * hash12(pq) - 0.12 * smoothstep(0.7, 1.0, rr));
              col = mix(col, body, disc * moonA * (1.0 - uWet * 0.85));
              float lq = length(q);
              col += uMoonDisc * 0.22 * exp(-lq / (R * 1.35)) * (1.0 - disc) * clearSky * moonA;
              nearMoon = exp(-lq / (R * 3.0)) * moonA;
            }
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
      depthTest: true,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.mat)
    this.mesh.frustumCulled = false
    // 晚于地形绘制，片元深度钉在远平面，山和房子写过的深度会挡住日轮
    this.mesh.renderOrder = 8
  }

  update(
    camera: THREE.Camera,
    sunBody: THREE.Vector3,
    moonDir: THREE.Vector3,
    core: THREE.Color,
    rim: THREE.Color,
    halo: THREE.Color,
    sunR: number,
    haloGain: number,
  ): void {
    this.mesh.position.copy(camera.position)
    const far = (camera as THREE.PerspectiveCamera).far ?? 5000
    this.mesh.scale.setScalar(far * 0.9)
    const u = this.mat.uniforms
    ;(u.uSunBody.value as THREE.Vector3).copy(sunBody)
    ;(u.uMoonDir.value as THREE.Vector3).copy(moonDir)
    ;(u.uSunCore.value as THREE.Color).copy(core)
    ;(u.uSunRim.value as THREE.Color).copy(rim)
    ;(u.uSunHalo.value as THREE.Color).copy(halo)
    u.uSunR.value = sunR
    u.uHalo.value = haloGain
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
