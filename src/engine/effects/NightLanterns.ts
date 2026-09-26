import * as THREE from 'three'
import { NightTokens } from '../../config/palette'
import { Random } from '../../utils/math'
import { VoxelModelBuilder } from './LifeModels'

const SKY_N = 10
const RIVER_N = 20
/** 只在近景出现：镜头拉到这么远开始淡出、再远就全收起（远景留给星月） */
const NEAR_FULL = 170
const NEAR_OFF = 280
/** 孔明灯升到这么高就渐渐隐去（不飘成满天的远灯） */
const RISE = 70
/** 离焦点多远的灯就回收，挪到焦点附近重新放（逐盏回收，不整批重撒——整批重撒在镜头移动时会一闪一闪） */
const SKY_RANGE = 75
const RIVER_RANGE = 110

interface SkyLantern {
  x: number
  z: number
  y0: number
  t: number
  speed: number
  sway: number
  /** 淡入（刚放出时由小变大） */
  born: number
}

interface RiverLantern {
  x: number
  z: number
  y: number
  vx: number
  vz: number
  phase: number
  born: number
}

/** 孔明灯：竹篾骨架（上下两圈、四根竖篾）、纸罩（下口敞开）、罩里一点火苗 */
function skyLanternGeometry(): { paper: THREE.BufferGeometry; frame: THREE.BufferGeometry } {
  const paper = new VoxelModelBuilder()
  paper.box(-0.55, 0.15, -0.55, 0.55, 1.75, 0.55, NightTokens.skyLantern)
  paper.box(-0.45, 1.75, -0.45, 0.45, 1.95, 0.45, NightTokens.skyLantern, 1.05)
  paper.box(-0.14, 0.2, -0.14, 0.14, 0.5, 0.14, NightTokens.riverCandle, 1.2)
  const frame = new VoxelModelBuilder()
  const bam = '#5a3e24'
  for (const y of [0.1, 1.72])
    for (const [x0, z0, x1, z1] of [
      [-0.6, -0.6, 0.6, -0.52],
      [-0.6, 0.52, 0.6, 0.6],
      [-0.6, -0.6, -0.52, 0.6],
      [0.52, -0.6, 0.6, 0.6],
    ])
      frame.box(x0, y, z0, x1, y + 0.08, z1, bam)
  for (const [x, z] of [
    [-0.6, -0.6],
    [0.52, -0.6],
    [-0.6, 0.52],
    [0.52, 0.52],
  ])
    frame.box(x, 0.1, z, x + 0.08, 1.8, z + 0.08, bam)
  return { paper: paper.build(), frame: frame.build() }
}

