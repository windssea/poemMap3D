import * as THREE from 'three'
import { NightTokens } from '../../config/palette'
import { Random } from '../../utils/math'

const SKY_N = 12
const RIVER_N = 20

interface SkyLantern {
  x: number
  z: number
  y0: number
  t: number
  speed: number
  sway: number
}

interface RiverLantern {
  x: number
  z: number
  y: number
  vx: number
  vz: number
  phase: number
}

/**
 * 夜色近景：孔明灯从地面缓缓升空，河湖上漂着莲花河灯。
 * 只在夜里、镜头推近时出现；位置围绕镜头焦点随机撒点，河灯只落在水面上。
 */
export class NightLanterns {
  readonly group = new THREE.Group()
  private readonly sky: THREE.InstancedMesh
  private readonly river: THREE.InstancedMesh
  private readonly glow: THREE.InstancedMesh
  private skyL: SkyLantern[] = []
  private riverL: RiverLantern[] = []
  private center: THREE.Vector3 | null = null
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private rnd = new Random(7)

  constructor(
    private readonly ground: (x: number, z: number) => number,
    private readonly water: (x: number, z: number) => number,
  ) {
    const lantern = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.skyLantern), fog: false, toneMapped: false })
    this.sky = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.8, 1.4), lantern, SKY_N)
    const lotus = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.riverLantern), fog: false, toneMapped: false })
    const rg = new THREE.BoxGeometry(1.2, 0.35, 1.2)
    this.river = new THREE.InstancedMesh(rg, lotus, RIVER_N)
    const halo = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.lanternGlow), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
    this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 2.3, 2.3), halo, SKY_N + RIVER_N)
    for (const m of [this.sky, this.river, this.glow]) {
      m.frustumCulled = false
      m.count = 0
      this.group.add(m)
    }
  }

  private seed(c: THREE.Vector3): void {
    this.center = c.clone()
    this.rnd = new Random(Math.round(c.x * 13 + c.z * 7))
    this.skyL = []
    for (let i = 0; i < SKY_N; i++) {
      const x = c.x + this.rnd.range(-110, 110)
      const z = c.z + this.rnd.range(-110, 110)
      this.skyL.push({ x, z, y0: this.ground(x, z) + 2, t: this.rnd.range(0, 60), speed: this.rnd.range(1.6, 3.2), sway: this.rnd.range(0, 6.28) })
    }
    this.riverL = []
    for (let tries = 0; tries < 600 && this.riverL.length < RIVER_N; tries++) {
      const x = c.x + this.rnd.range(-140, 140)
      const z = c.z + this.rnd.range(-140, 140)
      const w = this.water(x, z)
      if (w < 0) continue
      const a = this.rnd.range(0, Math.PI * 2)
      this.riverL.push({ x, z, y: w + 0.9, vx: Math.cos(a) * 0.35, vz: Math.sin(a) * 0.35, phase: this.rnd.range(0, 6.28) })
    }
  }

  update(dt: number, time: number, focus: THREE.Vector3, distance: number, night: number): void {
    const on = night > 0.5 && distance < 520
    this.group.visible = on
    if (!on) return
    if (!this.center || this.center.distanceTo(focus) > 70) this.seed(focus)
    let g = 0
    let n = 0
    for (const L of this.skyL) {
      L.t += dt
      const h = L.t * L.speed
      if (h > 120) {
        L.t = 0
        continue
      }
      const x = L.x + Math.sin(time * 0.4 + L.sway) * 1.5
      const z = L.z + Math.cos(time * 0.3 + L.sway) * 1.5
      const y = L.y0 + h
      const sc = Math.min(1, L.t / 2) * (1 - Math.max(0, (h - 100) / 20))
      this.m.compose(this.p.set(x, y, z), this.q.identity(), this.s.setScalar(Math.max(0.01, sc)))
      this.sky.setMatrixAt(n++, this.m)
      this.glow.setMatrixAt(g++, this.m)
    }
    this.sky.count = n
    let r = 0
    for (const L of this.riverL) {
      L.x += L.vx * dt
      L.z += L.vz * dt
      const y = L.y + Math.sin(time * 1.3 + L.phase) * 0.08
      this.q.setFromAxisAngle(this.s.set(0, 1, 0), L.phase + time * 0.1)
      this.m.compose(this.p.set(L.x, y, L.z), this.q, this.s.setScalar(1))
      this.river.setMatrixAt(r++, this.m)
      this.m.compose(this.p.set(L.x, y + 0.6, L.z), this.q, this.s.setScalar(0.7))
      this.glow.setMatrixAt(g++, this.m)
    }
    this.river.count = r
    this.glow.count = g
    for (const m of [this.sky, this.river, this.glow]) m.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    for (const m of [this.sky, this.river, this.glow]) {
      m.geometry.dispose()
      ;(m.material as THREE.Material).dispose()
    }
  }
}
