import * as THREE from 'three'
import { BlockRenderLayer } from '../../world/block/BlockDefinition'
import { GLSL_AO, GLSL_BAYER, GLSL_DESATURATE, GLSL_EDGE_FOG, GLSL_ENV_UNIFORMS, GLSL_FACE_SHADE, GLSL_FOG_HEAT, GLSL_HASH, GLSL_MIST, GLSL_SEASON, GLSL_SNOW } from './ShaderLibrary'
import type { SharedUniforms } from './SharedUniforms'
import { createBlockTextureArray } from './TextureAtlas'
import { GLSL_CLIMATE } from '../../world/climate/Climate'

const WHITE = new THREE.Color(1, 1, 1)

/** 每个网格自带的淡入值：渲染前写进材质 uniform（屏幕门透明） */
export interface FadeHolder {
  fade: { value: number }
}

const BLOCK_VERTEX_DECL = /* glsl */ `
attribute vec2 aUv;
attribute float aTile;
attribute float aAo;
attribute vec3 aTint;
attribute float aFlags;
varying vec3 vBlockUv;
varying float vAo;
varying vec3 vTint;
varying float vFlags;
varying vec3 vBWorld;
varying vec3 vBNormal;
`

/**
 * 雾之后再按边缘雾图混向雾色：地图四边、远海、海南以南渐隐；极远边带向地平线天色收敛。
 * 空气透视只看「像素到镜头的世界距离」——近景、远景、远景片、全国覆盖图共用这一条，
 * 与区块层级无关，所以层与层的交界上不会有亮度 / 饱和度的台阶。
 */
const EDGE_FOG_FRAGMENT = (v: string) => `#ifdef USE_FOG
 { float apD = length(${v} - cameraPosition);
   float ap = smoothstep(uMistNear * 1.3, uMistNear * 4.0 + 260.0, apD) * 0.42 * uFogOn;
   vec3 grey = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
   gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(grey, fogColor, 0.4), ap); }
#endif
#include <fog_fragment>
#ifdef USE_FOG
 float ef = edgeFog(${v});
 vec3 edgeFogCol = mix(fogColor, skyBase(normalize(${v} - cameraPosition)), smoothstep(0.25, 1.0, ef));
 gl_FragColor.rgb = mix(gl_FragColor.rgb, edgeFogCol, max(ef, valleyMist(${v})));
#endif`

/**
 * 分级让位：掩膜 255 = 近景已显示，192 = 远景已显示，128 = 只有远景片。
 * 远景在 255 处丢弃，远景片在 192 以上丢弃，覆盖图在任何一级处丢弃。
 */
const maskDiscard = (threshold: number) => /* glsl */ `
 { vec2 mk = (vBWorld.xz - uChunkMaskRect.xy) / uChunkMaskRect.zw;
   if (mk.x > 0.0 && mk.y > 0.0 && mk.x < 1.0 && mk.y < 1.0 && texture2D(uChunkMask, mk).r > ${threshold.toFixed(2)}) discard; }`
const FAR_MASK = maskDiscard(0.9)
const COARSE_MASK = maskDiscard(0.6)

/** 光照调试视图只编进开发构建：生产着色器里没有这些分支 */
const DEBUG_VIEW_BLOCK = import.meta.env.DEV
  ? /* glsl */ `
          if (uDebugView > 0.5) {
            if (uDebugView < 1.5) outgoingLight = col;
            else if (uDebugView < 2.5) outgoingLight = col * aoCurve(vAo);
            else if (uDebugView < 3.5) outgoingLight = col * faceShade(vBNormal);
            else if (uDebugView < 4.5) outgoingLight = reflectedLight.directDiffuse;
            else outgoingLight = fogHeat(max(edgeFog(vBWorld), valleyMist(vBWorld)));
          }`
  : ''
const DEBUG_VIEW_OVERVIEW = import.meta.env.DEV ? 'if (uDebugView > 4.5) outgoingLight = fogHeat(max(edgeFog(vOWorld), valleyMist(vOWorld)));' : ''

