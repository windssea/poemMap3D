import * as THREE from 'three'
import { Random, smoothstep } from '../../utils/math'
import type { SharedUniforms } from '../rendering/SharedUniforms'

/** 云团数（画质「高」；轻、衡按粒子倍数减少） */
const MAX_CLUSTERS = 40
/** 体素云块边长（方块）：按放出时的镜头距离定（近景 3、区域视图至多 14），已放出的云不变，推拉时随回收逐团换大小 */
const voxFor = (distance: number): number => Math.min(14, Math.max(3, distance * 0.012))
/** 云层高度带（世界 Y，方块）；遇到高山再抬到山顶以上 */
const DECK_LO = 150
const DECK_HI = 225
const ABOVE_GROUND = 35
/** 风：自西向东，方块 / 秒 */
const WIND = new THREE.Vector2(3.2, 0.6)
/** 新放的云由小长大的时长（秒） */
const GROW = 3

/**
 * 体素云：一组由 4 方块立方体拼成的扁平云团，漂在注视点周围的一圈里（千里江山图里围着山水的留白）。
 *
 *  - 一次绘制：所有云块是一个实例化网格；每块属于某个云团，云团中心放在一小组 uniform 里，
 *    漂移、回收只改这组 uniform，不重传网格数据；
 *  - 注视处留空：云团离注视点太近就化去，飘过画面中心的云不会挡住地标；
 *  - 镜头边上缩小：离镜头近的云块缩到没有，飞进云里不会满屏大方块；
 *  - 只在区域 / 近景出现，全国视图渐隐，不遮地图；
 *  - 光照：云色取时段的 cloud（屏幕色反解），顶亮、侧次之、底最暗，朝日一侧微暖，下缘带一点地平线色；雨雪天偏灰，夜里是月光下的灰蓝；
 *  - 不投影、不接收阴影，不参与拾取（拾取按体素数据）。
 */
export class CloudSystem {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  /** 每团：x, y, z, 放出的时刻 */
  private readonly centers: THREE.Vector4[] = []
  /** 每团的体素边长 */
  private readonly vox: number[] = []
  /** 每团的水平半径（方块），回收与避让用 */
  private readonly radius: number[] = []
  private readonly rnd = new Random(20260930)
  private active = MAX_CLUSTERS
  private initialized = false
  private readonly tmpCol = new THREE.Color()
  /** 地面高度（含水面）；Engine 接好后才有，之前按云层高度带放 */
  groundAt: ((x: number, z: number) => number) | null = null

