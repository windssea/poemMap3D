import * as THREE from 'three'
import { LifeTokens as T } from '../../config/palette'
import { SEA_LEVEL } from '../../world/coordinate/constants'
import { getProjection } from '../../world/coordinate/GeoProjection'
import type { WorldContext } from '../../world/generation/WorldContext'
import type { ResolvedLandmark } from '../../world/landmark/LandmarkRegistry'
import { Occupancy } from '../../world/structure/OccupancyMap'
import { WaterKind } from '../../world/terrain/TerrainSample'
import { Random } from '../../utils/math'
import {
  birdBodyGeometry,
  birdWingGeometry,
  cargoBoatGeometry,
  fishingBoatGeometry,
  seaFisherGeometry,
  FIGURE_KINDS,
  figureBody,
  figureHead,
  legGeometry,
  mingShipGeometry,
  passengerBoatGeometry,
  smokeGeometry,
} from './LifeModels'

const MAX_PEOPLE = 90
const MAX_SMOKE = 160
const MAX_BIRDS = 24
const MAX_RIVER_BOATS = 16
const MAX_LAKE_BOATS = 14
const MAX_SHIPS = 4
/** 镜头比这更远就不画市井（看不清，也省） */
const LIFE_DISTANCE = 420
const WATER_DISTANCE = 900

interface Walker {
  x: number
  z: number
  y: number
  /** 当前朝向（弧度，绕 y；0 = +x） */
  a: number
  tx: number
  tz: number
  dir: number
  speed: number
  phase: number
  robe: THREE.Color
  hat: number
  /** 站着不动的（摊贩、看货的） */
  still: boolean
}

interface Smoke {
  x: number
  y: number
  z: number
  rate: number
  acc: number
}
interface Puff {
  x: number
  y: number
  z: number
  age: number
  life: number
  drift: number
}

interface Boat {
  kind: 'fishing' | 'passenger' | 'cargo' | 'ship' | 'seaFisher'
  /** 江河：沿中心线走（river、s、方向、横向偏移）；湖海：直线漫游 */
  river: number
  s: number
  dir: number
  lane: number
  x: number
  z: number
  y: number
  a: number
  speed: number
  phase: number
  mesh: THREE.Mesh
  /** 城中河渠：沿折线（世界坐标）来回，s 为沿线距离 */
  path?: [number, number][]
}

interface Bird {
  cx: number
  cz: number
  y: number
  r: number
  w: number
  t: number
  phase: number
}

/**
 * 市井生机：只在镜头推近一处地方时出现，围着那一处布置——
 *  - 行人沿街巷（铺地、空地）来回走，摊位后站着摊贩、摊前有人看货；
 *  - 屋顶升起炊烟（早晚浓、白天淡、夜里歇）；
 *  - 城上盘旋几只飞鸟；
 *  - 附近江河湖上有渔舟、客船沿河上下；沿海有明代福船式的大海船缓缓驶过。
 * 全部是方块拼成的小模型，与体素世界同一种语言；数目有上限，远了就收起。
 */