const BLOCK_FRAGMENT_DECL = /* glsl */ `
uniform highp sampler2DArray uBlockAtlas;
uniform sampler2D uChunkMask;
uniform vec4 uChunkMaskRect;
uniform float uFade;
uniform vec3 uLeafGreen;
uniform vec3 uSnowColor;
uniform vec3 uWindow;
uniform float uBare;
uniform float uLitFar;
uniform float uLitSeq;
uniform vec3 uLitCenter;
uniform float uDebugView;
uniform vec3 uSunDir;
uniform sampler2D uBakeMap;
uniform vec4 uBakeRect;
/** 烘焙的天空可见度：范围外为 1；外沿 12% 渐入，贴图边上的院落、山坳不在烘焙区边界起一圈亮度台阶 */
float bakedSky(vec3 w) {
  if (uBakeRect.z < 1.0) return 1.0;
  vec2 uv = (w.xz - uBakeRect.xy) / uBakeRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 1.0;
  vec2 e = min(uv, 1.0 - uv);
  return mix(1.0, texture2D(uBakeMap, uv).r, smoothstep(0.0, 0.12, min(e.x, e.y)));
}
uniform float uLotus;
varying vec3 vBlockUv;
varying float vAo;
varying vec3 vTint;
varying float vFlags;
varying vec3 vBWorld;
varying vec3 vBNormal;
${GLSL_ENV_UNIFORMS}
${GLSL_HASH}
${GLSL_BAYER}
${GLSL_SEASON}
${GLSL_AO}
${GLSL_SNOW}
${GLSL_DESATURATE}
${GLSL_EDGE_FOG}
${GLSL_MIST}
${GLSL_FOG_HEAT}
${GLSL_FACE_SHADE}
`

/**
 * 材质库：方块四个渲染层各一种材质、水面、覆盖图、特效。
 * 方块材质基于 Lambert（保留 Three.js 的光照、阴影、雾），在着色器里接入贴图数组、生物群系染色、
 * 季节、积雪、AO 与夜间自发光。
 */
export class MaterialLibrary {
  readonly atlas: THREE.DataArrayTexture
  readonly block: THREE.Material[]
  /** 远景片用：在已显示近景 / 远景区块处让位 */
  readonly blockCoarse: THREE.Material[]
  /** 远景（2×2×2）用：在近景已显示处让位 */
  readonly blockFar: THREE.Material[]
  readonly waterFar: THREE.ShaderMaterial
  readonly water: THREE.ShaderMaterial
  readonly waterCoarse: THREE.ShaderMaterial
  readonly overview: THREE.MeshLambertMaterial
  readonly overviewWater: THREE.ShaderMaterial

  constructor(private readonly shared: SharedUniforms, anisotropy: number) {
    this.atlas = createBlockTextureArray(anisotropy)
    this.block = []
    this.block[BlockRenderLayer.Solid] = this.createBlockMaterial('solid')
    this.block[BlockRenderLayer.Cutout] = this.createBlockMaterial('cutout')
    this.block[BlockRenderLayer.Translucent] = this.createBlockMaterial('translucent')
    this.block[BlockRenderLayer.Effect] = this.createGlowMaterial()
    this.block[BlockRenderLayer.Plant] = this.block[BlockRenderLayer.Cutout]
    this.blockFar = []
    this.blockFar[BlockRenderLayer.Solid] = this.createBlockMaterial('solid', 'far')
    this.blockFar[BlockRenderLayer.Cutout] = this.createBlockMaterial('cutout', 'far')
    this.blockFar[BlockRenderLayer.Translucent] = this.createBlockMaterial('translucent', 'far')
    this.blockFar[BlockRenderLayer.Effect] = this.createGlowMaterial()
    this.blockFar[BlockRenderLayer.Plant] = this.blockFar[BlockRenderLayer.Cutout]
    this.blockCoarse = []
    this.blockCoarse[BlockRenderLayer.Solid] = this.createBlockMaterial('solid', 'coarse')
    this.blockCoarse[BlockRenderLayer.Cutout] = this.createBlockMaterial('cutout', 'coarse')
    this.blockCoarse[BlockRenderLayer.Translucent] = this.createBlockMaterial('translucent', 'coarse')
    this.blockCoarse[BlockRenderLayer.Effect] = this.block[BlockRenderLayer.Effect]
    this.blockCoarse[BlockRenderLayer.Plant] = this.blockCoarse[BlockRenderLayer.Cutout]
    this.water = this.createWaterMaterial(false)
    this.waterCoarse = this.createWaterMaterial(false, 'coarse')
    this.waterFar = this.createWaterMaterial(false, 'far')
    this.overview = this.createOverviewMaterial()
    this.overviewWater = this.createWaterMaterial(true)
  }

