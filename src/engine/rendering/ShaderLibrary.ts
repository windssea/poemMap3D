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
uniform float uFogOn;
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

/**
 * 顶点 AO（0–3）只换成环境遮蔽强度，不改网格里的等级。
 * 0.80 / 0.88 / 0.95 / 1：缝、檐下、树冠里仍看得出，但不再把颜色乘没。
 * uAoStrength 0 时等于不遮蔽，供光照调试对照。
 */
export const GLSL_AO = /* glsl */ `
uniform float uAoStrength;
float aoCurve(float ao) {
  float shaped = ao < 0.5 ? 0.80 : ao < 1.5 ? 0.88 : ao < 2.5 ? 0.95 : 1.0;
  return mix(1.0, shaped, uAoStrength);
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
 * 方块体积感。直射光已由 Lambert 的 NdotL 区分受光面，这里只作较轻的一档，
 * 并且只乘间接光（见方块 / 覆盖图材质），避免和太阳再压一次。
 * 顶 1，东西侧 0.94，南北侧 0.88，底 0.84。只乘间接光。uFaceStrength 0 时各面一样。
 */
export const GLSL_FACE_SHADE = /* glsl */ `
uniform float uFaceStrength;
float faceShade(vec3 n) {
  vec3 a = abs(n);
  float s = (a.y >= a.x && a.y >= a.z) ? (n.y > 0.0 ? 1.0 : 0.84) : (a.x > a.z ? 0.94 : 0.88);
  return mix(1.0, s, uFaceStrength);
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
  return uMist * uFogOn * low * smoothstep(uMistNear * 2.6, uMistNear * 5.4 + 280.0, d);
}
`

/**
 * 天空底色（不含日月星）：给定视线方向 d 返回该方向上天空的颜色。
 * 天空球与地形的边缘雾共用它——地图边缘、远海化进「这个方向上的天色」而不是一个固定的雾色，
 * 所以不论镜头俯仰，图边都与它背后的天空严丝合缝地消隐。
 *  - 俯看地图（uSkyLift=0）：三段渐变压进俯角带，看得见的天在俯角里；
 *  - 地面仰视（uSkyLift=1）：地平线最浅最暖，向上过中段青到顶青；
 *  - 晨、暮：以日出 / 日落方位为中心的霞光，贴地平线最浓，离方位越远越薄越低，上缘一圈粉紫，
 *    背日一侧留一道很淡的粉。
 */
export const GLSL_SKY_BASE = /* glsl */ `
uniform vec3 uSkyTop;
uniform vec3 uSkyMid;
uniform vec3 uHorizonColor;
uniform float uSkyLift;
uniform vec3 uGlowDir;
uniform vec3 uGlowCol;
uniform vec3 uGlowCol2;
uniform float uGlowK;
vec3 skyBase(vec3 d) {
  float y = d.y;
  // 俯看：三段渐变铺进 -0.78…-0.16 这段俯角，最深处带一点中段青，不铺成宣纸白墙
  float lift = clamp((y + 0.78) / 0.62, 0.0, 1.0);
  lift = lift * lift * (3.0 - 2.0 * lift);
  vec3 skirt = mix(uSkyMid, uHorizonColor, 0.45) * 0.7;
  vec3 down = mix(skirt, uSkyMid, smoothstep(0.1, 0.62, lift));
  down = mix(down, uSkyTop, smoothstep(0.4, 0.92, lift));
  // 站在地上看：地平线 → 中段 → 顶，低头则压向雾色
  float up = max(y, 0.0);
  vec3 ground = mix(uHorizonColor, uSkyMid, smoothstep(0.0, 0.26, up));
  ground = mix(ground, uSkyTop, smoothstep(0.12, 0.62, up));
  ground = mix(ground, uHorizonColor * 0.94, smoothstep(0.0, 0.35, -y));
  vec3 col = mix(down, ground, uSkyLift);
  // 霞光
  if (uGlowK > 0.001) {
    float dl = length(d.xz);
    vec2 gh = normalize(uGlowDir.xz + vec2(1e-5));
    float az = dl > 1e-3 ? dot(d.xz / dl, gh) : 0.0;
    // 贴地平线处取平滑的高度（不在 y=0 折出一道尖），地平线之下衰减得更快
    float hgt = sqrt(y * y + 0.0004) * mix(0.7, 1.0, smoothstep(-0.05, 0.05, y));
    float wide = smoothstep(-0.5, 1.0, az);
    float core = pow(max(az, 0.0), 4.0);
    float band = exp(-hgt / mix(0.085, 0.26, core));
    col = mix(col, uGlowCol, clamp((0.42 * wide + 0.9 * core) * band, 0.0, 1.0) * uGlowK);
    float rim = exp(-pow((hgt - (0.1 + 0.11 * core)) / 0.12, 2.0));
    col = mix(col, uGlowCol2, rim * (0.25 * wide + 0.45 * core) * uGlowK * 0.6);
    col = mix(col, uGlowCol2, smoothstep(0.1, 1.0, -az) * exp(-hgt / 0.14) * uGlowK * 0.22);
  }
  return col;
}
`

/** 边缘雾：地图四边与离岸远海渐隐入雾（取样雾图）；极远边带向地平线天色收敛，不出灰白墙 */
export const GLSL_EDGE_FOG = /* glsl */ `
uniform sampler2D uFogMap;
uniform vec4 uFogRect;
uniform vec3 uHorizonColor;
/** 贴图边/越界的像素占比：0 内陆 → 1 极远边带（雾图 band 内 + 矩形外） */
float edgeBandK(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0));
  vec2 b = min(c, 1.0 - c);
  return 1.0 - smoothstep(0.015, 0.09, min(b.x, b.y));
}
float edgeFog(vec3 w) {
  vec2 uv = (w.xz - uFogRect.xy) / uFogRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
    // 出图（境外海面）：按越界的世界格距离渐变到 1，不再一刀切全雾
    vec2 d = max(max(-uv, vec2(0.0)), uv - 1.0);
    vec2 wl = d * uFogRect.zw;
    return smoothstep(0.0, 480.0, max(wl.x, wl.y)) * uFogOn;
  }
  return texture2D(uFogMap, uv).r * uFogOn;
}
`

export const GLSL_DESATURATE = /* glsl */ `
vec3 desaturate(vec3 c, float s) {
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return mix(vec3(l), c, s);
}
`

/**
 * 雾混合系数伪彩色（Phase 0 定位中景是否被过早雾染）：
 * 蓝 0 → 黄 0.5 → 红 1。调试视图 uDebugView = 5 时直接把系数画在屏幕上。
 */
export const GLSL_FOG_HEAT = /* glsl */ `
vec3 fogHeat(float f) {
  f = clamp(f, 0.0, 1.0);
  vec3 cool = vec3(0.12, 0.25, 0.85);
  vec3 warm = vec3(0.95, 0.85, 0.35);
  vec3 hot = vec3(0.9, 0.25, 0.15);
  return f < 0.5 ? mix(cool, warm, f * 2.0) : mix(warm, hot, (f - 0.5) * 2.0);
}
`
