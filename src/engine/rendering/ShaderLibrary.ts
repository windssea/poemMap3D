/**
 * 共用 GLSL 片段。所有颜色都来自 uniform（由 config/palette 写入），着色器里不写死色值。
 */

/** 4×4 Bayer 抖动阈值：区块淡入、覆盖图让位用「屏幕门」透明，避免半透明排序 */
export const GLSL_BAYER = /* glsl */ `
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i] + 0.5) / 16.0;
}
`

export const GLSL_HASH = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`

export const GLSL_ENV_UNIFORMS = /* glsl */ `
uniform float uTime;
uniform vec3 uSeasonGrass;
uniform vec3 uSeasonFoliage;
uniform float uAutumn;
uniform float uBlossom;
uniform float uSnow;
uniform float uNight;
uniform float uWet;
uniform float uSaturation;
uniform vec3 uAutumnA;
uniform vec3 uAutumnB;
uniform vec3 uAutumnC;
`

/**
 * 季节染色。tclass：1 草、2 阔叶、3 常绿、4 花树。
 * 顶点色（生物群系色）是 sRGB 字节，这里先转线性再相乘。
 */
export const GLSL_SEASON = /* glsl */ `
vec3 srgbToLinear3(vec3 c) { return pow(c, vec3(2.2)); }
vec3 seasonTint(vec3 tintSrgb, float tclass, vec3 wpos) {
  vec3 tint = srgbToLinear3(tintSrgb);
  if (tclass < 0.5) return tint;
  // 按方块取一个稳定的随机数，秋色成片而不花哨
  float h = hash13(floor(wpos / 3.0));
  if (tclass < 1.5) {
    vec3 g = tint * uSeasonGrass;
    return mix(g, g * vec3(1.25, 1.02, 0.55), uAutumn * 0.55);
  }
  if (tclass < 2.5) {
    vec3 f = tint * uSeasonFoliage;
    vec3 fall = h < 0.4 ? uAutumnA : h < 0.75 ? uAutumnB : uAutumnC;
    return mix(f, fall, uAutumn * (0.65 + 0.35 * h));
  }
  if (tclass < 3.5) return tint * mix(vec3(1.0), uSeasonFoliage, 0.35);
  return tint;
}
`

export const GLSL_AO = /* glsl */ `
float aoCurve(float ao) {
  return ao < 0.5 ? 0.52 : ao < 1.5 ? 0.68 : ao < 2.5 ? 0.84 : 1.0;
}
`

/** 顶面积雪：按世界坐标取斑块，积雪量越大越满 */
export const GLSL_SNOW = /* glsl */ `
vec3 applySnow(vec3 col, vec3 wnormal, vec3 wpos, vec3 snowColor) {
  if (uSnow <= 0.001 || wnormal.y < 0.55) return col;
  float patchN = hash12(floor(wpos.xz));
  float cover = smoothstep(0.0, 1.0, uSnow * 1.6 - patchN * 0.6);
  return mix(col, snowColor, cover * smoothstep(0.55, 0.9, wnormal.y));
}
`

export const GLSL_DESATURATE = /* glsl */ `
vec3 desaturate(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}
`
