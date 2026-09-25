import { hashString, Random } from '../../utils/math'
import type { LandmarkDefinition, PlaceAnchor, StructureSpec } from './LandmarkDefinition'

/** 名楼、名城的专属造型（其余地点按诗作多少分级） */
const FAMOUS: Record<string, (r: Random) => Pick<LandmarkDefinition, 'structures' | 'terrainModifier' | 'walls' | 'radius'>> = {
  黄鹤楼: () => ({
    radius: 30,
    terrainModifier: [{ t: 'hill', x: 0, z: 0, r: 22, h: 8 }, { t: 'flatten', x: 0, z: 0, r: 12, dy: 8 }],
    structures: [{ b: 'tower', x: 0, z: 0, p: { levels: 5, width: 11, tile: 'yellow', lanterns: true } }, { b: 'pavilion', x: -16, z: 12 }, { b: 'pavilion', x: 16, z: 12 }],
  }),
  岳阳楼: () => ({
    radius: 28,
    terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 16 }],
    structures: [{ b: 'tower', x: 0, z: 0, rot: 1, p: { levels: 3, width: 11, tile: 'green', lanterns: true } }, { b: 'pavilion', x: 0, z: -16 }, { b: 'house', x: 14, z: 10 }, { b: 'house', x: 14, z: -4 }],
  }),
  滕王阁: () => ({
    radius: 26,
    terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 14 }],
    structures: [{ b: 'tower', x: 0, z: 0, p: { levels: 3, width: 13, tile: 'green', lanterns: true } }],
  }),
  白帝城: () => ({
    radius: 26,
    terrainModifier: [{ t: 'hill', x: 0, z: 0, r: 20, h: 12 }, { t: 'flatten', x: 0, z: 0, r: 9, dy: 12 }],
    structures: [{ b: 'hall', x: 0, z: -2, p: { width: 11, depth: 7, lanterns: true } }, { b: 'pavilion', x: 0, z: 10 }],
  }),
  苏州: (r) => waterTown(r, 'pagoda'),
  扬州: (r) => waterTown(r, 'stupa'),
  山阴: (r) => waterTown(r, 'pavilion'),
  枫桥: () => ({
    radius: 26,
    terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 18 }, { t: 'canal', pts: [[-26, 8], [26, 6]], w: 2.5 }],
    structures: [
      { b: 'hall', x: 0, z: -8, p: { width: 11, depth: 7, lanterns: true } },
      { b: 'pagoda', x: 14, z: -10, p: { levels: 5, width: 5 } },
      { b: 'bridge', x: -8, z: 7, rot: 1, atLevel: true, p: { length: 9 } },
    ],
  }),
  成都: () => ({
    radius: 40,
    terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 34, square: true }, { t: 'pave', x0: -1, z0: -20, x1: 1, z1: 20 }],
    walls: [{ x: 0, z: -4, hw: 20, hd: 16, height: 6, gates: ['s', 'n'] }],
    structures: [
      { b: 'hall', x: 0, z: -10, p: { width: 13, depth: 7, lanterns: true } },
      ...[-12, 12].flatMap((x) => [-2, 6].map((z) => ({ b: 'house' as const, x, z, p: { seed: x * 7 + z } }))),
      { b: 'hut', x: 28, z: 24 },
    ],
  }),
  洛阳: () => capital(30, 'yellow'),
  汴京: () => capital(28, 'yellow'),
  金陵: () => capital(28, 'gray'),
  彭城: () => capital(20, 'gray'),
}

type Body = Pick<LandmarkDefinition, 'structures' | 'terrainModifier' | 'walls' | 'radius' | 'trees' | 'levelMode'>

/**
 * 按地名的类别营造（没有手工样板的楼、阁、台、亭、寺）：
 *  - 楼：高台上二层楼阁，旁有小亭；
 *  - 阁：高台上攒尖二层阁，连一段游廊；
 *  - 台：砖石高台，台上重檐亭（郁孤台、凤凰台一类）；
 *  - 亭：重檐亭，竹松环绕；
 *  - 寺：山门牌坊、大殿、塔。
 */