  /** 每个网格一个淡入 holder：onBeforeRender 时写进共享材质 */
  static attachFade(mesh: THREE.Mesh, holder: FadeHolder): void {
    mesh.onBeforeRender = (_r, _s, _c, _g, material) => {
      const u = (material as THREE.Material).userData.fade as { value: number } | undefined
      if (u && u.value !== holder.fade.value) {
        u.value = holder.fade.value
        ;(material as THREE.ShaderMaterial).uniformsNeedUpdate = true
      }
    }
  }

  private createBlockMaterial(kind: 'solid' | 'cutout' | 'translucent', tier: 'near' | 'far' | 'coarse' = 'near'): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: WHITE })
    const fade = { value: 1 }
    m.userData.fade = fade
    if (kind === 'cutout') m.side = THREE.DoubleSide
    if (kind === 'translucent') {
      m.transparent = true
      m.depthWrite = false
    }
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared, { uBlockAtlas: { value: this.atlas }, uFade: fade })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${BLOCK_VERTEX_DECL}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vBlockUv = vec3(aUv / 16.0, aTile);
          vAo = aAo;
          vTint = aTint;
          vFlags = aFlags;
          vBWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vBNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        )
      let frag = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${BLOCK_FRAGMENT_DECL}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;${tier === 'coarse' ? COARSE_MASK : tier === 'far' ? FAR_MASK : ''}`)
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec4 texel = texture(uBlockAtlas, vec3(vBlockUv.x, -vBlockUv.y, vBlockUv.z));
          float winRaw = dot(texel.rgb, vec3(0.333)); // 亮窗的糊纸 / 窗棂判断用取样原值（下面一行会把 texel 随距离混向平均色）
          float tclass = mod(vFlags, 8.0);
          // 亮窗（暖色发光）的窗格：离远了平均成一片纸色，不让三像素一道的木棂在远处闪出摩尔纹
          if (mod(floor(vFlags / 8.0), 2.0) > 0.5 && mod(floor(vFlags / 32.0), 2.0) > 0.5) texel.rgb = mix(texel.rgb, vec3(0.42, 0.35, 0.24), smoothstep(12.0, 36.0, distance(vBWorld, cameraPosition)));
          ${kind === 'cutout' ? 'if (texel.a < 0.4) discard; float tintAmt = 1.0;' : kind === 'solid' ? 'float tintAmt = 1.0 - texel.a;' : 'float tintAmt = 0.0;'}
          ${kind === 'cutout' ? 'if (uBare > 0.01 && tclass > 1.5 && tclass < 2.5 && hash13(floor(vBWorld * 16.0 + 0.01)) < uBare * snowClimate(vBWorld)) discard; // 冬日落叶：阔叶按像素镂空，露出枝干（岭南常绿不落）' : ''}
          if (tclass > 5.5 && tclass < 6.5 && hash12(floor(vBWorld.xz) + 0.37) > uLotus) discard; // 荷：夏满、春秋稀、冬无（按所在那一格取舍——只看 xz：荷叶底面正落在整数高度上，按三维取整会逐像素在上下两格间跳，叶面被裁、底面留下，成了闪烁的黑斑纹）
          vec3 tint = seasonTint(vTint, tclass, vBWorld);
          vec3 col = texel.rgb * mix(vec3(1.0), tint, tintAmt);
          if (tclass > 3.5 && tclass < 4.5) {
            // 花树：花期显花，其余季节换成叶色 / 秋色
            float lum = dot(texel.rgb, vec3(0.3, 0.5, 0.2));
            vec3 leaf = uLeafGreen * uSeasonFoliage * (0.55 + lum * 0.8);
            leaf = mix(leaf, mix(uAutumnA, uAutumnB, hash13(floor(vBWorld))), uAutumn * 0.8);
            col = mix(leaf, texel.rgb, uBlossom);
          }
          col = applySnow(col, vBNormal, vBWorld, uSnowColor, snowClimate(vBWorld));
          col *= mix(1.0, 0.78, uWet * step(0.5, vBNormal.y));
          // 陡壁：每 6 格一层岩带（台面亮、层缝暗）。背光不再整面乘暗，否则正午下朝镜头的主山是一块灰板。
          float tileId = vBlockUv.z;
          if (abs(tileId - 3.0) < 0.5 || abs(tileId - 4.0) < 0.5 || abs(tileId - 52.0) < 0.5) {
            vec3 rn = normalize(vBNormal);
            float sun = dot(rn, normalize(uSunDir));
            float steep = 1.0 - smoothstep(0.2, 0.72, rn.y);
            float course = mod(floor(vBWorld.y + hash12(floor(vBWorld.xz / 16.0)) * 5.0), 6.0);
            float layer = mix(1.0, 1.22, step(4.5, course));
            layer = mix(layer, 0.74, step(course, 0.5));
            layer *= mix(0.94, 1.06, hash12(floor(vBWorld.xz / 14.0)));
            vec3 sunTint = mix(vec3(0.94, 1.02, 1.05), vec3(1.14, 1.08, 0.98), smoothstep(-0.35, 0.55, sun));
            vec3 wall = col * layer * sunTint;
            vec3 crown = col * mix(1.0, 1.1, smoothstep(0.15, 0.75, sun));
            col = mix(crown, wall, steep);
            col *= mix(1.0, 0.8, smoothstep(0.2, 0.75, -rn.y));
            // 岩面不成一整面同色的墙：大块明暗斑驳；铁锈赭黄的染痕与竖向雨痕；低处背阴处的青苔。
            // 细部（染痕、雨痕、苔）随距离淡去——远看只剩大块明暗，不让远山起一层噪点
            float rd = distance(vBWorld, cameraPosition);
            float fineK = 1.0 - smoothstep(120.0, 420.0, rd);
            float big = hash12(floor(vBWorld.xz / 9.0) + floor(vBWorld.y / 7.0) * 17.3);
            col *= 0.86 + 0.26 * big;
            float stain = hash12(floor(vBWorld.xz / 4.0) + floor(vBWorld.y / 3.0) * 7.7);
            col = mix(col, col * vec3(1.22, 1.0, 0.74), smoothstep(0.62, 0.92, stain) * 0.55 * steep * fineK);
            float streak = hash12(floor(vBWorld.xz / 2.0) + 11.3);
            col *= 1.0 - 0.14 * smoothstep(0.7, 1.0, streak) * steep * fineK;
            float lowK = 1.0 - smoothstep(110.0, 150.0, vBWorld.y);
            float mossN = hash12(floor(vBWorld.xz / 2.0) + floor(vBWorld.y / 2.0) * 3.1);
            float moss = smoothstep(0.62, 0.88, mossN) * lowK * (0.45 + 0.55 * (1.0 - steep)) * fineK;
            col = mix(col, col * vec3(0.62, 1.22, 0.55), moss * 0.7);
          }
          // 受光面提气约 9%：草坡、树冠、白墙、屋面、石阶、河岸、塔身。背光面不动。
          float sunLit = smoothstep(0.35, 0.82, dot(normalize(vBNormal), normalize(uSunDir)));
          float tile = vBlockUv.z;
          bool litSurf = abs(tile) < 0.5 || abs(tile - 22.0) < 0.5 || abs(tile - 23.0) < 0.5 || abs(tile - 24.0) < 0.5 || abs(tile - 28.0) < 0.5 || abs(tile - 60.0) < 0.5
            || abs(tile - 33.0) < 0.5 || abs(tile - 34.0) < 0.5
            || (tile > 34.5 && tile < 37.5)
            || abs(tile - 38.0) < 0.5 || abs(tile - 40.0) < 0.5 || abs(tile - 41.0) < 0.5 || abs(tile - 42.0) < 0.5
            || abs(tile - 6.0) < 0.5 || abs(tile - 7.0) < 0.5 || abs(tile - 48.0) < 0.5;
          if (litSurf) col *= mix(1.0, 1.09, sunLit);
          diffuseColor.rgb *= col;
          ${kind === 'translucent' ? 'diffuseColor.a = texel.a;' : ''}
          `,
        )
        .replace('#include <alphatest_fragment>', '')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          if (mod(floor(vFlags / 8.0), 2.0) > 0.5) {
            bool warm = mod(floor(vFlags / 32.0), 2.0) > 0.5;
            // 窗光按整格均匀发光（不随窗棂像素明暗起伏，远看不闪烁），灯笼压一压亮度；
            // 离镜头远到快要换成远景那一圈之前平滑淡出，近远切换时灯不会一下亮一下灭
            float lit = 1.0 - smoothstep(uLitFar * 0.72, uLitFar, distance(vBWorld, cameraPosition));
            // 入夜从点灯中心向外一圈圈柔和亮起：中心在入夜那一刻定下、不随镜头走；半径用固定的 400 格，不随镜头距离变；
            // 亮起的前沿宽 0.25（灯是渐亮，不是一格格蹦出来），没有逐格抖动——否则平移镜头时灯会忽明忽暗
            float due = clamp(distance(vBWorld.xz, uLitCenter.xz) / 400.0, 0.0, 1.0) * 0.75;
            lit *= smoothstep(due, due + 0.25, uLitSeq);
            float cell = hash12(floor(vBWorld.xz / 3.0) + 0.37);
            // 灯笼的火苗轻轻晃（约 1.5–2 Hz、幅度 3%）；窗光不晃——窗格闪烁此前刚修掉（a1e92b8）
            if (!warm) lit *= 1.0 + 0.03 * sin(uTime * (9.0 + 4.0 * cell) + cell * 40.0);
            // 窗：近处看得见糊纸的亮格与木窗棂的暗条（纸亮、棂暗，不再是整块匀亮的「纱窗」），离远了（12→36 格）渐渐平均成一片暖光，
            // 不让三像素一道的窗棂在远处闪出摩尔纹（那一段的贴图本身也在同一距离上混向平均色，见上）
            float paper = smoothstep(0.42, 0.68, winRaw);
            float farK = smoothstep(12.0, 36.0, distance(vBWorld, cameraPosition));
            // 远处的平均亮度取田字窗的面积比（糊纸约四成）：近处的格子与远处的平均值亮度一致，过渡中不掉一档
            float pane = mix(mix(0.10, 1.0, paper), 0.46, farK);
            totalEmissiveRadiance += (warm ? uWindow * pane : col * 1.6) * uNight * lit;
          }`,
        )
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = desaturate(outgoingLight, uSaturation);
          ${DEBUG_VIEW_BLOCK}
          #include <opaque_fragment>`,
        )
        .replace('#include <fog_fragment>', EDGE_FOG_FRAGMENT('vBWorld'))
        // 顶点 AO 与面向明暗只乘间接光。直射日光已由 Lambert 按法线计算，再乘一次会把侧面、檐下和树冠压黑。
        .replace(
          '#include <lights_fragment_end>',
          `#include <lights_fragment_end>
          // 三者相乘最坏约 0.55 × 0.80 × 0.88 ≈ 0.39（院落里的南北墙），背光面只剩四成天光就死黑了；设下限保住可读性
          reflectedLight.indirectDiffuse *= max(bakedSky(vBWorld) * aoCurve(vAo) * faceShade(vBNormal), 0.55);`,
        )
      if (kind === 'cutout') frag = frag.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      shader.fragmentShader = frag
    }
    m.customProgramCacheKey = () => `block-${kind}-${tier}`
    return m
  }

  /** 灯笼光晕：加色混合，只在暮夜明显 */
  private createGlowMaterial(): THREE.ShaderMaterial {
    const fade = { value: 1 }
    const m = new THREE.ShaderMaterial({
      uniforms: { ...this.shared, uFade: fade },
      vertexShader: /* glsl */ `
        attribute vec3 aTint;
        varying vec3 vTint;
        varying vec3 vLocal;
        varying vec3 vGWorld;
        void main() {
          vTint = aTint;
          vLocal = position / 16.0;
          vGWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        uniform float uFade;
        uniform float uLitSeq;
        uniform float uLitFar;
        uniform vec3 uLitCenter;
        varying vec3 vTint;
        varying vec3 vLocal;
        varying vec3 vGWorld;
        void main() {
          // 光晕与灯笼本体同一时刻点亮（同样的点灯次序）
          float due = clamp(distance(vGWorld.xz, uLitCenter.xz) / 400.0, 0.0, 1.0) * 0.75;
          float a = (0.08 + uNight * 0.42 * smoothstep(due, due + 0.25, uLitSeq)) * uFade;
          gl_FragColor = vec4(pow(vTint, vec3(2.2)) * a, 1.0);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    m.userData.fade = fade
    return m
  }

  /** 水面：按深度三段着色（浅石绿 → 石青 → 黛青），像素化水纹、天光反射、日光闪点；瀑布为下落的条纹 */
  private createWaterMaterial(overview: boolean, tier: 'near' | 'far' | 'coarse' = 'near'): THREE.ShaderMaterial {
    const fade = { value: 1 }
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFade: fade }]),
      vertexShader: /* glsl */ `
        attribute vec3 aTint;
        attribute float aFlags;
        varying vec3 vTint;
        varying float vFlags;
        varying vec3 vWorld;
        varying vec3 vWNormal;
        #include <fog_pars_vertex>
        void main() {
          vTint = aTint;
          vFlags = aFlags;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vWNormal = normalize(mat3(modelMatrix) * normal);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_ENV_UNIFORMS}
        ${GLSL_HASH}
        ${GLSL_BAYER}
        ${GLSL_CLIMATE}
        ${GLSL_EDGE_FOG}
        ${GLSL_MIST}
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        // uHorizonColor 随 GLSL_EDGE_FOG 声明，避免重复
        uniform vec3 uWaterShallow;
        uniform vec3 uWaterMid;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterFoam;
        uniform vec3 uSnowColor;
        uniform float uIce;
        uniform vec3 uIceColor;
        uniform float uFade;
        ${overview || tier !== 'near' ? 'uniform sampler2D uChunkMask; uniform vec4 uChunkMaskRect;' : ''}
        varying vec3 vTint;
        varying float vFlags;
        varying vec3 vWorld;
        varying vec3 vWNormal;
        #include <fog_pars_fragment>
        void main() {
          if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;
          ${
            overview
              ? `vec2 mk = (vWorld.xz - uChunkMaskRect.xy) / uChunkMaskRect.zw;
                 if (mk.x > 0.0 && mk.y > 0.0 && mk.x < 1.0 && mk.y < 1.0 && texture2D(uChunkMask, mk).r > 0.02) discard;`
              : tier === 'coarse'
                ? COARSE_MASK.replace('vBWorld', 'vWorld')
                : tier === 'far'
                  ? FAR_MASK.replace('vBWorld', 'vWorld')
                  : ''
          }
          float depth = clamp(vTint.r * 255.0 / 36.0 / 7.0, 0.0, 1.0);
          bool falling = vTint.g > 0.5;
          // 水体本色：按水深浅 → 中 → 深。浅水靠颜色而不是透明度（透明度高了会透出水底，近景水面发白）
          vec3 col = mix(uWaterShallow, uWaterMid, smoothstep(0.0, 0.35, depth));
          col = mix(col, uWaterDeep, smoothstep(0.35, 1.0, depth));
          col *= mix(1.05, 1.0, smoothstep(0.05, 0.45, depth));
          // 两层像素水纹：方向、尺度、速度各异，按 1/8 格取整（远景 2 格），世界坐标取样，相邻区块与远近各级同一相位
          vec2 q = floor(vWorld.xz * ${overview ? '0.5' : '8.0'}) / ${overview ? '0.5' : '8.0'};
          float w = sin(q.x * 1.7 + uTime * 1.3) * sin(q.y * 1.3 - uTime * 1.1) + 0.6 * sin((q.x + q.y) * 0.9 + uTime * 0.7);
          float w2 = sin(dot(q, vec2(0.8, -0.6)) * 2.6 - uTime * 1.7) * sin(dot(q, vec2(0.6, 0.8)) * 1.9 + uTime * 1.2);
          col *= 1.0 + 0.05 * w + 0.03 * w2;
          vec3 n = normalize(vWNormal + vec3(0.06 * w + 0.045 * w2, 0.0, 0.05 * sin(q.y + uTime) - 0.04 * w2));
          vec3 v = normalize(cameraPosition - vWorld);
          float camDist = distance(vWorld, cameraPosition);
          // 雨：水面压暗、褪色（天色由环境管理器罩上雨色，倒影随之变灰）
          col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.35 * uWet) * (1.0 - 0.22 * uWet);
          if (depth < 0.02) col = mix(col, uWaterFoam, 0.18 + 0.1 * w);
          if (falling) {
            float stripe = hash12(vec2(floor(vWorld.x * 4.0 + vWorld.z * 4.0), floor(vWorld.y * 3.0 + uTime * 9.0)));
            col = mix(col, uWaterFoam, 0.35 + 0.35 * stripe);
          }
          float clim = snowClimate(vWorld);
          col = mix(col, uSnowColor * 0.9, uSnow * 0.15 * clim);
          col = mix(col, uIceColor, falling ? 0.0 : uIce * clim);
          // 夜里水体本色压得比岸上更暗，亮处留给倒映的夜空、月光与星点
          col *= mix(1.0, 0.3, uNight);
          // 天光倒影：取反射方向上的天色（与天空球、地形边缘雾同一个 skyBase），晨暮映霞、雨天映灰、夜里映夜空。
          // 俯看时以本色为主（约一成），掠射角时倒影渐强；瀑布不映，冰面少映
          vec3 rd = reflect(-v, n);
          rd.y = abs(rd.y);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float reflK = falling ? 0.0 : clamp(0.1 + 0.6 * fres, 0.0, 0.7) * (1.0 - 0.7 * uIce * clim);
          col = mix(col, skyBase(rd), reflK);
          float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 80.0);
          col += uSunColor * spec * 0.58 * (1.0 - uNight) * (1.0 - 0.85 * uWet);
          // 雨点涟漪：每 2×2 格一个雨点格，各自的节拍与圆心，一圈一像素宽的环向外扩散、渐淡；同样按像素取整。远处淡去，不闪
          if (uWet > 0.01 && !falling) {
            vec2 p = q * 0.5;
            vec2 cell = floor(p);
            float ph = hash12(cell + 0.5);
            float beat = uTime * 0.75 + ph;
            float t = fract(beat);
            vec2 c = cell + 0.3 + 0.4 * vec2(hash12(cell + floor(beat) * 1.3 + 3.1), hash12(cell + floor(beat) * 1.7 + 7.7));
            float ring = 1.0 - smoothstep(0.0, 0.07, abs(length(p - c) - t * 0.42));
            float rip = ring * (1.0 - t) * uWet * (1.0 - smoothstep(60.0, 160.0, camDist)) * (1.0 - uIce * clim);
            col = mix(col, mix(skyBase(vec3(0.0, 1.0, 0.0)), uWaterFoam, 0.55), rip * 0.65);
          }
          if (uNight > 0.05 && !falling) {
            // 月光落在水上：随波碎成一片银鳞；水里倒映几点星
            float moon = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 60.0);
            col += uSunColor * moon * 0.42 * uNight * (1.0 - uWet * 0.8) * (1.0 - uIce * clim);
            vec3 rs = reflect(-v, normalize(vec3(0.0, 1.0, 0.0) + (n - vWNormal) * 2.5));
            if (rs.y > 0.05) {
              vec3 g = floor(rs * 150.0);
              float st = step(0.9965, hash13(g)) * (0.55 + 0.45 * sin(uTime * 2.0 + hash13(g + 7.0) * 40.0));
              col += vec3(0.8, 0.85, 1.0) * st * 0.55 * uNight * (1.0 - uWet) * (1.0 - uIce * clim);
            }
          }
          float alpha = falling ? 0.88 : mix(mix(0.78, 0.92, depth), 0.95, uIce * clim);
          gl_FragColor = vec4(col, ${overview ? '1.0' : 'alpha'});
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          ${EDGE_FOG_FRAGMENT('vWorld')}
        }`,
      transparent: !overview,
      depthWrite: overview,
      fog: true,
    })
    for (const [k, v] of Object.entries(this.shared)) m.uniforms[k] = v
    m.uniforms.uFade = fade
    m.userData.fade = fade
    return m
  }

  /** 全国覆盖图：顶点色体素柱；在已显示近景区块的地方按掩膜让位 */
  private createOverviewMaterial(): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial({ color: WHITE })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.shared)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aColor;\nattribute float aKind;\nvarying vec3 vOColor;\nvarying float vKind;\nvarying vec3 vOWorld;\nvarying vec3 vONormal;')
        .replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvOColor = aColor; vKind = aKind; vOWorld = (modelMatrix * vec4(transformed, 1.0)).xyz; vONormal = normalize(mat3(modelMatrix) * objectNormal);',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uChunkMask;
          uniform vec4 uChunkMaskRect;
          uniform vec3 uSnowColor;
          uniform vec3 uLeafGreen;
          uniform float uDebugView;
          varying vec3 vOColor;
          varying float vKind;
          varying vec3 vOWorld;
          varying vec3 vONormal;
          ${GLSL_ENV_UNIFORMS}
          ${GLSL_HASH}
          ${GLSL_BAYER}
          ${GLSL_SEASON}
          ${GLSL_SNOW}
          ${GLSL_DESATURATE}
          ${GLSL_EDGE_FOG}
          ${GLSL_MIST}
          ${GLSL_FOG_HEAT}
          ${GLSL_FACE_SHADE}`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          vec2 mk = (vOWorld.xz - uChunkMaskRect.xy) / uChunkMaskRect.zw;
          if (mk.x > 0.0 && mk.y > 0.0 && mk.x < 1.0 && mk.y < 1.0 && texture2D(uChunkMask, mk).r > 0.02) discard;`,
        )
        .replace(
          '#include <map_fragment>',
          `vec3 col = seasonTint(vOColor, vKind, vOWorld);
           col = applySnow(col, vONormal, vOWorld * 0.125, uSnowColor, snowClimate(vOWorld));
           // 与远景片（4×4×4 方块）对齐：同一片地表，覆盖图偏暗偏绿。逐通道实测的比值（见 tools/tier-color-match.mjs）
           col *= vec3(1.11, 1.035, 1.06);
           diffuseColor.rgb *= col;`,
        )
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= faceShade(vONormal);')
        .replace(
          '#include <opaque_fragment>',
          `outgoingLight = desaturate(outgoingLight, uSaturation);
          ${DEBUG_VIEW_OVERVIEW}
          #include <opaque_fragment>`,
        )
        .replace('#include <fog_fragment>', EDGE_FOG_FRAGMENT('vOWorld'))
    }
    m.customProgramCacheKey = () => 'overview'
    return m
  }

  dispose(): void {
    this.atlas.dispose()
    for (const m of this.block) m.dispose()
    this.water.dispose()
    this.overview.dispose()
    this.overviewWater.dispose()
    this.waterCoarse.dispose()
    this.waterFar.dispose()
    for (const m of this.blockFar) m.dispose()
    for (const m of this.blockCoarse.slice(0, 3)) m.dispose()
  }
}
