import * as THREE from 'three'
import { LifeTokens as T, NightTokens } from '../../config/palette'
import { SEA_LEVEL } from '../../world/coordinate/constants'
import { getProjection } from '../../world/coordinate/GeoProjection'
import type { WorldContext } from '../../world/generation/WorldContext'
import type { ResolvedLandmark } from '../../world/landmark/LandmarkRegistry'
import { Occupancy } from '../../world/structure/OccupancyMap'
import { WaterKind } from '../../world/terrain/TerrainSample'
import { BiomeId } from '../../world/biome/BiomeId'
import { segmentClear, standable } from './Pasture'
import { Random } from '../../utils/math'
import {
  birdBodyGeometry,
  birdWingGeometry,
  cargoBoatGeometry,
  fishingBoatGeometry,
  seaFisherGeometry,
  ANIMAL_KINDS,
  type AnimalKind,
  animalGeometry,
  cartGeometry,
  FIGURE_KINDS,
  FIGURE_PACE,
  FIGURE_SCALE,
  type FigureKind,
  figureBody,
  figureHead,
  legGeometry,
  mingShipGeometry,
  passengerBoatGeometry,
  smokeGeometry,
} from './LifeModels'

const MAX_PEOPLE = 90
const MAX_ANIMALS = 40
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
  /** 第几类人（FIGURE_KINDS 下标） */
  kind: number
  /** 站着不动的（摊贩、看货的） */
  still: boolean
}

interface Animal {
  kind: number
  x: number
  z: number
  y: number
  a: number
  tx: number
  tz: number
  speed: number
  /** 站着吃草的剩余秒数 */
  graze: number
  phase: number
}

/** 各类人的衣色 */
const ROBES: Record<FigureKind, readonly string[]> = {
  official: T.officialRobes,
  scholar: T.scholarRobes,
  maiden: T.womanRobes,
  farmer: T.laborRobes,
  merchant: T.merchantRobes,
  child: T.childRobes,
  elder: T.elderRobes,
  fisher: T.fisherRobes,
  carter: T.carterRobes,
}
const KIND = Object.fromEntries(FIGURE_KINDS.map((k, i) => [k, i])) as Record<FigureKind, number>
const AKIND = Object.fromEntries(ANIMAL_KINDS.map((k, i) => [k, i])) as Record<AnimalKind, number>
interface ResolvedLife {
  town: boolean
  people: number
  mix: Partial<Record<FigureKind, number>>
  /** null：按地域默认配牲畜；空对象：不放 */
  animals: Partial<Record<AnimalKind, number>> | null
  animalDensity: number
}

const TOWN_MIX: Partial<Record<FigureKind, number>> = { official: 0.08, scholar: 0.16, maiden: 0.18, merchant: 0.17, farmer: 0.07, child: 0.1, elder: 0.1, carter: 0.08, fisher: 0.06 }
const VILLAGE_MIX: Partial<Record<FigureKind, number>> = { farmer: 0.28, maiden: 0.15, child: 0.14, elder: 0.12, scholar: 0.07, merchant: 0.06, carter: 0.07, fisher: 0.1, official: 0.01 }
/** 园林、雅集：书生、少女、老人停驻观景，不走商贩，不放牲畜 */
const GARDEN_MIX: Partial<Record<FigureKind, number>> = { scholar: 0.4, maiden: 0.3, elder: 0.2, child: 0.1 }
/** 山中寺观、名山：少量访客 */
const MOUNTAIN_MIX: Partial<Record<FigureKind, number>> = { scholar: 0.4, elder: 0.3, farmer: 0.15, maiden: 0.15 }

/**
 * 一处地标的市井配置：显式写了 life 的为准，其余按类型推——有城墙或大片铺地的是城镇；园林（生物群系覆盖为园林）
 * 是雅集；峰顶取址或主体是名松、石窟的是名山；其余为乡村。地标叙事优先于生物群系
 */