  constructor(shared: SharedUniforms) {
    const offsets: number[] = []
    const cluster: number[] = []
    const shade: number[] = []
    for (let c = 0; c < MAX_CLUSTERS; c++) {
      const cubes = this.shape()
      let rmax = 0
      for (const [x, y, z, s] of cubes) {
        offsets.push(x, y, z)
        cluster.push(c)
        shade.push(s)
        rmax = Math.max(rmax, Math.hypot(x, z))
      }
      this.radius.push(rmax)
      this.vox.push(4)
      this.centers.push(new THREE.Vector4(0, -1e5, 0, -1e9))
    }
    const n = cluster.length
    const geo = new THREE.InstancedBufferGeometry()
    const box = new THREE.BoxGeometry(1, 1, 1)
    geo.index = box.index
    geo.setAttribute('position', box.getAttribute('position'))
    geo.setAttribute('normal', box.getAttribute('normal'))
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3))
    geo.setAttribute('aCluster', new THREE.InstancedBufferAttribute(new Float32Array(cluster), 1))
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(new Float32Array(shade), 1))
    geo.instanceCount = n

    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uCenters: { value: this.centers },
          uVox: { value: new Array(MAX_CLUSTERS).fill(4) },
          uFocus: { value: new THREE.Vector3() },
          uCamDist: { value: 300 },
          uVis: { value: 1 },
          uAvoid: { value: 100 },
          uNow: { value: 0 },
          uActive: { value: MAX_CLUSTERS },
          uCloudCol: { value: new THREE.Color(1, 1, 1) },
        },
      ]),
      vertexShader: /* glsl */ `
        uniform vec4 uCenters[${MAX_CLUSTERS}];
        uniform float uVox[${MAX_CLUSTERS}];
        uniform vec3 uFocus;
        uniform float uCamDist;
        uniform float uVis;
        uniform float uAvoid;
        uniform float uNow;
        uniform float uActive;
        attribute vec3 aOffset;
        attribute float aCluster;
        attribute float aShade;
        varying vec3 vN;
        varying float vShade;
        #include <fog_pars_vertex>
        void main() {
          int ci = int(aCluster + 0.5);
          vec4 c = uCenters[ci];
          float vox = uVox[ci];
          vec3 cw = c.xyz + aOffset * vox;
          float s = uVis * step(aCluster + 0.5, uActive);
          s *= smoothstep(c.w, c.w + ${GROW.toFixed(1)}, uNow);                                   // 新放的云由小长大
          s *= smoothstep(uAvoid * 0.5, uAvoid, distance(c.xz, uFocus.xz));                       // 注视处留空
          s *= smoothstep(20.0 + uCamDist * 0.08, 60.0 + uCamDist * 0.3, distance(cw, cameraPosition)); // 镜头边上缩小
          vec3 wp = cw + position * vox * s;
          vN = normal;
          vShade = aShade;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uCloudCol;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uHorizonColor;
        uniform float uNight;
        varying vec3 vN;
        varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          vec3 n = normalize(vN);
          float face = n.y > 0.5 ? 1.0 : (n.y < -0.5 ? 0.74 : 0.87);
          float sunF = max(dot(n, normalize(uSunDir)), 0.0);
          vec3 col = uCloudCol * face * vShade * (0.84 + 0.22 * sunF);
          col += uSunColor * sunF * 0.06 * (1.0 - uNight);               // 朝日一侧微暖
          col = mix(col, uHorizonColor, (1.0 - face) * 0.35);             // 底与侧带一点地平线色
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
    })
    for (const k of ['uSunDir', 'uSunColor', 'uHorizonColor', 'uNight'] as const) this.mat.uniforms[k] = shared[k]
    // UniformsUtils.merge 会克隆取值：云团中心要指回这份数组，漂移、回收才传得到着色器
    this.mat.uniforms.uCenters.value = this.centers
    this.mat.uniforms.uVox.value = this.vox
    this.mesh = new THREE.Mesh(geo, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    box.dispose()
  }

  /** 一团云的体素：3–6 个扁椭球叠成，底平；只留外露的块。返回 [x, y, z, 明暗] 列表（体素单位） */
  private shape(): [number, number, number, number][] {
    const r = this.rnd
    const cells = new Map<string, number>()
    const nb = 3 + Math.floor(r.next() * 4)
    const spanX = 8 + r.next() * 10
    for (let b = 0; b < nb; b++) {
      const bx = (r.next() - 0.5) * spanX
      const bz = (r.next() - 0.5) * 4
      const rx = 3 + r.next() * 5
      const rz = 2 + r.next() * 2.5
      const ry = 1.2 + r.next() * 1.3
      for (let iz = -Math.ceil(rz); iz <= Math.ceil(rz); iz++)
        for (let iy = 0; iy <= Math.ceil(ry) + 1; iy++)
          for (let ix = -Math.ceil(rx); ix <= Math.ceil(rx); ix++) {
            const dx = ix / rx
            const dz = iz / rz
            const dy = (iy - 0.3 * ry) / ry
            if (dx * dx + dz * dz + dy * dy > 1) continue
            cells.set(`${Math.round(bx + ix)},${iy},${Math.round(bz + iz)}`, iy)
          }
    }
    const out: [number, number, number, number][] = []
    const top = Math.max(...cells.values())
    for (const [k, iy] of cells) {
      const [x, y, z] = k.split(',').map(Number)
      const hidden = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ].every(([a, b, c]) => cells.has(`${x + a},${y + b},${z + c}`))
      if (hidden) continue
      // 越往上越亮（云顶受光），逐块略有明暗
      out.push([x, y, z, (0.9 + 0.1 * (iy / Math.max(1, top))) * (0.97 + 0.06 * r.next())])
    }
    return out
  }

  /** 画质：云团数随粒子倍数（轻 0.35 → 约 18 团） */
  setQuality(particles: number): void {
    this.active = Math.max(8, Math.round(MAX_CLUSTERS * Math.min(1, 0.4 + particles * 0.6)))
    this.mat.uniforms.uActive.value = this.active
  }

  /**
   * @param cloud 时段云色（场景色）
   * @param rain / snow 雨雪量 0–1，云偏灰
   */
  update(dt: number, elapsed: number, focus: THREE.Vector3, distance: number, viewDir: THREE.Vector3, cloud: THREE.Color, grey: THREE.Color, wet: number): void {
    const u = this.mat.uniforms
    const rMin = 80 + distance * 0.5
    const rMax = 500 + distance * 1.6
    const heading = Math.atan2(viewDir.z, viewDir.x)
    u.uFocus.value.copy(focus)
    u.uCamDist.value = distance
    u.uAvoid.value = rMin
    u.uNow.value = elapsed
    u.uVis.value = 1 - smoothstep(1200, 1900, distance)
    u.uCloudCol.value.copy(this.tmpCol.copy(cloud).lerp(grey, wet * 0.55))
    if (u.uVis.value <= 0) return

    /* 漂移；飘出这一圈的云回收，放到圈里别处（每帧至多两团，逐团回收，不整批重撒） */
    let respawned = 0
    for (let i = 0; i < this.active; i++) {
      const c = this.centers[i]
      c.x += WIND.x * dt
      c.z += WIND.y * dt
      const d = Math.hypot(c.x - focus.x, c.z - focus.z)
      // 镜头转开后落到身后（偏离视向 110° 以上）的云也回收到前方：在身后挪走看不见，前方由小长大
      const off = Math.abs(Math.atan2(Math.sin(Math.atan2(c.z - focus.z, c.x - focus.x) - heading), Math.cos(Math.atan2(c.z - focus.z, c.x - focus.x) - heading)))
      const behind = d > rMin && off > 1.9
      if ((!this.initialized || d > rMax * 1.25 || behind || c.y < -1e4) && (respawned < 2 || !this.initialized)) {
        this.vox[i] = voxFor(distance)
        this.place(c, focus, rMin, rMax, heading, this.initialized ? elapsed : -1e9, this.radius[i] * this.vox[i])
        respawned++
      }
    }
    this.initialized = true
  }

  /** 放在镜头朝向前方 ±80° 的扇面里（身后的云看不见，白放） */
  private place(c: THREE.Vector4, focus: THREE.Vector3, rMin: number, rMax: number, heading: number, born: number, rad: number): void {
    const a = heading + (this.rnd.next() - 0.5) * 2 * 1.4
    const d = Math.sqrt(rMin * rMin + this.rnd.next() * (rMax * rMax - rMin * rMin))
    const x = focus.x + Math.cos(a) * d
    const z = focus.z + Math.sin(a) * d
    let y = DECK_LO + this.rnd.next() * (DECK_HI - DECK_LO)
    const g = this.groundAt
    if (g) y = Math.max(y, g(x, z) + ABOVE_GROUND, g(x + rad, z) + ABOVE_GROUND, g(x - rad, z) + ABOVE_GROUND)
    c.set(x, y, z, born)
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mat.dispose()
  }
}