function byName(name: string, r: Random): Body | null {
  if (/楼$/.test(name))
    return {
      radius: 24,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 14, blend: 6 }],
      structures: [
        { b: 'grandTower', x: 0, z: 0, p: { levels: 2, width: 9, tile: r.pick(['gray', 'green'] as const), terrace: 3 } },
        { b: 'pavilion', x: 14, z: 8, p: { width: 5 } },
      ],
      trees: [{ type: 'willow', variant: 0, pts: [[-14, 10], [-14, -10]], n: 2 }],
    }
  if (/阁$/.test(name))
    return {
      radius: 24,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 14, blend: 6 }],
      structures: [
        { b: 'grandTower', x: 0, z: -2, p: { levels: 2, width: 7, tile: 'green', top: 'cuanjian', terrace: 3 } },
        { b: 'corridor', x: 0, z: 12, p: { length: 11 } },
      ],
      trees: [{ type: 'pine', variant: 2, pts: [[-14, -8], [14, -8]], n: 2 }],
    }
  if (/台$/.test(name))
    return {
      radius: 20,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 11, blend: 6 }],
      structures: [
        { b: 'terrace', x: 0, z: 0, p: { width: 11, depth: 11, height: 4 } },
        { b: 'pavilion', x: 0, z: -1, dy: 4, p: { width: 5, double: true } },
      ],
      trees: [{ type: 'pine', variant: 2, pts: [[-10, 9], [10, 9]], n: 2 }],
    }
  if (/亭$/.test(name))
    return {
      radius: 16,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 7, blend: 6 }],
      structures: [{ b: 'pavilion', x: 0, z: 0, p: { width: 5, double: true, lanterns: true } }],
      trees: [
        { type: 'bamboo', pts: [[-8, -6], [-8, 6]], n: 2 },
        { type: 'pine', variant: 2, pts: [[8, -6], [8, 6]], n: 2 },
      ],
    }
  if (/寺$/.test(name))
    return {
      radius: 26,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 16, blend: 6 }, { t: 'pave', x0: -1, z0: -2, x1: 1, z1: 16 }],
      structures: [
        { b: 'archway', x: 0, z: 14, p: { tile: 'gray' } },
        { b: 'hall', x: 0, z: -4, p: { width: 11, depth: 7, tile: 'gray', terrace: 2, lanterns: true } },
        { b: 'pagoda', x: 12, z: 6, p: { levels: 5, width: 5 } },
        { b: 'bellTower', x: -12, z: 6, p: { width: 7 } },
      ],
      trees: [{ type: 'pine', variant: 0, pts: [[-16, -10], [16, -10]], n: 3 }],
    }
  return null
}

/** 大街两侧的街灯 */
const lamps = (z0: number, z1: number): StructureSpec[] => {
  const out: StructureSpec[] = []
  for (let z = z0; z <= z1; z += 8) out.push({ b: 'lamp', x: -4, z, rot: 2 }, { b: 'lamp', x: 4, z })
  return out
}

function capital(hw: number, tile: 'yellow' | 'gray'): Pick<LandmarkDefinition, 'structures' | 'terrainModifier' | 'walls' | 'radius'> {
  const hd = Math.round(hw * 0.8)
  const houses: StructureSpec[] = []
  for (let x = -hw + 8; x <= hw - 8; x += 9) for (let z = 4; z <= hd - 7; z += 8) if (Math.abs(x) > 5) houses.push({ b: 'house', x, z, p: { seed: x * 13 + z } })
  return {
    radius: hw + 16,
    terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: hw + 6, square: true, blend: 10 }, { t: 'pave', x0: -2, z0: -hd, x1: 2, z1: hd + 8 }],
    walls: [{ x: 0, z: 0, hw, hd, height: 7, gates: ['n', 's', 'e', 'w'] }],
    structures: [{ b: 'hall', x: 0, z: -Math.round(hd * 0.5), p: { width: 15, depth: 9, double: true, tile, lanterns: true, terrace: 2 } }, ...houses, ...lamps(-hd + 6, hd + 6)],
  }
}

function waterTown(r: Random, feature: 'pagoda' | 'stupa' | 'pavilion'): Pick<LandmarkDefinition, 'structures' | 'terrainModifier' | 'radius'> {
  const houses: StructureSpec[] = []
  for (const x of [-18, -9, 9, 18]) for (const z of [-12, 12]) houses.push({ b: 'house', x, z, rot: z < 0 ? 0 : 2, p: { seed: x * 3 + z, lanterns: r.chance(0.4) } })
  return {
    radius: 34,
    terrainModifier: [
      { t: 'flatten', x: 0, z: 0, r: 26 },
      { t: 'canal', pts: [[-34, 0], [34, 1]], w: 2.5 },
      { t: 'canal', pts: [[3, -30], [2, 30]], w: 2 },
    ],
    structures: [
      ...houses,
      { b: 'bridge', x: -4, z: 0, rot: 1, atLevel: true, p: { length: 9 } },
      { b: 'bridge', x: 2, z: 14, rot: 0, atLevel: true, p: { length: 9 } },
      feature === 'pagoda' ? { b: 'pagoda', x: -24, z: -22, p: { levels: 7, width: 5 } } : feature === 'stupa' ? { b: 'stupa', x: -22, z: -20 } : { b: 'pavilion', x: -22, z: -20 },
      { b: 'pavilion', x: 22, z: -22, p: { lanterns: true } },
    ],
  }
}