function lifeProfileOf(lm: ResolvedLandmark, paved: number): ResolvedLife {
  const d = lm.def
  const town = !!d.walls?.length || paved > 120
  const garden = d.biomeOverride?.biome === BiomeId.Garden && !d.walls?.length
  const mountain = d.levelMode === 'summit' || d.hero?.kind === 'tree' || d.hero?.kind === 'carving'
  const base: ResolvedLife = garden
    ? { town: false, people: 0.6, mix: GARDEN_MIX, animals: {}, animalDensity: 0 }
    : mountain
      ? { town: false, people: 0.35, mix: MOUNTAIN_MIX, animals: {}, animalDensity: 0 }
      : town
        ? { town: true, people: 1, mix: TOWN_MIX, animals: null, animalDensity: 1 }
        : { town: false, people: 1, mix: VILLAGE_MIX, animals: null, animalDensity: 1 }
  const L = d.life
  if (!L) return base
  return {
    town: base.town,
    people: L.people ?? base.people,
    mix: L.mix ?? base.mix,
    animals: L.animals ?? base.animals,
    animalDensity: L.animalDensity ?? (L.animals ? 1 : base.animalDensity),
  }
}

/** 权重表 → 归一的 [种类, 权重] 列表（去掉 0） */
function norm<K extends string>(w: Partial<Record<K, number>>): [K, number][] {
  const e = (Object.entries(w) as [K, number][]).filter(([, v]) => v > 0)
  const sum = e.reduce((a, [, v]) => a + v, 0) || 1
  return e.map(([k, v]) => [k, v / sum])
}

/** 体型净空：牛马四周一格也要是空地（不贴着墙、岸），羊猪鸡只看脚下 */
const MARGIN: Record<AnimalKind, number> = { cattle: 1, buffalo: 1, horse: 1, sheep: 0, pig: 0, chicken: 0 }

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
/** 一盏灯：中心与尺寸（船体模型坐标，x 船头向前） */
type Lamp = readonly [x: number, y: number, z: number, sx: number, sy: number, sz: number]
const lantern = (x: number, y: number, z: number, s = 0.3): Lamp => [x, y, z, s, s * 1.3, s]
/** 客船舱窗（竹帘那三格，两舷各三扇）：夜里透出的是窗光，不是船头一对灯笼 */
const cabinWindows = (): Lamp[] => [-2.4, -1.0, 0.4].flatMap((x) => [-1.17, 1.17].map((z) => [x + 0.68, 1.68, z, 1.05, 0.55, 0.05] as Lamp))

/**
 * 船上的灯：渔舟船头一盏、客船两舷舱窗、海船艉楼两盏大灯笼；漕船、海上渔船原本没有灯，补一盏艉灯。
 * 模型里的灯笼、竹帘只是着色的方块，夜里不会亮——这里另挂发光的灯芯（窗光）与光晕。
 */
const BOAT_LAMPS: Record<Boat['kind'], readonly Lamp[]> = {
  fishing: [lantern(2.4, 1.4, 0)],
  passenger: cabinWindows(),
  cargo: [lantern(-5.5, 1.8, 0)],
  seaFisher: [lantern(-4.8, 2.7, 0)],
  ship: [lantern(-9.15, 6.0, -2.1, 0.45), lantern(-9.15, 6.0, 2.1, 0.45)],
}

