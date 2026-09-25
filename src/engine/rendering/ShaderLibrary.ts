import { GLSL_CLIMATE } from '../../world/climate/Climate'
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
/** 季节染色：南方（积雪气候系数低）四季常绿，秋冬只略变色 */
export const GLSL_SEASON = /* glsl */ `
${GLSL_CLIMATE}
vec3 srgbToLinear3(vec3 c) { return pow(c, vec3(2.2)); }
vec3 seasonTint(vec3 tintSrgb, float tclass, vec3 wpos) {
  vec3 tint = srgbToLinear3(tintSrgb);
  if (tclass < 0.5) return tint;
  // 按方块取一个稳定的随机数，秋色成片而不花哨
  float h = hash13(floor(wpos / 3.0));
  float warm = 1.0 - snowClimate(wpos);
  if (tclass < 1.5) {
    vec3 g = tint * mix(uSeasonGrass, vec3(1.0), warm * 0.7);
    return mix(g, g * vec3(1.25, 1.02, 0.55), uAutumn * 0.55 * (1.0 - 0.6 * warm));
  }
  if (tclass < 2.5) {
    vec3 f = tint * mix(uSeasonFoliage, vec3(1.0), warm * 0.75);
    vec3 fall = h < 0.4 ? uAutumnA : h < 0.75 ? uAutumnB : uAutumnC;
    return mix(f, fall, uAutumn * (0.65 + 0.35 * h) * (1.0 - 0.75 * warm));
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

/** 积雪：climate 为该处的积雪气候系数（北方满、江南薄、岭南无，高山皆有） */
export const GLSL_SNOW = /* glsl */ `
vec3 applySnow(vec3 col, vec3 wnormal, vec3 wpos, vec3 snowColor, float climate) {
  float amount = uSnow * climate;
  if (amount <= 0.001 || wnormal.y < 0.55) return col;
  float patchN = hash12(floor(wpos.xz));
  float cover = smoothstep(0.0, 1.0, amount * 1.6 - patchN * 0.6);
  return mix(col, snowColor, cover * smoothstep(0.55, 0.9, wnormal.y));
}
`

/**
 * 面向明暗（方块世界的体积感）：顶面最亮，东西侧面、南北侧面依次暗一档，底面最暗。
 * 阴天、背光、阴影里 Lambert 各面几乎一样亮，块面糊成一片；乘上这一档，楼阁山体的形体就立住了。
 */
export const GLSL_FACE_SHADE = /* glsl */ `
float faceShade(vec3 n) {
  vec3 a = abs(n);
  if (a.y >= a.x && a.y >= a.z) return n.y > 0.0 ? 1.0 : 0.6;
  return a.x > a.z ? 0.87 : 0.79;
}
`

/**
 * 谷地山岚：低处（注视点附近地面以上二三十格内）随距离起一层薄雾，晨起、雨中浓，白天淡。
 * 远近都是千里江山图里那种一层层退远的烟岚。
 */
export const GLSL_MIST = /* glsl */ `
uniform float uMist;
uniform float uMistY;
uniform float uMistNear;
float valleyMist(vec3 w) {
  // 注视处清楚，越过注视点往远处才一层层起岚
  float d = length(w - cameraPosition);
  float low = 1.0 - smoothstep(uMistY - 4.0, uMistY + 22.0, w.y);
  return uMist * low * smoothstep(uMistNear * 1.1, uMistNear * 3.2 + 120.0, d);
}
`

/** 边缘雾：地图四边与离岸远海渐隐入雾（取样雾图） */
export const GLSL_EDGE_FOG = /* glsl */ `
uniform sampler2D uFogMap;
uniform vec4 uFogRect;
float edgeFog(vec3 w) {
  vec2 uv = (w.xz - uFogRect.xy) / uFogRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  return texture2D(uFogMap, uv).r;
}
`

export const GLSL_DESATURATE = /* glsl */ `
vec3 desaturate(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}
`
