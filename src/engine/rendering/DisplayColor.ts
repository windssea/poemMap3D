import * as THREE from 'three'

/**
 * 「屏幕上看到的颜色」→「场景里该写的颜色」。
 *
 * 渲染流程末端是 ACES 色调映射（three 的 ACESFilmicToneMapping）：它把高饱和的青蓝压向灰白，
 * 场景里写 #89BBDD，屏幕上会变成 #A8BCC3 一类发灰的浅蓝——天空怎么调都不够蓝就是这个原因。
 * 验收给的天空三段色（#89BBDD / #C3DDE9 / #EAE8DA 之类）说的是屏幕上的颜色，
 * 所以这里按当前曝光把它们反解回场景色（可以大于 1，即 HDR），写进天空与图边雾之后再走同一条色调映射，
 * 屏幕上就是那个颜色。
 *
 * 只对天空这类「直接看到的颜色」用；光照、材质的颜色照旧是场景色。
 * 公式与 three/src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js 的 ACESFilmicToneMapping 一致。
 */

type V3 = [number, number, number]

const col = (a: V3, b: V3, c: V3, v: V3): V3 => [a[0] * v[0] + b[0] * v[1] + c[0] * v[2], a[1] * v[0] + b[1] * v[1] + c[1] * v[2], a[2] * v[0] + b[2] * v[1] + c[2] * v[2]]
const IN_A: V3 = [0.59719, 0.076, 0.0284]
const IN_B: V3 = [0.35458, 0.90834, 0.13383]
const IN_C: V3 = [0.04823, 0.01566, 0.83777]
const OUT_A: V3 = [1.60475, -0.10208, -0.00327]
const OUT_B: V3 = [-0.53108, 1.10813, -0.07276]
const OUT_C: V3 = [-0.07367, -0.00605, 1.07602]
const fit = (v: V3): V3 => v.map((x) => (x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081)) as V3

/** 场景线性色 → 屏幕线性色（与着色器里的 ACESFilmicToneMapping 一致，含 clamp） */
export function acesFilmic(c: V3, exposure: number): V3 {
  const v = col(IN_A, IN_B, IN_C, c.map((x) => (x * exposure) / 0.6) as V3)
  return col(OUT_A, OUT_B, OUT_C, fit(v)).map((x) => Math.min(1, Math.max(0, x))) as V3
}

const det3 = (m: number[][]): number => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])

/** 反解 acesFilmic(x) = target：阻尼牛顿法，数值雅可比，几步即收敛 */
export function inverseAces(target: V3, exposure: number): V3 {
  let x: V3 = [...target]
  for (let it = 0; it < 60; it++) {
    const y = acesFilmic(x, exposure)
    const f = y.map((v, i) => v - target[i])
    if (Math.max(...f.map(Math.abs)) < 1e-6) break
    const A = [0, 1, 2].map(() => [0, 0, 0])
    for (let j = 0; j < 3; j++) {
      const p: V3 = [...x]
      p[j] += 1e-4
      const yj = acesFilmic(p, exposure)
      for (let i = 0; i < 3; i++) A[i][j] = (yj[i] - y[i]) / 1e-4
    }
    const det = det3(A)
    if (Math.abs(det) < 1e-12) break
    const dx = [0, 1, 2].map((c) => det3(A.map((r, i) => r.map((v, j) => (j === c ? f[i] : v)))) / det)
    x = x.map((v, i) => Math.max(1e-4, v - dx[i] * 0.8)) as V3
  }
  return x
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * 末端调色（RenderPipeline 的 GradeShader：暗部偏冷、亮部偏暖）对某个屏幕色的增益。
 * 公式与 RenderPipeline.setLight 里给的分色调色一致；warm 是晨暮的暖度（0 正午、1 日出日落）。
 * 反解时先把它除掉，否则晨暮的天空会被高光暖色调偏掉一截蓝。
 */
export function gradeGain(v: V3, warm: number): V3 {
  const l = 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2]
  const str = 0.5 + 0.2 * warm
  const a = (1 - smooth(0.05, 0.55, l)) * str
  const b = smooth(0.45, 1, l) * str
  const sT: V3 = [0.94, 0.99, 1.05]
  const hT: V3 = [1.04 + 0.05 * warm, 1.01 + 0.01 * warm, 0.95 - 0.06 * warm]
  return [0, 1, 2].map((i) => (1 + (sT[i] - 1) * a) * (1 + (hT[i] - 1) * b)) as V3
}

const srgbToLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))

/**
 * 「屏幕上的颜色」（#rrggbb，sRGB）→ 场景色（线性，可大于 1）。
 * 先除掉末端调色的增益，再反解 ACES 色调映射。warm：晨暮 1、正午 0。
 */
export function displayToScene(hex: string, exposure: number, warm = 0): THREE.Color {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as V3
  const g = gradeGain(v, warm)
  const lin = v.map((x, i) => srgbToLinear(Math.min(1, x / g[i]))) as V3
  const [r, gg, b] = inverseAces(lin, exposure)
  return new THREE.Color().setRGB(r, gg, b)
}