/** 若干小方块合成一个几何体（每盏灯一块）；grow 为光晕在每个方向上外扩的长度 */
function lampGeometry(lamps: readonly Lamp[], grow: number): THREE.BufferGeometry {
  const pos: number[] = []
  const idx: number[] = []
  for (const [x, y, z, sx, sy, sz] of lamps) {
    const box = new THREE.BoxGeometry(sx + grow * 2, sy + grow * 2, sz + grow * 2)
    const bp = box.getAttribute('position')
    const bi = box.getIndex()!
    const base = pos.length / 3
    for (let i = 0; i < bp.count; i++) pos.push(bp.getX(i) + x, bp.getY(i) + y, bp.getZ(i) + z)
    for (let i = 0; i < bi.count; i++) idx.push(bi.getX(i) + base)
    box.dispose()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

export class LifeSystem {
  readonly group = new THREE.Group()
  private readonly mat: THREE.MeshLambertMaterial
  /** 三类人物（士人、劳作者、女子）的身子（按实例着色）与头饰 */
  private readonly bodies: THREE.InstancedMesh[]
  private readonly heads: THREE.InstancedMesh[]
  private readonly legs: THREE.InstancedMesh
  /** 车夫推的独轮车 */
  private readonly carts: THREE.InstancedMesh
  /** 牲畜：每种一个实例网格 */
  private readonly animalMeshes: THREE.InstancedMesh[]
  private animals: Animal[] = []
  /** 牲畜可去的格（地标范围里的空地，不上街） */
  private pasture = new Set<number>()
  private readonly smoke: THREE.InstancedMesh
  private readonly smokeMat: THREE.MeshLambertMaterial
  private readonly birdBody: THREE.InstancedMesh
  private readonly birdWing: THREE.InstancedMesh
  private readonly boatGeo: Record<Boat['kind'], THREE.BufferGeometry>
  /** 船灯：灯芯（入夜按夜色调亮、泛光会把它晕开）与外圈光晕（加色） */
  private readonly lampCoreGeo: Record<Boat['kind'], THREE.BufferGeometry>
  private readonly lampHaloGeo: Record<Boat['kind'], THREE.BufferGeometry>
  private readonly lampCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.lanternGlow), toneMapped: true })
  private readonly lampHalo = new THREE.MeshBasicMaterial({ color: new THREE.Color(NightTokens.lanternGlow), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
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
    this.carts = new THREE.InstancedMesh(cartGeometry(), this.mat, MAX_PEOPLE)
    this.animalMeshes = ANIMAL_KINDS.map((k) => new THREE.InstancedMesh(animalGeometry(k), this.mat, MAX_ANIMALS))
    this.smokeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(T.smoke), transparent: true, opacity: 0.55, depthWrite: false })
    this.smoke = new THREE.InstancedMesh(smokeGeometry(), this.smokeMat, MAX_SMOKE)
    this.birdBody = new THREE.InstancedMesh(birdBodyGeometry(), this.mat, MAX_BIRDS)
    this.birdWing = new THREE.InstancedMesh(birdWingGeometry(), this.mat, MAX_BIRDS * 2)
    this.boatGeo = { fishing: fishingBoatGeometry(), passenger: passengerBoatGeometry(), cargo: cargoBoatGeometry(), ship: mingShipGeometry(), seaFisher: seaFisherGeometry() }
    const kinds = Object.keys(BOAT_LAMPS) as Boat['kind'][]
    this.lampCoreGeo = Object.fromEntries(kinds.map((k) => [k, lampGeometry(BOAT_LAMPS[k], 0.02)])) as Record<Boat['kind'], THREE.BufferGeometry>
    this.lampHaloGeo = Object.fromEntries(kinds.map((k) => [k, lampGeometry(BOAT_LAMPS[k], k === 'ship' ? 0.6 : k === 'passenger' ? 0.25 : 0.4)])) as Record<Boat['kind'], THREE.BufferGeometry>
    for (const im of this.instanced()) {
      im.count = 0
      im.frustumCulled = false
      im.castShadow = im !== this.smoke
      this.group.add(im)
    }
    for (const bm of this.bodies) bm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PEOPLE * 3), 3)
  }

  /** 本系统拥有的全部实例网格（构造登记、释放共用这一份） */
  private instanced(): THREE.InstancedMesh[] {
    return [...this.bodies, ...this.heads, this.legs, this.carts, ...this.animalMeshes, this.smoke, this.birdBody, this.birdWing]
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
    this.stepAnimals(near ? dt : 0, time, near, night)
    this.stepSmoke(dt, near, night, daylight)
    this.stepBirds(dt, time, near && night < 0.5)
    this.stepBoats(dt, time)
    /* 船灯：入夜亮起（灯芯超出 1 的亮度交给泛光晕开），白天熄掉不画 */
    const lit = night > 0.05
    this.lampCore.visible = lit
    this.lampHalo.visible = lit
    if (lit) {
      this.lampCore.color.set(NightTokens.lanternGlow).multiplyScalar(0.4 + 2.2 * night)
      this.lampHalo.opacity = 0.22 * night
    }
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
    this.animals = []
    this.pasture = new Set()
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
    const prof = lifeProfileOf(lm, paved.length)
    const busy = (lm.def.major ? 1.6 : 1) * (lm.def.walls ? 1.5 : 1) * prof.people
    const n = Math.min(MAX_PEOPLE - 20, Math.round(Math.min(cells.length / 18, 50) * busy))
    /* 人群构成按地标的市井配置；渔夫只在水边 */
    const town = prof.town
    const mix = norm(prof.mix) as [FigureKind, number][]
    const nearWater = (x: number, z: number) => {
      for (let dz = -4; dz <= 4; dz += 2)
        for (let dx = -4; dx <= 4; dx += 2) {
          const c = t.column(x + dx, z + dz)
          if (c.waterY >= 0 && c.waterY >= c.height) return true
        }
      return false
    }
    for (let i = 0; i < n && cells.length; i++) {
      const [x, z] = this.rnd.pick(cells)
      let u = this.rnd.next()
      let kind: FigureKind = 'farmer'
      for (const [k, wgt] of mix) {
        if (u < wgt) {
          kind = k
          break
        }
        u -= wgt
      }
      if (kind === 'fisher' && !nearWater(x, z)) kind = town ? 'merchant' : 'farmer'
      this.walkers.push(this.walker(x + 0.5, z + 0.5, false, kind))
    }
    this.populateAnimals(lm, open, prof)
    /* 摊贩与看货的人；有炊烟的屋 */
    for (const p of lm.placements) {
      const id = p.id
      if (id.includes('-stall-') && this.walkers.length < MAX_PEOPLE - 1) {
        const v = this.walker(p.x + 0.5, p.z - 1.5, true, 'merchant')
        v.a = Math.PI / 2
        this.walkers.push(v)
        if (this.rnd.chance(0.6)) {
          const c = this.walker(p.x + this.rnd.range(-0.8, 0.8), p.z + 2.6, true, this.rnd.pick(['maiden', 'scholar', 'elder', 'child'] as FigureKind[]))
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

  private walker(x: number, z: number, still: boolean, kind: FigureKind): Walker {
    const t = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    return {
      x,
      z,
      y: Math.floor(t.height) + 1,
      a: this.rnd.range(0, Math.PI * 2),
      tx: x,
      tz: z,
      dir: this.rnd.int(0, 3),
      speed: this.rnd.range(0.9, 1.6) * FIGURE_PACE[kind],
      phase: this.rnd.range(0, 6.28),
      robe: new THREE.Color(this.rnd.pick(ROBES[kind] as string[])),
      kind: KIND[kind],
      still,
    }
  }

  /* ———— 行人 ———— */

  private stepWalkers(dt: number, time: number, near: boolean, night: number): void {
    const counts = FIGURE_KINDS.map(() => 0)
    let n = 0
    let carts = 0
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
        const kind = FIGURE_KINDS[w.kind]
        const sc = FIGURE_SCALE[kind]
        // 老人微微前倾
        this.q.setFromEuler(this.e.set(0, -w.a, kind === 'elder' ? -0.12 : 0, 'YXZ'))
        this.m.compose(this.v.set(w.x, w.y + bob * sc, w.z), this.q, this.s.setScalar(sc))
        const ci = counts[w.kind]++
        this.bodies[w.kind].setMatrixAt(ci, this.m)
        this.bodies[w.kind].setColorAt(ci, w.robe)
        this.heads[w.kind].setMatrixAt(ci, this.m)
        if (kind === 'carter') {
          this.q.setFromEuler(this.e.set(0, -w.a, 0))
          this.m.compose(this.v.set(w.x, w.y, w.z), this.q, this.s.set(1, 1, 1))
          this.carts.setMatrixAt(carts++, this.m)
        }
        for (const side of [-1, 1]) {
          // 髋部在身体左右各 0.12 格：先按朝向转过去，再绕横轴前后摆
          this.q.setFromEuler(this.e.set(0, -w.a, 0))
          this.v.set(0, 0, side * 0.12 * sc).applyQuaternion(this.q)
          this.v.x += w.x
          this.v.y = w.y + (0.66 + bob) * sc
          this.v.z += w.z
          this.q.setFromEuler(this.e.set(0, -w.a, swing * side, 'YXZ'))
          this.m.compose(this.v, this.q, this.s.setScalar(sc))
          this.legs.setMatrixAt(n * 2 + (side > 0 ? 1 : 0), this.m)
        }
        n++
      }
    }
    this.legs.count = n * 2
    this.carts.count = carts
    this.carts.instanceMatrix.needsUpdate = true
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

  /* ———— 牲畜 ———— */

  /**
   * 牲畜：放在地标范围里的空地上（不上铺地的街），按地方配种类——北方草原多羊、马，北方农区牛马猪鸡，
   * 南方水乡水牛、猪、鸡；鸡三五成群挨着人家。城池里少放
   */
  private populateAnimals(lm: ResolvedLandmark, open: [number, number][], prof: ResolvedLife): void {
    if (open.length < 40) return
    this.pasture = new Set(open.map(([x, z]) => x * 65536 + z))
    let mix: [AnimalKind, number][]
    if (prof.animals) mix = norm(prof.animals) as [AnimalKind, number][]
    else {
      const s = this.ctx.terrain.sample(lm.x, lm.z)
      const lat = this.P.unproject(lm.x, lm.z).lat
      const steppe = s.biome === BiomeId.Steppe || s.biome === BiomeId.Plateau || s.biome === BiomeId.Gobi || s.biome === BiomeId.Desert
      mix = steppe
        ? [['sheep', 0.55], ['horse', 0.3], ['cattle', 0.15]]
        : lat > 33
          ? [['cattle', 0.25], ['horse', 0.2], ['sheep', 0.15], ['pig', 0.15], ['chicken', 0.25]]
          : [['buffalo', 0.35], ['pig', 0.25], ['chicken', 0.35], ['horse', 0.05]]
    }
    if (!mix.length) return
    const n = Math.min(MAX_ANIMALS - 8, Math.round(Math.min(open.length / 60, 18) * (lm.def.walls?.length ? 0.5 : 1) * prof.animalDensity))
    for (let i = 0; i < n; i++) {
      let u = this.rnd.next()
      let kind: AnimalKind = mix[0][0]
      for (const [k, wgt] of mix) {
        if (u < wgt) {
          kind = k
          break
        }
        u -= wgt
      }
      const [x, z] = this.rnd.pick(open)
      const m = MARGIN[kind]
      if (!standable(this.pasture, x, z, m)) continue
      // 羊、鸡成群：同一处放几只；偏开的位置要能站、且从群中心直线走得到，不行就落在群中心格里
      const flock = kind === 'sheep' ? 3 : kind === 'chicken' ? 3 : 1
      for (let j = 0; j < flock && this.animals.length < MAX_ANIMALS - 1; j++) {
        let ax = x + 0.5 + this.rnd.range(-1.5, 1.5)
        let az = z + 0.5 + this.rnd.range(-1.5, 1.5)
        if (!standable(this.pasture, ax, az, m) || !segmentClear(this.pasture, x + 0.5, z + 0.5, ax, az, m)) {
          ax = x + 0.5
          az = z + 0.5
        }
        this.animals.push(this.animal(AKIND[kind], ax, az))
      }
    }
  }

  private animal(kind: number, x: number, z: number): Animal {
    const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    const k = ANIMAL_KINDS[kind]
    return {
      kind,
      x,
      z,
      y: Math.floor(c.height) + 1,
      a: this.rnd.range(0, Math.PI * 2),
      tx: x,
      tz: z,
      speed: k === 'chicken' ? 0.8 : k === 'horse' ? 0.7 : 0.35,
      graze: this.rnd.range(0, 6),
      phase: this.rnd.range(0, 6.28),
    }
  }

  private stepAnimals(dt: number, time: number, near: boolean, night: number): void {
    const counts = ANIMAL_KINDS.map(() => 0)
    const resting = night >= 0.6
    if (near)
      for (const an of this.animals) {
        // 夜里歇着：不走、也不播走路的起伏（只是停下 wander，身子却照样一颠一颠）
        if (!resting) this.wander(an, dt)
        const moving = !resting && an.graze <= 0
        const bob = moving ? Math.abs(Math.sin(time * 6 + an.phase)) * 0.04 : 0
        // 吃草时低头（整体前俯一点），鸡啄食点头更快
        const peck = resting ? 0 : !moving ? (ANIMAL_KINDS[an.kind] === 'chicken' ? Math.max(0, Math.sin(time * 5 + an.phase)) * 0.5 : 0.08) : 0
        this.q.setFromEuler(this.e.set(0, -an.a, -peck, 'YXZ'))
        this.m.compose(this.v.set(an.x, an.y + bob, an.z), this.q, this.s.set(1, 1, 1))
        this.animalMeshes[an.kind].setMatrixAt(counts[an.kind]++, this.m)
      }
    this.animalMeshes.forEach((im, i) => {
      im.count = counts[i]
      im.instanceMatrix.needsUpdate = true
    })
  }

  private wander(an: Animal, dt: number): void {
    if (an.graze > 0) {
      an.graze -= dt
      if (an.graze <= 0) {
        // 吃完一口，往附近挪几格：目标能站、整段直线沿途也都能站、不跨陡坎（两头合法、中间夹着水塘墙角的不走）
        const m = MARGIN[ANIMAL_KINDS[an.kind]]
        const h = (x: number, z: number) => Math.floor(this.ctx.terrain.column(x, z).height)
        for (let k = 0; k < 8; k++) {
          const tx = Math.floor(an.x + this.rnd.range(-4, 4)) + 0.5
          const tz = Math.floor(an.z + this.rnd.range(-4, 4)) + 0.5
          if (standable(this.pasture, tx, tz, m) && segmentClear(this.pasture, an.x, an.z, tx, tz, m, h)) {
            an.tx = tx
            an.tz = tz
            break
          }
        }
      }
      return
    }
    const dx = an.tx - an.x
    const dz = an.tz - an.z
    const d = Math.hypot(dx, dz)
    if (d < 0.08) {
      an.graze = this.rnd.range(3, 9)
      const c = this.ctx.terrain.column(Math.floor(an.x), Math.floor(an.z))
      an.y = Math.floor(c.height) + 1
      return
    }
    const step = Math.min(d, an.speed * dt)
    an.x += (dx / d) * step
    an.z += (dz / d) * step
    const c = this.ctx.terrain.column(Math.floor(an.x), Math.floor(an.z))
    an.y += (Math.floor(c.height) + 1 - an.y) * Math.min(1, dt * 6)
    const target = Math.atan2(dz, dx)
    let da = target - an.a
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    an.a += da * Math.min(1, dt * 4)
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
    const core = new THREE.Mesh(this.lampCoreGeo[kind], this.lampCore)
    const halo = new THREE.Mesh(this.lampHaloGeo[kind], this.lampHalo)
    halo.renderOrder = 2
    mesh.add(core, halo)
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
          // 窄河渠（宽不到 3 格，苏州水巷）只走小渔舟：漕船、客船船身宽，会擦进岸墙、钻进石拱桥
          const kind: Boat['kind'] = op.w < 3 ? 'fishing' : i % 3 === 2 ? 'cargo' : i % 2 ? 'fishing' : 'passenger'
          this.addBoat(kind, { river: -1, s: rnd.range(0, len), dir: rnd.chance(0.5) ? 1 : -1, lane: 0, x: path[0][0], z: path[0][1], y: lm.level + 1, a: 0, speed: rnd.range(0.8, 1.4) })
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
        const a0 = rnd.range(0, 6.28)
        if (!this.hullClear(kind, x, z, a0)) continue
        const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
        this.addBoat(kind, { river: -1, s: 0, dir: 1, lane: 0, x, z, y: y ?? c.waterY + 1, a: a0, speed: kind === 'fishing' ? rnd.range(0.3, 0.7) : 0.9 })
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
      // 围墙里的园林池（苏州园林）是看的水，不行船
      if (lm.def.structures.some((st) => st.b === 'gardenWall')) continue
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
        const ax = nx + Math.cos(b.a) * ahead
        const az = nz + Math.sin(b.a) * ahead
        // 湖上的船不贴着建筑走（园墙、水榭、码头）：船头前方与左右两舷都不能落进建筑占地
        const clear = (x: number, z: number) => !this.ctx.landmarks.occupancy.has(Math.floor(x), Math.floor(z), Occupancy.Building | Occupancy.Buffer)
        const side = b.kind === 'passenger' || b.kind === 'cargo' ? 2.5 : 1.5
        const sea = b.kind === 'ship' || b.kind === 'seaFisher'
        const okAhead = sea
          ? this.deepSea(ax, az)
          : this.lakeAt(ax, az) && clear(ax, az) && clear(ax - Math.sin(b.a) * side, az + Math.cos(b.a) * side) && clear(ax + Math.sin(b.a) * side, az - Math.cos(b.a) * side) && this.hullClear(b.kind, nx, nz, b.a)
        if (okAhead) {
          b.x = nx
          b.z = nz
        } else {
          // 掉头：转过去之后整条船身仍在水里、不碰墙才转（原地打转会把船尾甩进园墙、岸上）；转不动就往回倒一点
          const na = b.a + (b.kind === 'ship' ? 0.6 : 1.0) * dt * 4
          if (sea || this.hullClear(b.kind, b.x, b.z, na)) b.a = na
          else {
            const bx = b.x - Math.cos(b.a) * b.speed * dt
            const bz = b.z - Math.sin(b.a) * b.speed * dt
            if (this.hullClear(b.kind, bx, bz, b.a)) {
              b.x = bx
              b.z = bz
            }
            const nb = b.a - (na - b.a)
            if (this.hullClear(b.kind, b.x, b.z, na)) b.a = na
            else if (this.hullClear(b.kind, b.x, b.z, nb)) b.a = nb // 一侧转不动就往另一侧转
          }
        }
        if (b.kind === 'fishing') {
          const na = b.a + Math.sin(time * 0.2 + b.phase) * dt * 0.2
          if (this.hullClear(b.kind, b.x, b.z, na)) b.a = na
        }
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

  /**
   * 整条船身（船头、船腰、船尾，各带两舷）都在湖、塘水面上，也不压进建筑占地（园墙、水榭、码头）。
   * 船身半长、半宽按船型：渔舟 2.6×0.8，客船、漕船 4×1.3
   */
  hullClear(kind: Boat['kind'], x: number, z: number, a: number): boolean {
    const big = kind === 'passenger' || kind === 'cargo'
    const L = big ? 4 : 2.6
    const W = big ? 1.3 : 0.8
    const cx = Math.cos(a)
    const sz = Math.sin(a)
    const occ = this.ctx.landmarks.occupancy
    for (const u of [-L, -L / 2, 0, L / 2, L])
      for (const v of [-W, 0, W]) {
        const px = x + cx * u - sz * v
        const pz = z + sz * u + cx * v
        if (!this.lakeAt(px, pz)) return false
        if (occ.has(Math.floor(px), Math.floor(pz), Occupancy.Building)) return false
      }
    return true
  }

  private lakeAt(x: number, z: number): boolean {
    const c = this.ctx.terrain.column(Math.floor(x), Math.floor(z))
    return (c.waterKind === WaterKind.Lake || c.waterKind === WaterKind.Pond) && c.waterY >= c.height + 1
  }

  dispose(): void {
    this.clearBoats()
    for (const g of [...Object.values(this.boatGeo), ...Object.values(this.lampCoreGeo), ...Object.values(this.lampHaloGeo)]) g.dispose()
    this.lampCore.dispose()
    this.lampHalo.dispose()
    // 与构造时 group 里加入的实例网格同一份清单：新增的独轮车、牲畜不会漏
    for (const im of this.instanced()) {
      im.geometry.dispose()
      im.dispose()
    }
    this.mat.dispose()
    this.smokeMat.dispose()
  }
}
