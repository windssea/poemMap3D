import * as THREE from 'three'
import { BlockRenderLayer } from '../../world/block/BlockDefinition'
import { GLSL_AO, GLSL_BAYER, GLSL_DESATURATE, GLSL_ENV_UNIFORMS, GLSL_HASH, GLSL_SEASON, GLSL_SNOW } from './ShaderLibrary'
import type { SharedUniforms } from './SharedUniforms'
import { createBlockTextureArray } from './TextureAtlas'

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

/** 远景片让位：掩膜为 255（近景 / 远景区块已显示）处丢弃 */
const COARSE_MASK = /* glsl */ `
 { vec2 mk = (vBWorld.xz - uChunkMaskRect.xy) / uChunkMaskRect.zw;
   if (mk.x > 0.0 && mk.y > 0.0 && mk.x < 1.0 && mk.y < 1.0 && texture2D(uChunkMask, mk).r > 0.75) discard; }`

const BLOCK_FRAGMENT_DECL = /* glsl */ `
uniform highp sampler2DArray uBlockAtlas;
uniform sampler2D uChunkMask;
uniform vec4 uChunkMaskRect;
uniform float uFade;
uniform vec3 uLeafGreen;
uniform vec3 uSnowColor;
uniform vec3 uWindow;
uniform float uBare;
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
    this.blockCoarse = []
    this.blockCoarse[BlockRenderLayer.Solid] = this.createBlockMaterial('solid', true)
    this.blockCoarse[BlockRenderLayer.Cutout] = this.createBlockMaterial('cutout', true)
    this.blockCoarse[BlockRenderLayer.Translucent] = this.createBlockMaterial('translucent', true)
    this.blockCoarse[BlockRenderLayer.Effect] = this.block[BlockRenderLayer.Effect]
    this.water = this.createWaterMaterial(false)
    this.waterCoarse = this.createWaterMaterial(false, true)
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

  private createBlockMaterial(kind: 'solid' | 'cutout' | 'translucent', coarse = false): THREE.MeshLambertMaterial {
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
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;${coarse ? COARSE_MASK : ''}`)
        .replace(
          '#include <map_fragment>',
          /* glsl */ `
          vec4 texel = texture(uBlockAtlas, vec3(vBlockUv.x, -vBlockUv.y, vBlockUv.z));
          float tclass = mod(vFlags, 8.0);
          ${kind === 'cutout' ? 'if (texel.a < 0.4) discard; float tintAmt = 1.0;' : kind === 'solid' ? 'float tintAmt = 1.0 - texel.a;' : 'float tintAmt = 0.0;'}
          ${kind === 'cutout' ? 'if (uBare > 0.01 && tclass > 1.5 && tclass < 2.5 && hash13(floor(vBWorld * 16.0 + 0.01)) < uBare) discard; // 冬日落叶：阔叶按像素镂空，露出枝干' : ''}
          vec3 tint = seasonTint(vTint, tclass, vBWorld);
          vec3 col = texel.rgb * mix(vec3(1.0), tint, tintAmt);
          if (tclass > 3.5 && tclass < 4.5) {
            // 花树：花期显花，其余季节换成叶色 / 秋色
            float lum = dot(texel.rgb, vec3(0.3, 0.5, 0.2));
            vec3 leaf = uLeafGreen * uSeasonFoliage * (0.55 + lum * 0.8);
            leaf = mix(leaf, mix(uAutumnA, uAutumnB, hash13(floor(vBWorld))), uAutumn * 0.8);
            col = mix(leaf, texel.rgb, uBlossom);
          }
          col *= aoCurve(vAo);
          col = applySnow(col, vBNormal, vBWorld, uSnowColor);
          col *= mix(1.0, 0.78, uWet * step(0.5, vBNormal.y));
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
            totalEmissiveRadiance += (warm ? uWindow * (0.35 + dot(texel.rgb, vec3(0.6))) : col * 2.4) * uNight;
          }`,
        )
        .replace('#include <opaque_fragment>', `outgoingLight = desaturate(outgoingLight, uSaturation);\n#include <opaque_fragment>`)
      if (kind === 'cutout') frag = frag.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;')
      shader.fragmentShader = frag
    }
    m.customProgramCacheKey = () => `block-${kind}${coarse ? '-coarse' : ''}`
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
        void main() {
          vTint = aTint;
          vLocal = position / 16.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uNight;
        uniform float uFade;
        varying vec3 vTint;
        varying vec3 vLocal;
        void main() {
          float a = (0.08 + uNight * 0.42) * uFade;
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
  private createWaterMaterial(overview: boolean, coarse = false): THREE.ShaderMaterial {
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
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uSkyColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uWaterShallow;
        uniform vec3 uWaterMid;
        uniform vec3 uWaterDeep;
        uniform vec3 uWaterFoam;
        uniform vec3 uSnowColor;
        uniform float uIce;
        uniform vec3 uIceColor;
        uniform float uFade;
        ${overview || coarse ? 'uniform sampler2D uChunkMask; uniform vec4 uChunkMaskRect;' : ''}
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
              : coarse
                ? COARSE_MASK.replace('vBWorld', 'vWorld')
                : ''
          }
          float depth = clamp(vTint.r * 255.0 / 36.0 / 7.0, 0.0, 1.0);
          bool falling = vTint.g > 0.5;
          vec3 col = mix(uWaterShallow, uWaterMid, smoothstep(0.0, 0.35, depth));
          col = mix(col, uWaterDeep, smoothstep(0.35, 1.0, depth));
          vec2 q = floor(vWorld.xz * ${overview ? '0.5' : '8.0'}) / ${overview ? '0.5' : '8.0'};
          float w = sin(q.x * 1.7 + uTime * 1.3) * sin(q.y * 1.3 - uTime * 1.1) + 0.6 * sin((q.x + q.y) * 0.9 + uTime * 0.7);
          col *= 1.0 + 0.06 * w;
          vec3 n = normalize(vWNormal + vec3(0.06 * w, 0.0, 0.05 * sin(q.y + uTime)));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 sky = mix(uHorizonColor, uSkyColor, 0.4);
          col = mix(col, sky, fres * 0.55);
          float spec = pow(max(dot(reflect(-uSunDir, n), v), 0.0), 80.0);
          col += uSunColor * spec * 0.6 * (1.0 - uNight);
          if (depth < 0.02) col = mix(col, uWaterFoam, 0.18 + 0.1 * w);
          if (falling) {
            float stripe = hash12(vec2(floor(vWorld.x * 4.0 + vWorld.z * 4.0), floor(vWorld.y * 3.0 + uTime * 9.0)));
            col = mix(col, uWaterFoam, 0.35 + 0.35 * stripe);
          }
          col = mix(col, uSnowColor * 0.9, uSnow * 0.15);
          col = mix(col, uIceColor, falling ? 0.0 : uIce);
          col *= mix(1.0, 0.45, uNight);
          float alpha = falling ? 0.88 : mix(mix(0.64, 0.9, depth), 0.95, uIce);
          gl_FragColor = vec4(col, ${overview ? '1.0' : 'alpha'});
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
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
          varying vec3 vOColor;
          varying float vKind;
          varying vec3 vOWorld;
          varying vec3 vONormal;
          ${GLSL_ENV_UNIFORMS}
          ${GLSL_HASH}
          ${GLSL_BAYER}
          ${GLSL_SEASON}
          ${GLSL_SNOW}
          ${GLSL_DESATURATE}`,
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
           col = applySnow(col, vONormal, vOWorld * 0.125, uSnowColor);
           diffuseColor.rgb *= col;`,
        )
        .replace('#include <opaque_fragment>', `outgoingLight = desaturate(outgoingLight, uSaturation);\n#include <opaque_fragment>`)
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
    for (const m of this.blockCoarse.slice(0, 3)) m.dispose()
  }
}