/**
 * 为没有手工营造的诗词地点生成小型聚落：诗越多，聚落越大（茅舍 / 亭 → 小村 → 村镇 → 城池）。
 * 距已有地标太近的地点不再另建。
 */
export function planSettlements(anchors: readonly PlaceAnchor[], handmade: readonly LandmarkDefinition[], project: (lng: number, lat: number) => { x: number; z: number }): LandmarkDefinition[] {
  const taken: { x: number; z: number; r: number }[] = handmade.map((d) => {
    const p = project(d.coordinate.lng, d.coordinate.lat)
    return { x: p.x + (d.offset?.[0] ?? 0), z: p.z + (d.offset?.[1] ?? 0), r: d.radius }
  })
  const handIds = new Set(handmade.map((d) => d.poetryPlaceId))
  const out: LandmarkDefinition[] = []
  const sorted = [...anchors].filter((a) => !handIds.has(a.id)).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))
  for (const a of sorted) {
    const p = project(a.lng, a.lat)
    const r = new Random(hashString(a.id))
    const famousKey = Object.keys(FAMOUS).find((k) => a.name.includes(k))
    // 以山为名的地点（华山、终南山、嵩山……）：不平整山体，只在山头设一亭
    const mountain = !famousKey && /[山峰岭顶]$/.test(a.name) && !/[州城县镇]/.test(a.name)
    const named = famousKey ? null : byName(a.name, r)
    const body = famousKey ? FAMOUS[famousKey](r) : named ? named : mountain ? { radius: 14, levelMode: 'summit' as const, terrainModifier: [{ t: 'raise' as const, r: 4, blend: 4 }], structures: [{ b: 'pavilion' as const, x: 0, z: 0, atLevel: true, p: { double: true } }] } : generic(a.weight, r)
    if (taken.some((t) => Math.hypot(t.x - p.x, t.z - p.z) < Math.max(14, (t.r + body.radius) * 0.55))) continue
    taken.push({ x: p.x, z: p.z, r: body.radius })
    out.push({
      id: `place-${a.id}`,
      name: a.name,
      coordinate: { lng: a.lng, lat: a.lat },
      poetryPlaceId: a.id,
      major: !!famousKey || a.weight >= 6,
      cameraPreset: { yaw: r.range(-1, 1), pitch: 0.55, distance: Math.max(60, body.radius * 2.4) },
      ...body,
    })
  }
  return out
}

function generic(weight: number, r: Random): Pick<LandmarkDefinition, 'structures' | 'terrainModifier' | 'radius'> {
  if (weight <= 1) {
    const b = r.pick(['hut', 'pavilion', 'house'] as const)
    return { radius: 12, terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 6, blend: 6 }], structures: [{ b, x: 0, z: 0, rot: r.int(0, 3) }] }
  }
  if (weight <= 3) {
    return {
      radius: 18,
      terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 11, blend: 7 }],
      structures: [
        { b: 'house', x: -5, z: -3, p: { seed: r.int(0, 99) } },
        { b: 'house', x: 6, z: 2, rot: r.int(0, 3), p: { seed: r.int(0, 99) } },
        { b: r.pick(['pavilion', 'hut'] as const), x: -3, z: 9 },
      ],
    }
  }
  const s: StructureSpec[] = [{ b: 'hall', x: 0, z: -9, p: { width: 11, depth: 7, lanterns: true, terrace: 1 } }]
  for (const [x, z] of [
    [-12, 4],
    [12, 4],
    [-12, 13],
    [12, 13],
    [0, 16],
  ])
    s.push({ b: 'house', x, z, rot: x < 0 ? 3 : x > 0 ? 1 : 0, p: { seed: x * 5 + z } })
  if (r.chance(0.5)) s.push({ b: 'pagoda', x: 16, z: -12, p: { levels: 5, width: 5 } })
  else s.push({ b: 'pavilion', x: 16, z: -12 })
  return { radius: 28, terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 20, blend: 8 }, { t: 'pave', x0: -1, z0: -3, x1: 1, z1: 20 }], structures: s }
}
