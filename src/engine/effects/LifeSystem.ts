import * as THREE from 'three'
import { LifeTokens as T } from '../../config/palette'
import { SEA_LEVEL } from '../../world/coordinate/constants'
import type { WorldContext } from '../../world/generation/WorldContext'
import type { ResolvedLandmark } from '../../world/landmark/LandmarkRegistry'
import { Occupancy } from '../../world/structure/OccupancyMap'
import { WaterKind } from '../../world/terrain/TerrainSample'
import { Random } from '../../utils/math'
import {
  birdBodyGeometry,
  birdWingGeometry,
  fishingBoatGeometry,
  headGeometry,
  legGeometry,
  mingShipGeometry,
  passengerBoatGeometry,
  robeGeometry,
  smokeGeometry,
} from './LifeModels'

const MAX_PEOPLE = 90
const MAX_SMOKE = 160
const MAX_BIRDS = 24
const MAX_FISHING = 14
const MAX_PASSENGER = 6
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
  kind: 'fishing' | 'passenger' | 'ship'
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
  private readonly robes: THREE.InstancedMesh
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
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly v = new THREE.Vector3()
  private readonly s = new THREE.Vector3()

  constructor(private readonly ctx: WorldContext) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    this.robes = new THREE.InstancedMesh(robeGeometry(), this.mat, MAX_PEOPLE)
    this.heads = (['bun', 'straw', 'cap'] as const).map((h) => new THREE.InstancedMesh(headGeometry(h), this.mat, MAX_PEOPLE))
    this.legs = new THREE.InstancedMesh(legGeometry(), this.mat, MAX_PEOPLE * 2)
    this.smokeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(T.smoke), transparent: true, opacity: 0.55, depthWrite: false })
    this.smoke = new THREE.InstancedMesh(smokeGeometry(), this.smokeMat, MAX_SMOKE)
    this.birdBody = new THREE.InstancedMesh(birdBodyGeometry(), this.mat, MAX_BIRDS)
    this.birdWing = new THREE.InstancedMesh(birdWingGeometry(), this.mat, MAX_BIRDS * 2)
    this.boatGeo = { fishing: fishingBoatGeometry(), passenger: passengerBoatGeometry(), ship: mingShipGeometry() }
    for (const im of [this.robes, ...this.heads, this.legs, this.smoke, this.birdBody, this.birdWing]) {
      im.count = 0
      im.frustumCulled = false
      im.castShadow = im !== this.smoke
      this.group.add(im)
    }
    this.robes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3)
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
    const robes = T.robes
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
      hat: this.rnd.chance(0.25) ? 1 : this.rnd.chance(0.3) ? 2 : 0,
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
        this.robes.setMatrixAt(n, this.m)
        this.robes.setColorAt(n, w.robe)
        const hm = this.heads[w.hat]
        hm.setMatrixAt(counts[w.hat]++, this.m)
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
    this.robes.count = n
    this.legs.count = n * 2
    this.heads.forEach((h, i) => {
      h.count = counts[i]
      h.instanceMatrix.needsUpdate = true
    })
    this.robes.instanceMatrix.needsUpdate = true
    if (this.robes.instanceColor) this.robes.instanceColor.needsUpdate = true
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

  private populateWater(focus: THREE.Vector3): void {
    this.clearBoats()
    const rnd = new Random(Math.round(focus.x) * 31 + Math.round(focus.z))
    const rivers = this.ctx.rivers.rivers
    const RANGE = 420
    /* 江河：在焦点附近的河段上撒船，船沿中心线上下行 */
    let fishing = 0
    let passenger = 0
    for (let ri = 0; ri < rivers.length; ri++) {
      const r = rivers[ri]
      const idx: number[] = []
      for (let s = 0; s < r.pts.length; s++) if (Math.hypot(r.pts[s][0] - focus.x, r.pts[s][1] - focus.z) < RANGE) idx.push(s)
      if (!idx.length) continue
      const big = r.halfWidth[idx[idx.length >> 1]] >= 4.5
      const nF = Math.min(MAX_FISHING - fishing, Math.ceil(idx.length / 25))
      for (let i = 0; i < nF; i++) {
        const s = rnd.pick(idx)
        if (r.halfWidth[s] < 2.5) continue
        this.addBoat('fishing', { river: ri, s, dir: rnd.chance(0.5) ? 1 : -1, lane: rnd.range(-0.5, 0.5), x: 0, z: 0, y: 0, a: 0, speed: rnd.range(0.4, 1.2) })
        fishing++
      }
      if (big)
        for (let i = 0; i < Math.min(MAX_PASSENGER - passenger, Math.ceil(idx.length / 40)); i++) {
          const dir = rnd.chance(0.5) ? 1 : -1
          this.addBoat('passenger', { river: ri, s: rnd.pick(idx), dir, lane: dir * 0.35, x: 0, z: 0, y: 0, a: 0, speed: rnd.range(1.6, 2.6) })
          passenger++
        }
    }
    /* 名胜里的湖（西湖这样手工营造的）：湖心几条渔舟，大湖再加一条画舫 */
    for (const lm of this.ctx.landmarks.landmarks) {
      if (Math.hypot(lm.x - focus.x, lm.z - focus.z) > RANGE) continue
      for (const op of lm.def.terrainModifier ?? []) {
        if (op.t !== 'lake') continue
        const n = Math.min(MAX_FISHING - fishing, Math.max(1, Math.round((op.rx * op.rz) / 90)))
        for (let i = 0; i < n; i++) {
          const a = rnd.range(0, Math.PI * 2)
          const f = rnd.range(0, 0.6)
          this.addBoat('fishing', { river: -1, s: 0, dir: 1, lane: 0, x: lm.x + op.x + Math.cos(a) * op.rx * f, z: lm.z + op.z + Math.sin(a) * op.rz * f, y: lm.level + 1, a: rnd.range(0, 6.28), speed: rnd.range(0.3, 0.7) })
          fishing++
        }
        if (op.rx >= 12 && op.rz >= 10 && passenger < MAX_PASSENGER) {
          this.addBoat('passenger', { river: -1, s: 0, dir: 1, lane: 0, x: lm.x + op.x, z: lm.z + op.z, y: lm.level + 1, a: rnd.range(0, 6.28), speed: 0.9 })
          passenger++
        }
      }
    }
    /* 湖：几条渔舟在湖心附近漂 */
    for (let tries = 0; tries < 60 && fishing < MAX_FISHING; tries++) {
      const x = focus.x + rnd.range(-300, 300)
      const z = focus.z + rnd.range(-300, 300)
      const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
      if ((c.waterKind !== WaterKind.Lake && c.waterKind !== WaterKind.Pond) || c.waterY < c.height + 1) continue
      this.addBoat('fishing', { river: -1, s: 0, dir: 1, lane: 0, x, z, y: c.waterY + 1, a: rnd.range(0, 6.28), speed: rnd.range(0.3, 0.8) })
      fishing++
    }
    /* 海：沿岸深水处，福船顺着海岸线缓缓驶过 */
    let ships = 0
    for (let tries = 0; tries < 90 && ships < MAX_SHIPS; tries++) {
      const a = rnd.range(0, Math.PI * 2)
      const d = rnd.range(60, 360)
      const x = focus.x + Math.cos(a) * d
      const z = focus.z + Math.sin(a) * d
      if (!this.deepSea(x, z)) continue
      const land = this.landDir(x, z)
      if (!land) continue
      // 岸在一侧：沿岸而行
      const h = Math.atan2(land[1], land[0]) + (rnd.chance(0.5) ? Math.PI / 2 : -Math.PI / 2)
      this.addBoat('ship', { river: -1, s: 0, dir: 1, lane: 0, x, z, y: SEA_LEVEL + 1, a: h, speed: rnd.range(2.2, 3.4) })
      ships++
    }
  }

  private deepSea(x: number, z: number): boolean {
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
      if (b.river >= 0) {
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
        b.y = (f < 0.5 ? r.level[i] : r.level[i + 1]) + 1
        const heading = Math.atan2(tz, tx) + (b.dir < 0 ? Math.PI : 0)
        let da = heading - b.a
        while (da > Math.PI) da -= Math.PI * 2
        while (da < -Math.PI) da += Math.PI * 2
        b.a += da * Math.min(1, dt * 2)
      } else {
        const nx = b.x + Math.cos(b.a) * b.speed * dt
        const nz = b.z + Math.sin(b.a) * b.speed * dt
        const ahead = b.kind === 'ship' ? 14 : 4
        const okAhead = b.kind === 'ship' ? this.deepSea(nx + Math.cos(b.a) * ahead, nz + Math.sin(b.a) * ahead) : this.lakeAt(nx + Math.cos(b.a) * ahead, nz + Math.sin(b.a) * ahead)
        if (okAhead) {
          b.x = nx
          b.z = nz
        } else b.a += (b.kind === 'ship' ? 0.6 : 1.2) * dt * 4
        if (b.kind === 'fishing') b.a += Math.sin(time * 0.2 + b.phase) * dt * 0.2
      }
      const roll = Math.sin(time * 1.3 + b.phase) * (b.kind === 'ship' ? 0.025 : 0.05)
      const pitch = Math.sin(time * 0.9 + b.phase * 2) * 0.02
      const bob = Math.sin(time * 1.7 + b.phase) * 0.06
      this.q.setFromEuler(this.e.set(roll, -b.a, pitch, 'YXZ'))
      // 吃水：船底略低于水面
      b.mesh.matrix.compose(this.v.set(b.x, b.y - (b.kind === 'ship' ? 1.3 : 0.4) + bob, b.z), this.q, this.s.set(1, 1, 1))
      b.mesh.matrixWorldNeedsUpdate = true
    }
  }

  private lakeAt(x: number, z: number): boolean {
    const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    return (c.waterKind === WaterKind.Lake || c.waterKind === WaterKind.Pond) && c.waterY >= c.height + 1
  }

  dispose(): void {
    this.clearBoats()
    for (const g of Object.values(this.boatGeo)) g.dispose()
    for (const im of [this.robes, ...this.heads, this.legs, this.smoke, this.birdBody, this.birdWing]) im.geometry.dispose()
    this.mat.dispose()
    this.smokeMat.dispose()
  }
}