export class LifeSystem {
  readonly group = new THREE.Group()
  private readonly mat: THREE.MeshLambertMaterial
  /** 三类人物（士人、劳作者、女子）的身子（按实例着色）与头饰 */
  private readonly bodies: THREE.InstancedMesh[]
  private readonly heads: THREE.InstancedMesh[]
  private readonly legs: THREE.InstancedMesh
  private readonly smoke: THREE.InstancedMesh
  private readonly smokeMat: THREE.MeshLambertMaterial
  private readonly birdBody: THREE.InstancedMesh
  private readonly birdWing: THREE.InstancedMesh
  private readonly boatGeo: Record<Boat['kind'], THREE.BufferGeometry>
  private walkers: Walker[] = []
  private smokes: Smoke[] = []
  private puffs: Puff[] = []
  private birds: Bird[] = []
  private boats: Boat[] = []
  private place: ResolvedLandmark | null = null
  /** 可走的格（x * 65536 + z） */
  private walkable = new Set<number>()
  private pinned: string | null = null
  private waterCenter: THREE.Vector3 | null = null
  private checkT = 0
  private rnd = new Random(11)
  private readonly P = getProjection()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(private readonly ctx: WorldContext) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    this.bodies = FIGURE_KINDS.map((k) => new THREE.InstancedMesh(figureBody(k), this.mat, MAX_PEOPLE))
    this.heads = FIGURE_KINDS.map((k) => new THREE.InstancedMesh(figureHead(k), this.mat, MAX_PEOPLE))
    this.legs = new THREE.InstancedMesh(legGeometry(), this.mat, MAX_PEOPLE * 2)
    this.smokeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(T.smoke), transparent: true, opacity: 0.55, depthWrite: false })
    this.smoke = new THREE.InstancedMesh(smokeGeometry(), this.smokeMat, MAX_SMOKE)
    this.birdBody = new THREE.InstancedMesh(birdBodyGeometry(), this.mat, MAX_BIRDS)
    this.birdWing = new THREE.InstancedMesh(birdWingGeometry(), this.mat, MAX_BIRDS * 2)
    this.boatGeo = { fishing: fishingBoatGeometry(), passenger: passengerBoatGeometry(), cargo: cargoBoatGeometry(), ship: mingShipGeometry(), seaFisher: seaFisherGeometry() }
    for (const im of [...this.bodies, ...this.heads, this.legs, this.smoke, this.birdBody, this.birdWing]) {
      im.count = 0
      im.frustumCulled = false
      im.castShadow = im !== this.smoke
      this.group.add(im)
    }
    for (const bm of this.bodies) bm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3)
  }

  /** 选中 / 飞往一处地方：市井围着它布置（null 则按镜头焦点自动找最近的地标） */
  setPlace(placeId: string | null): void {
    this.pinned = placeId
    this.checkT = 0
  }

  update(dt: number, time: number, focus: THREE.Vector3, distance: number, night: number, daylight: number): void {
    dt = Math.min(dt, 0.1)
    this.checkT -= dt
    if (this.checkT <= 0) {
      this.checkT = 1
      this.pick(focus, distance)
    }
    this.group.visible = distance < WATER_DISTANCE
    if (!this.group.visible) return
    const near = !!this.place && distance < LIFE_DISTANCE
    this.stepWalkers(near ? dt : 0, time, near, night)
    this.stepSmoke(dt, near, night, daylight)
    this.stepBirds(dt, time, near && night < 0.5)
    this.stepBoats(dt, time)
  }

  /* ———— 选址 ———— */

  private pick(focus: THREE.Vector3, distance: number): void {
    const L = this.ctx.landmarks
    let lm: ResolvedLandmark | null = null
    if (this.pinned) {
      const p = L.byPlaceId(this.pinned)
      if (p && Math.hypot(p.x - focus.x, p.z - focus.z) < p.def.radius + 160) lm = p
      else if (p && distance > 200) lm = null
    }
    if (!lm && distance < LIFE_DISTANCE) {
      let best = Infinity
      for (const l of L.landmarks) {
        if (!l.placements.length) continue
        const d = Math.hypot(l.x - focus.x, l.z - focus.z) - l.def.radius
        if (d < 80 && d < best) {
          best = d
          lm = l
        }
      }
    }
    if (lm !== this.place) {
      this.place = lm
      this.populate(lm)
    }
    if (distance < WATER_DISTANCE && (!this.waterCenter || this.waterCenter.distanceTo(focus) > 180)) {
      this.waterCenter = focus.clone()
      this.populateWater(focus)
    } else if (distance >= WATER_DISTANCE && this.waterCenter) {
      this.waterCenter = null
      this.clearBoats()
    }
  }

  private populate(lm: ResolvedLandmark | null): void {
    this.walkers = []
    this.smokes = []
    this.puffs = []
    this.birds = []
    if (!lm) return
    this.rnd = new Random(lm.index * 977 + 13)
    const t = this.ctx.terrain
    const occ = this.ctx.landmarks.occupancy
    /* 可走的格：铺地优先，其次地标范围里的平地（不在房子里、不在水里、与城址同高） */
    const R = Math.min(64, lm.def.radius)
    const paved: [number, number][] = []
    const open: [number, number][] = []
    for (let dz = -R; dz <= R; dz += 1)
      for (let dx = -R; dx <= R; dx += 1) {
        if (dx * dx + dz * dz > R * R) continue
        const x = lm.x + dx
        const z = lm.z + dz
        if (occ.has(x, z, Occupancy.Building)) continue
        const c = t.column(x, z)
        if (c.waterY >= 0 && c.waterY >= c.height) continue
        if (Math.abs(Math.floor(c.height) - lm.level) > 2) continue
        ;(c.paved ? paved : open).push([x, z])
      }
    const cells = paved.length > 30 ? paved : [...paved, ...open]
    const walkable = new Set(cells.map(([x, z]) => x * 65536 + z))
    this.walkable = walkable
    const busy = (lm.def.major ? 1.6 : 1) * (lm.def.walls ? 1.5 : 1)
    const n = Math.min(MAX_PEOPLE - 20, Math.round(Math.min(cells.length / 18, 50) * busy))
    for (let i = 0; i < n && cells.length; i++) {
      const [x, z] = this.rnd.pick(cells)
      this.walkers.push(this.walker(x + 0.5, z + 0.5, false))
    }
    /* 摊贩与看货的人；有炊烟的屋 */
    for (const p of lm.placements) {
      const id = p.id
      if (id.includes('-stall-') && this.walkers.length < MAX_PEOPLE - 1) {
        const v = this.walker(p.x + 0.5, p.z - 1.5, true)
        v.a = Math.PI / 2
        v.hat = 1
        this.walkers.push(v)
        if (this.rnd.chance(0.6)) {
          const c = this.walker(p.x + this.rnd.range(-0.8, 0.8), p.z + 2.6, true)
          c.a = -Math.PI / 2
          this.walkers.push(c)
        }
      } else if (/-(house|courtyard|hut|shop|loft)-/.test(id) && this.smokes.length < 14 && this.rnd.chance(0.55)) {
        const w = p.world
        this.smokes.push({ x: this.rnd.range(w.minX + 1, w.maxX - 1), y: w.maxY + 0.5, z: w.minZ + 1.5, rate: this.rnd.range(0.7, 1.4), acc: this.rnd.range(0, 1) })
      }
    }
    for (let i = 0; i < 6 + (lm.def.major ? 6 : 0); i++)
      this.birds.push({ cx: lm.x + this.rnd.range(-20, 20), cz: lm.z + this.rnd.range(-20, 20), y: lm.level + this.rnd.range(26, 48), r: this.rnd.range(10, 26), w: this.rnd.range(0.25, 0.5) * (this.rnd.chance(0.5) ? 1 : -1), t: this.rnd.range(0, 10), phase: this.rnd.range(0, 6) })
  }

  private walker(x: number, z: number, still: boolean): Walker {
    const t = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    // 类别：约四成士人、三成五女子、二成五劳作者（摊贩另设为劳作者）
    const u = this.rnd.next()
    const hat = u < 0.4 ? 0 : u < 0.75 ? 2 : 1
    const robes = hat === 0 ? T.scholarRobes : hat === 2 ? T.womanRobes : T.laborRobes
    return {
      x,
      z,
      y: Math.floor(t.height) + 1,
      a: this.rnd.range(0, Math.PI * 2),
      tx: x,
      tz: z,
      dir: this.rnd.int(0, 3),
      speed: this.rnd.range(0.9, 1.6),
      phase: this.rnd.range(0, 6.28),
      robe: new THREE.Color(this.rnd.pick(robes as unknown as string[])),
      hat,
      still,
    }
  }

  /* ———— 行人 ———— */

  private stepWalkers(dt: number, time: number, near: boolean, night: number): void {
    const counts = [0, 0, 0]
    let n = 0
    if (near) {
      // 夜里街上人少：只留一部分（摊贩收摊）
      const keep = night > 0.6 ? 0.3 : 1
      for (let i = 0; i < this.walkers.length; i++) {
        const w = this.walkers[i]
        if (i / this.walkers.length > keep) break
        if (!w.still) this.walk(w, dt)
        const moving = !w.still
        const swing = moving ? Math.sin(time * 7 * w.speed + w.phase) * 0.6 : Math.sin(time * 1.5 + w.phase) * 0.04
        const bob = moving ? Math.abs(Math.sin(time * 7 * w.speed + w.phase)) * 0.06 : 0
        this.q.setFromEuler(this.e.set(0, -w.a, 0))
        this.m.compose(this.v.set(w.x, w.y + bob, w.z), this.q, this.s.set(1, 1, 1))
        const ci = counts[w.hat]++
        this.bodies[w.hat].setMatrixAt(ci, this.m)
        this.bodies[w.hat].setColorAt(ci, w.robe)
        this.heads[w.hat].setMatrixAt(ci, this.m)
        for (const side of [-1, 1]) {
          // 髋部在身体左右各 0.12 格：先按朝向转过去，再绕横轴前后摆
          this.q.setFromEuler(this.e.set(0, -w.a, 0))
          this.v.set(0, 0, side * 0.12).applyQuaternion(this.q)
          this.v.x += w.x
          this.v.y = w.y + 0.66 + bob
          this.v.z += w.z
          this.q.setFromEuler(this.e.set(0, -w.a, swing * side, 'YXZ'))
          this.m.compose(this.v, this.q, this.s.set(1, 1, 1))
          this.legs.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), this.m)
        }
        n++
      }
    }
    this.legs.count = n * 2
    FIGURE_KINDS.forEach((_k, i) => {
      for (const im of [this.bodies[i], this.heads[i]]) {
        im.count = counts[i]
        im.instanceMatrix.needsUpdate = true
      }
      if (this.bodies[i].instanceColor) this.bodies[i].instanceColor!.needsUpdate = true
    })
    this.legs.instanceMatrix.needsUpdate = true
  }

  private walk(w: Walker, dt: number): void {
    const dx = w.tx - w.x
    const dz = w.tz - w.z
    const d = Math.hypot(dx, dz)
    if (d < 0.05) {
      /* 到格心：多半接着往前，偶尔拐弯，走不通就掉头 */
      const dirs = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ]
      const cx = Math.floor(w.x)
      const cz = Math.floor(w.z)
      const ok = (k: number) => this.walkable.has((cx + dirs[k][0]) * 65536 + cz + dirs[k][1])
      let k = w.dir
      if (!ok(k) || this.rnd.chance(0.12)) {
        const opts = [0, 1, 2, 3].filter((j) => ok(j) && j !== (w.dir + 2) % 4)
        k = opts.length ? this.rnd.pick(opts) : (w.dir + 2) % 4
        if (!ok(k)) return
      }
      w.dir = k
      w.tx = cx + dirs[k][0] + 0.5
      w.tz = cz + dirs[k][1] + 0.5
      const c = this.ctx.terrain.column(cx + dirs[k][0], cz + dirs[k][1])
      w.y = Math.floor(c.height) + 1
      return
    }
    const step = Math.min(d, w.speed * dt)
    w.x += (dx / d) * step
    w.z += (dz / d) * step
    const target = Math.atan2(dz, dx)
    let da = target - w.a
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    w.a += da * Math.min(1, dt * 10)
  }

  /* ———— 炊烟 ———— */

  private stepSmoke(dt: number, near: boolean, night: number, daylight: number): void {
    // 早晚炊烟最浓；夜深了歇火
    const strength = near ? (night > 0.8 ? 0.15 : 0.6 + 0.4 * (1 - daylight)) : 0
    for (const s of this.smokes) {
      s.acc += dt * s.rate * strength
      while (s.acc > 1 && this.puffs.length < MAX_SMOKE) {
        s.acc -= 1
        this.puffs.push({ x: s.x + this.rnd.range(-0.3, 0.3), y: s.y, z: s.z + this.rnd.range(-0.3, 0.3), age: 0, life: this.rnd.range(5, 8), drift: this.rnd.range(0.3, 0.8) })
      }
    }
    let n = 0
    const alive: Puff[] = []
    for (const p of this.puffs) {
      p.age += dt
      if (p.age > p.life) continue
      alive.push(p)
      const k = p.age / p.life
      p.y += dt * (1.3 - k * 0.6)
      p.x += dt * p.drift
      p.z += dt * p.drift * 0.4
      const size = 0.5 + k * 1.8
      this.q.identity()
      // 越往上越散：方块变大、下沉入空气（按生命缩小到 0 前的最后一截）
      const fade = k > 0.75 ? (1 - k) / 0.25 : 1
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.setScalar(size * fade))
      this.smoke.setMatrixAt(n++, this.m)
    }
    this.puffs = alive
    this.smoke.count = n
    this.smoke.instanceMatrix.needsUpdate = true
  }

  /* ———— 飞鸟 ———— */

  private stepBirds(dt: number, time: number, on: boolean): void {
    let n = 0
    if (on)
      for (const b of this.birds) {
        b.t += dt
        const ang = b.t * b.w + b.phase
        const x = b.cx + Math.cos(ang) * b.r
        const z = b.cz + Math.sin(ang) * b.r
        const y = b.y + Math.sin(b.t * 0.7 + b.phase) * 2
        const heading = ang + (b.w > 0 ? Math.PI / 2 : -Math.PI / 2)
        this.q.setFromEuler(this.e.set(0, -heading, 0))
        this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(1.3))
        this.birdBody.setMatrixAt(n, this.m)
        const flap = Math.sin(time * 9 + b.phase) * 0.7
        for (const side of [1, -1]) {
          this.q.setFromEuler(this.e.set(side > 0 ? flap : Math.PI - flap, -heading, 0, 'YXZ'))
          this.m.compose(this.v.set(x, y, z), this.q, this.s.setScalar(1.3))
          this.birdWing.setMatrixAt(n * 2 + (side > 0 ? 0 : 1), this.m)
        }
        n++
      }
    this.birdBody.count = n
    this.birdWing.count = n * 2
    this.birdBody.instanceMatrix.needsUpdate = true
    this.birdWing.instanceMatrix.needsUpdate = true
  }

  /* ———— 船 ———— */

  private readonly waterCache = new Map<number, number>()

  private clearBoats(): void {
    for (const b of this.boats) this.group.remove(b.mesh)
    this.boats = []
  }

  private addBoat(kind: Boat['kind'], init: Omit<Boat, 'kind' | 'mesh' | 'phase'>): void {
    const mesh = new THREE.Mesh(this.boatGeo[kind], this.mat)
    mesh.castShadow = true
    mesh.matrixAutoUpdate = false
    this.group.add(mesh)
    this.boats.push({ ...init, kind, mesh, phase: this.rnd.range(0, 6.28) })
  }

  /**
   * 按水域配船：
   *  - 大江（半宽 ≥ 4.5，长江、黄河下游……）：运货的漕船与客船为主，少量渔舟；
   *  - 中小河：渔舟为主，间有小一号的漕船；
   *  - 运河（大运河、江南运河）与城中河渠：漕船、客船；
   *  - 湖：每湖至多三条小渔舟（按面积一到三条），大湖（太湖、洞庭、鄱阳）至多一条客船；不进大船；
   *  - 海（真实海域）：明代福船为主，一两条海上渔船。
   */
  private populateWater(focus: THREE.Vector3): void {
    this.clearBoats()
    const rnd = new Random(Math.round(focus.x) * 31 + Math.round(focus.z))
    const rivers = this.ctx.rivers.rivers
    const RANGE = 420
    let river = 0
    let lake = 0
    const riverBoat = (kind: Boat['kind'], ri: number, s: number, speed: number, lane: number) => {
      this.addBoat(kind, { river: ri, s, dir: lane >= 0 ? 1 : -1, lane, x: 0, z: 0, y: 0, a: 0, speed })
      river++
    }
    /* 江河、运河 */
    // 离焦点最近的水道先配船（名额有限时，眼前的运河、小河不被远处的大江占光）
    const near = rivers
      .map((r, ri) => {
        const idx: number[] = []
        let dmin = Infinity
        for (let s = 0; s < r.pts.length; s++) {
          const d = Math.hypot(r.pts[s][0] - focus.x, r.pts[s][1] - focus.z)
          if (d < RANGE) idx.push(s)
          dmin = Math.min(dmin, d)
        }
        return { ri, idx, dmin }
      })
      .filter((o) => o.idx.length)
      .sort((a, b) => a.dmin - b.dmin)
    for (const { ri, idx } of near) {
      if (river >= MAX_RIVER_BOATS) break
      const r = rivers[ri]
      const canal = r.def.id.includes('canal')
      const hw = r.halfWidth[idx[idx.length >> 1]]
      const n = Math.min(MAX_RIVER_BOATS - river, Math.ceil(idx.length / (canal ? 18 : hw >= 4.5 ? 16 : 24)))
      for (let i = 0; i < n; i++) {
        const s = rnd.pick(idx)
        if (r.halfWidth[s] < 2.2) continue
        const u = rnd.next()
        const lane = rnd.chance(0.5) ? rnd.range(0.25, 0.5) : -rnd.range(0.25, 0.5)
        if (canal) riverBoat(u < 0.6 ? 'cargo' : 'passenger', ri, s, rnd.range(1.0, 1.8), lane)
        else if (hw >= 4.5) riverBoat(u < 0.42 ? 'cargo' : u < 0.72 ? 'passenger' : 'fishing', ri, s, u < 0.72 ? rnd.range(1.4, 2.4) : rnd.range(0.4, 1.0), lane)
        else if (r.halfWidth[s] >= 3) riverBoat(u < 0.65 ? 'fishing' : u < 0.9 ? 'cargo' : 'passenger', ri, s, u < 0.65 ? rnd.range(0.4, 1.0) : rnd.range(1.0, 1.8), lane)
        else riverBoat('fishing', ri, s, rnd.range(0.4, 1.0), lane)
      }
    }
    /* 城中河渠（秦淮、苏州水巷）：客船与漕船来回 */
    for (const lm of this.ctx.landmarks.landmarks) {
      if (Math.hypot(lm.x - focus.x, lm.z - focus.z) > RANGE) continue
      for (const op of lm.def.terrainModifier ?? []) {
        if (op.t !== 'canal' || op.w < 1.8 || river >= MAX_RIVER_BOATS) continue
        const path = op.pts.map(([px, pz]) => [lm.x + px, lm.z + pz] as [number, number])
        let len = 0
        for (let i = 1; i < path.length; i++) len += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
        const n = Math.max(1, Math.round(len / 40))
        for (let i = 0; i < n; i++) {
          this.addBoat(i % 3 === 2 ? 'cargo' : i % 2 ? 'fishing' : 'passenger', { river: -1, s: rnd.range(0, len), dir: rnd.chance(0.5) ? 1 : -1, lane: 0, x: path[0][0], z: path[0][1], y: lm.level + 1, a: 0, speed: rnd.range(0.8, 1.4) })
          this.boats[this.boats.length - 1].path = path
          river++
        }
      }
    }
    /* 湖：按面积定渔舟数；大湖加一两条客船 */
    const placeInLake = (cx: number, cz: number, rx: number, rz: number, cos: number, sin: number, kind: Boat['kind'], y?: number): boolean => {
      for (let t = 0; t < 12; t++) {
        const a = rnd.range(0, Math.PI * 2)
        const f = Math.sqrt(rnd.next()) * 0.8
        const u = Math.cos(a) * rx * f
        const v = Math.sin(a) * rz * f
        const x = cx + u * cos - v * sin
        const z = cz + u * sin + v * cos
        if (!this.lakeAt(x, z)) continue
        const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
        this.addBoat(kind, { river: -1, s: 0, dir: 1, lane: 0, x, z, y: y ?? c.waterY + 1, a: rnd.range(0, 6.28), speed: kind === 'fishing' ? rnd.range(0.3, 0.7) : 0.9 })
        lake++
        return true
      }
      return false
    }
    for (const lk of this.ctx.lakes.lakes) {
      if (Math.hypot(lk.x - focus.x, lk.z - focus.z) > RANGE + Math.max(lk.rx, lk.rz)) continue
      const area = Math.PI * lk.rx * lk.rz
      if (area < 400) continue // 小湖小塘不放船
      // 每个湖至多三条小渔舟（小湖一条）、大湖（太湖、洞庭、鄱阳）至多一条客船
      const nF = area > 2500 ? 3 : area > 800 ? 2 : 1
      for (let i = 0; i < nF && lake < MAX_LAKE_BOATS; i++) placeInLake(lk.x, lk.z, lk.rx, lk.rz, lk.cos, lk.sin, 'fishing')
      if (area > 2500) placeInLake(lk.x, lk.z, lk.rx * 0.6, lk.rz * 0.6, lk.cos, lk.sin, 'passenger')
    }
    /* 名胜里营造的湖（西湖……）：同样按面积；瀑下潭、园中池这类小水景不放 */
    for (const lm of this.ctx.landmarks.landmarks) {
      if (Math.hypot(lm.x - focus.x, lm.z - focus.z) > RANGE) continue
      for (const op of lm.def.terrainModifier ?? []) {
        if (op.t !== 'lake') continue
        const area = Math.PI * op.rx * op.rz
        // 瀑下深潭、园林小池这样的小水景不放船
        if (area < 300) continue
        const c = Math.cos(op.rot ?? 0)
        const sn = Math.sin(op.rot ?? 0)
        const nF = area > 300 ? 3 : area > 100 ? 2 : 1
        for (let i = 0; i < nF && lake < MAX_LAKE_BOATS; i++) placeInLake(lm.x + op.x, lm.z + op.z, op.rx, op.rz, c, sn, 'fishing', lm.level + 1)
        if (area > 400) placeInLake(lm.x + op.x, lm.z + op.z, op.rx * 0.5, op.rz * 0.5, c, sn, 'passenger', lm.level + 1)
      }
    }
    /* 海：真实海域里沿岸而行——大船为主，一两条海上渔船 */
    let sea = 0
    for (let tries = 0; tries < 120 && sea < MAX_SHIPS + 2; tries++) {
      const a = rnd.range(0, Math.PI * 2)
      const d = rnd.range(60, 360)
      const x = focus.x + Math.cos(a) * d
      const z = focus.z + Math.sin(a) * d
      if (!this.deepSea(x, z)) continue
      const land = this.landDir(x, z)
      if (!land) continue
      const h = Math.atan2(land[1], land[0]) + (rnd.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      const kind: Boat['kind'] = sea < MAX_SHIPS ? 'ship' : 'seaFisher'
      this.addBoat(kind, { river: -1, s: 0, dir: 1, lane: 0, x, z, y: SEA_LEVEL + 1, a: h, speed: kind === 'ship' ? rnd.range(2.2, 3.4) : rnd.range(1.2, 2) })
      sea++
    }
  }

  /**
   * 真正的海（渤海、黄海、东海、南海）：地图西、北边缘外与国境外的「海」只是图外空白，不走船——
   * 要求在图内、经度 107° 以东、纬度 41.5° 以南
   */
  private deepSea(x: number, z: number): boolean {
    if (!this.ctx.macro.inBounds(x, z)) return false
    const g = this.P.unproject(x, z)
    if (g.lng < 107 || g.lat > 41.5) return false
    const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    return c.waterKind === WaterKind.Sea && c.waterY - c.height >= 3
  }

  /** 附近陆地的大致方向（没有岸就不算沿海） */
  private landDir(x: number, z: number): [number, number] | null {
    let lx = 0
    let lz = 0
    let n = 0
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      for (const r of [20, 40, 60]) {
        const c = this.ctx.terrain.column(Math.floor(x + Math.cos(a) * r), Math.floor(z + Math.sin(a) * r))
        if (c.waterKind !== WaterKind.Sea) {
          lx += Math.cos(a) / r
          lz += Math.sin(a) / r
          n++
          break
        }
      }
    }
    return n ? [lx, lz] : null
  }

  private stepBoats(dt: number, time: number): void {
    const rivers = this.ctx.rivers.rivers
    for (const b of this.boats) {
      if (b.path) {
        /* 沿河渠折线：到头掉头 */
        const P = b.path
        let total = 0
        for (let i = 1; i < P.length; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
        b.s += b.dir * b.speed * dt
        if (b.s < 0 || b.s > total) {
          b.dir = -b.dir
          b.s = Math.max(0, Math.min(total, b.s))
        }
        let rest = b.s
        for (let i = 1; i < P.length; i++) {
          const dx = P[i][0] - P[i - 1][0]
          const dz = P[i][1] - P[i - 1][1]
          const l = Math.hypot(dx, dz)
          if (rest <= l || i === P.length - 1) {
            const f = Math.min(1, rest / (l || 1))
            b.x = P[i - 1][0] + dx * f
            b.z = P[i - 1][1] + dz * f
            const heading = Math.atan2(dz, dx) + (b.dir < 0 ? Math.PI : 0)
            let da = heading - b.a
            while (da > Math.PI) da -= Math.PI * 2
            while (da < -Math.PI) da += Math.PI * 2
            b.a += da * Math.min(1, dt * 3)
            break
          }
          rest -= l
        }
      } else if (b.river >= 0) {
        const r = rivers[b.river]
        const n = r.pts.length
        b.s += (b.dir * b.speed * dt) / 4
        if (b.s <= 0 || b.s >= n - 1 || (this.waterCenter && Math.hypot(b.x - this.waterCenter.x, b.z - this.waterCenter.z) > 460)) {
          b.dir = -b.dir
          b.s = Math.min(n - 1.001, Math.max(0, b.s))
          b.lane = -b.lane
        }
        const i = Math.min(n - 2, Math.floor(b.s))
        const f = b.s - i
        const [x0, z0] = r.pts[i]
        const [x1, z1] = r.pts[i + 1]
        const tx = x1 - x0
        const tz = z1 - z0
        const tl = Math.hypot(tx, tz) || 1
        const hw = r.halfWidth[i] * 0.9
        // 横向：垂直于河道，在河宽之内
        b.x = x0 + tx * f + (-tz / tl) * b.lane * hw
        b.z = z0 + tz * f + (tx / tl) * b.lane * hw
        if (b.y <= 0) b.y = (f < 0.5 ? r.level[i] : r.level[i + 1]) + 1 // 初值；之后随脚下真实水面（floatOnWater）
        const heading = Math.atan2(tz, tx) + (b.dir < 0 ? Math.PI : 0)
        let da = heading - b.a
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da += Math.PI * 2
        b.a += da * Math.min(1, dt * 2)
      } else {
        const nx = b.x + Math.cos(b.a) * b.speed * dt
        const nz = b.z + Math.sin(b.a) * b.speed * dt
        const ahead = b.kind === 'ship' ? 14 : b.kind === 'seaFisher' ? 8 : 4
        const okAhead = b.kind === 'ship' || b.kind === 'seaFisher' ? this.deepSea(nx + Math.cos(b.a) * ahead, nz + Math.sin(b.a) * ahead) : this.lakeAt(nx + Math.cos(b.a) * ahead, nz + Math.sin(b.a) * ahead)
        if (okAhead) {
          b.x = nx
          b.z = nz
        } else b.a += (b.kind === 'ship' ? 0.6 : 1.0) * dt * 4
        if (b.kind === 'fishing') b.a += Math.sin(time * 0.2 + b.phase) * dt * 0.2
      }
      if (b.kind !== 'ship' && b.kind !== 'seaFisher') this.floatOnWater(b, dt)
      const roll = Math.sin(time * 1.3 + b.phase) * (b.kind === 'ship' ? 0.025 : b.kind === 'cargo' ? 0.03 : 0.05)
      const pitch = Math.sin(time * 0.9 + b.phase * 2) * 0.02
      const bob = Math.sin(time * 1.7 + b.phase) * 0.06
      this.q.setFromEuler(this.e.set(roll, -b.a, pitch, 'YXZ'))
      // 吃水：船底略低于水面
      b.mesh.matrix.compose(this.v.set(b.x, b.y - (b.kind === 'ship' ? 1.3 : b.kind === 'seaFisher' ? 0.8 : b.kind === 'cargo' ? 0.55 : 0.4) + bob, b.z), this.q, this.s.set(1, 1, 1))
      b.mesh.matrixWorldNeedsUpdate = true
    }
  }

  /**
   * 船浮在脚下真实的水面上：取船头、船腰、船尾三处水面的最高者（跨在水位台阶上时宁可浮在低的那侧水面之上，
   * 也不沉进高的那侧水下）。江河穿湖处的水面是湖面、河渠出城后一级级跌落——都不能只用河道的标称水位。
   */
  private floatOnWater(b: Boat, dt: number): void {
    const half = b.kind === 'fishing' ? 2.4 : b.kind === 'passenger' ? 4.4 : 5.4
    const ca = Math.cos(b.a)
    const sa = Math.sin(b.a)
    let top = -1
    for (let k = -1; k <= 1; k++) top = Math.max(top, this.waterTop(b.x + ca * half * k, b.z + sa * half * k))
    if (top < 0) return
    // 水面抬高（驶上高一级的水面）立刻浮上来，绝不沉在水下；降低时缓缓落下
    if (b.y <= 0 || top > b.y || b.y - top > 3) b.y = top
    else b.y += (top - b.y) * Math.min(1, dt * 4)
  }

  /** 某格的水面高度（水顶面 y），不是水返回 -1；按格缓存 */
  private waterTop(x: number, z: number): number {
    const ix = Math.floor(x)
    const iz = Math.floor(z)
    const key = ix * 65536 + iz
    let v = this.waterCache.get(key)
    if (v === undefined) {
      const c = this.ctx.terrain.column(ix, iz)
      v = c.waterY >= 0 && c.height < c.waterY ? c.waterY + 1 : -1
      if (this.waterCache.size > 20000) this.waterCache.clear()
      this.waterCache.set(key, v)
    }
    return v
  }

  private lakeAt(x: number, z: number): boolean {
    const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    return (c.waterKind === WaterKind.Lake || c.waterKind === WaterKind.Pond) && c.waterY >= c.height + 1
  }

  dispose(): void {
    this.clearBoats()
    for (const g of Object.values(this.boatGeo)) g.dispose()
    for (const im of [...this.bodies, ...this.heads, this.legs, this.smoke, this.birdBody, this.birdWing]) im.geometry.dispose()
    this.mat.dispose()
    this.smokeMat.dispose()
  }
}