/** 莲花河灯：一圈粉瓣（外低内高两层）、绿托、中间一支小蜡烛 */
function lotusGeometry(): THREE.BufferGeometry {
  const b = new VoxelModelBuilder()
  b.box(-0.55, 0, -0.55, 0.55, 0.12, 0.55, '#4f8062')
  const petal = NightTokens.riverLantern
  for (const [x, z] of [
    [-0.5, 0],
    [0.5, 0],
    [0, -0.5],
    [0, 0.5],
  ])
    b.box(x - 0.18, 0.1, z - 0.18, x + 0.18, 0.42, z + 0.18, petal)
  for (const [x, z] of [
    [-0.28, -0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
  ])
    b.box(x - 0.14, 0.12, z - 0.14, x + 0.14, 0.55, z + 0.14, petal, 1.08)
  b.box(-0.07, 0.12, -0.07, 0.07, 0.62, 0.07, '#f4ead8')
  b.box(-0.05, 0.62, -0.05, 0.05, 0.76, 0.05, NightTokens.riverCandle, 1.3)
  return b.build()
}

/**
 * 夜色近景：孔明灯从地面缓缓升空，河湖上漂着莲花河灯。
 * 只在夜里、镜头推近时出现（拉远渐渐淡去，远景只见星月）；数目不多，围着镜头焦点——走远了的逐盏收回、在焦点附近重新放出（由小渐大），不会整批闪。
 */
export class NightLanterns {
  readonly group = new THREE.Group()
  private readonly sky: THREE.InstancedMesh
  private readonly skyFrame: THREE.InstancedMesh
  private readonly river: THREE.InstancedMesh
  private readonly glow: THREE.InstancedMesh
  private skyL: SkyLantern[] = []
  private riverL: RiverLantern[] = []
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly rnd = new Random(7)

  constructor(
    private readonly ground: (x: number, z: number) => number,
    private readonly water: (x: number, z: number) => number,
  ) {
    const g = skyLanternGeometry()
    // 纸罩与河灯自发光（不受夜色压暗），骨架为暗色竹篾
    this.sky = new THREE.InstancedMesh(g.paper, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }), SKY_N)
    this.skyFrame = new THREE.InstancedMesh(g.frame, new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }), SKY_N)
    this.river = new THREE.InstancedMesh(lotusGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false }), RIVER_N)
    const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.lanternGlow), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    this.glow = new THREE.InstancedMesh(new THREE.SphereGeometry(1.25, 10, 8), halo, SKY_N + RIVER_N)
    for (const m of [this.sky, this.skyFrame, this.river, this.glow]) {
      m.frustumCulled = false
      m.count = 0
      this.group.add(m)
    }
  }

  private spawnSky(c: THREE.Vector3, L?: SkyLantern): SkyLantern {
    const x = c.x + this.rnd.range(-SKY_RANGE * 0.8, SKY_RANGE * 0.8)
    const z = c.z + this.rnd.range(-SKY_RANGE * 0.8, SKY_RANGE * 0.8)
    const o = L ?? ({} as SkyLantern)
    Object.assign(o, { x, z, y0: this.ground(x, z) + 2, t: 0, speed: this.rnd.range(1.4, 2.6), sway: this.rnd.range(0, 6.28), born: 0 })
    return o
  }

  private spawnRiver(c: THREE.Vector3, L?: RiverLantern): RiverLantern | null {
    for (let tries = 0; tries < 40; tries++) {
      const x = c.x + this.rnd.range(-RIVER_RANGE * 0.8, RIVER_RANGE * 0.8)
      const z = c.z + this.rnd.range(-RIVER_RANGE * 0.8, RIVER_RANGE * 0.8)
      const w = this.water(x, z)
      if (w < 0) continue
      const a = this.rnd.range(0, Math.PI * 2)
      const o = L ?? ({} as RiverLantern)
      Object.assign(o, { x, z, y: w + 0.9, vx: Math.cos(a) * 0.3, vz: Math.sin(a) * 0.3, phase: this.rnd.range(0, 6.28), born: 0 })
      return o
    }
    return null
  }

  update(dt: number, time: number, focus: THREE.Vector3, distance: number, night: number): void {
    const on = night > 0.5 && distance < NEAR_OFF
    const near = 1 - Math.min(1, Math.max(0, (distance - NEAR_FULL) / (NEAR_OFF - NEAR_FULL)))
    this.group.visible = on
    if (!on) return
    /* 补足、逐盏回收 */
    while (this.skyL.length < SKY_N) {
      const L = this.spawnSky(focus)
      L.t = this.rnd.range(0, 25)
      L.born = 1
      this.skyL.push(L)
    }
    if (this.riverL.length < RIVER_N) {
      const L = this.spawnRiver(focus)
      if (L) this.riverL.push(L)
    }
    let g = 0
    let n = 0
    for (const L of this.skyL) {
      L.t += dt
      L.born = Math.min(1, L.born + dt / 1.5)
      const h = L.t * L.speed
      if (h > RISE || Math.hypot(L.x - focus.x, L.z - focus.z) > SKY_RANGE) {
        this.spawnSky(focus, L)
        continue
      }
      const x = L.x + Math.sin(time * 0.4 + L.sway) * 1.5
      const z = L.z + Math.cos(time * 0.3 + L.sway) * 1.5
      const y = L.y0 + h
      // 缓缓自转、微微摇晃；刚升起由小渐大，升高后渐渐缩小隐去
      const sc = Math.min(1, L.t / 2) * (1 - Math.max(0, (h - RISE + 20) / 20)) * L.born * near
      this.q.setFromAxisAngle(this.s.set(Math.sin(time + L.sway) * 0.08, 1, Math.cos(time * 0.8 + L.sway) * 0.08).normalize(), time * 0.15 + L.sway)
      this.m.compose(this.p.set(x, y, z), this.q, this.s.setScalar(Math.max(0.01, sc)))
      this.sky.setMatrixAt(n, this.m)
      this.skyFrame.setMatrixAt(n++, this.m)
      this.m.compose(this.p.set(x, y + 0.9 * sc, z), this.q, this.s.setScalar(Math.max(0.01, sc)))
      this.glow.setMatrixAt(g++, this.m)
    }
    this.sky.count = n
    this.skyFrame.count = n
    let r = 0
    for (const L of this.riverL) {
      L.x += L.vx * dt
      L.z += L.vz * dt
      L.born = Math.min(1, L.born + dt / 1.5)
      if (Math.hypot(L.x - focus.x, L.z - focus.z) > RIVER_RANGE || this.water(L.x, L.z) < 0) {
        if (!this.spawnRiver(focus, L)) L.born = 0
        continue
      }
      const y = L.y + Math.sin(time * 1.3 + L.phase) * 0.08
      this.q.setFromAxisAngle(this.s.set(0, 1, 0), L.phase + time * 0.1)
      this.m.compose(this.p.set(L.x, y, L.z), this.q, this.s.setScalar(Math.max(0.01, L.born * near)))
      this.river.setMatrixAt(r++, this.m)
      this.m.compose(this.p.set(L.x, y + 0.7, L.z), this.q, this.s.setScalar(0.45 * L.born * near))
      this.glow.setMatrixAt(g++, this.m)
    }
    this.river.count = r
    this.glow.count = g
    for (const m of [this.sky, this.skyFrame, this.river, this.glow]) m.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    for (const m of [this.sky, this.skyFrame, this.river, this.glow]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }
}
