import { hash3i, hashUnit, Random } from '../../utils/math'
import { B } from '../block/Blocks'
import { type PackedState, S, packState } from '../block/BlockState'
import { Axis } from '../block/Direction'
import { pruneFloating } from '../structure/StructureAnalysis'
import { StructureBuilder } from '../structure/StructureBuilder'
import type { VoxelStructure } from '../structure/VoxelStructure'
import type { TreeParams } from './TreeDefinition'

/*
 * 五类植物一律由下至上生成：树根 → 主干 → 一级 / 二级枝 → 冠层团簇 → 叶片或花簇。
 * 枝条是面相贴的连续原木，叶团都以枝端为中心，最后删去任何不与地面相连的方块。
 */

type P3 = [number, number, number]

const log = (id: number, axis: number): PackedState => packState({ id, axis: axis as 0 | 1 | 2 })

/** 面相贴的原木枝：每一步沿当前最远的轴走一格，原木轴向跟随走向 */
function branch(b: StructureBuilder, a: P3, c: P3, id: number = B.LOG): void {
  let [x, y, z] = a
  let guard = 0
  b.set(x, y, z, log(id, Axis.Y))
  while ((x !== c[0] || y !== c[1] || z !== c[2]) && guard++ < 64) {
    const dx = c[0] - x
    const dy = c[1] - y
    const dz = c[2] - z
    let axis: number
    if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) >= Math.abs(dz)) {
      x += Math.sign(dx)
      axis = Axis.X
    } else if (Math.abs(dy) >= Math.abs(dz)) {
      y += Math.sign(dy)
      axis = Axis.Y
    } else {
      z += Math.sign(dz)
      axis = Axis.Z
    }
    if (!b.s.has(x, y, z)) b.set(x, y, z, log(id, axis))
  }
}

/** 带毛边的叶团：外圈按哈希随机缺块，轮廓不死板 */
function crown(b: StructureBuilder, c: P3, rx: number, ry: number, rz: number, leaf: PackedState, seed: number, fill = 0.72, keep = 0.62): void {
  b.blob(c[0], c[1], c[2], rx, ry, rz, leaf, (x, y, z, d) => d < fill || hashUnit(hash3i(x, y, z, seed)) < keep)
}

const polar = (angle: number, len: number): [number, number] => [Math.round(Math.cos(angle) * len), Math.round(Math.sin(angle) * len)]

function roots(b: StructureBuilder, r: Random, id: number, n: number): void {
  const dirs: [number, number, number][] = [
    [1, 0, Axis.X],
    [-1, 0, Axis.X],
    [0, 1, Axis.Z],
    [0, -1, Axis.Z],
  ]
  r.shuffle(dirs)
  for (let i = 0; i < n; i++) b.set(dirs[i][0], 0, dirs[i][1], log(id, dirs[i][2]))
}

/* ================= 阔叶 ================= */

export const BROADLEAF_VARIANTS = [
  { name: '成熟圆冠', trunk: 0.44, rw: 0.34, branches: [3, 5] },
  { name: '宽伞冠', trunk: 0.5, rw: 0.46, branches: [4, 5] },
  { name: '高卵形', trunk: 0.38, rw: 0.24, branches: [3, 4] },
  { name: '偏冠', trunk: 0.46, rw: 0.32, branches: [3, 4] },
  { name: '庭院小树', trunk: 0.42, rw: 0.36, branches: [3, 3] },
] as const

export function broadleaf({ variant, seed, height }: TreeParams): VoxelStructure {
  const v = BROADLEAF_VARIANTS[variant % BROADLEAF_VARIANTS.length]
  const r = new Random(seed)
  const b = new StructureBuilder('broadleaf')
  const H = Math.round(height)
  const trunkH = Math.max(2, Math.round(H * v.trunk))
  const leaf = S(B.LEAVES_BROAD)
  const lean = v.name === '偏冠' ? r.sign() : 0
  if (H >= 10) roots(b, r, B.LOG, r.int(2, 3))

  /* 主干：偏冠在中段横移一格 */
  const bend = Math.round(trunkH * 0.6)
  branch(b, [0, 0, 0], [0, bend, 0])
  branch(b, [0, bend, 0], [lean, bend, 0])
  const ry = Math.max(1.8, (H - trunkH) / 1.75)
  const rx = Math.max(2, H * v.rw)
  const cy = trunkH + Math.round(ry * 0.7)
  branch(b, [lean, bend, 0], [lean, cy, 0])

  /* 一级枝：3–5 条向不同方向与高度伸出 */
  const n = r.int(v.branches[0], v.branches[1])
  const tips: P3[] = []
  const a0 = r.range(0, Math.PI * 2)
  for (let i = 0; i < n; i++) {
    const ang = a0 + (i * Math.PI * 2) / n + r.range(-0.45, 0.45)
    const sy = Math.round(trunkH * r.range(0.72, 1.0))
    const len = rx * r.range(0.55, 0.85) + (lean && Math.cos(ang) * lean > 0 ? 1.5 : 0)
    const [dx, dz] = polar(ang, len)
    const tip: P3 = [lean + dx, sy + Math.round(r.range(1.5, 3.2)), dz]
    branch(b, [lean, sy, 0], tip)
    tips.push(tip)
  }

  /* 主冠体量 + 枝端错位侧冠 + 偏心顶冠 */
  crown(b, [lean, cy, 0], rx, ry, rx * r.range(0.85, 1.05), leaf, seed)
  for (const t of tips) crown(b, [t[0], t[1] + 1, t[2]], rx * r.range(0.45, 0.6), ry * r.range(0.5, 0.65), rx * r.range(0.45, 0.6), leaf, seed + 1, 0.6, 0.7)
  const top: P3 = [lean + r.int(-1, 1), Math.round(cy + ry * 0.75), r.int(-1, 1)]
  crown(b, top, rx * 0.42, ry * 0.5, rx * 0.42, leaf, seed + 2, 0.6, 0.55)
  return pruneFloating(b.build())
}

/* ================= 松 ================= */

export const PINE_VARIANTS = [{ name: '直立山松' }, { name: '矮壮山松' }, { name: '横枝景观松' }] as const

export function pine({ variant, seed, height }: TreeParams): VoxelStructure {
  if (variant % 3 === 2) return landscapePine(seed, height)
  const stout = variant % 3 === 1
  const r = new Random(seed)
  const b = new StructureBuilder('pine')
  const H = Math.round(stout ? height * 0.72 : height)
  const needle = S(B.LEAVES_PINE)
  if (H >= 9) roots(b, r, B.PINE_LOG, stout ? 4 : 2)
  branch(b, [0, 0, 0], [0, H - 2, 0], B.PINE_LOG)

  /* 枝层：自下而上收窄，每层水平错位；层间留缝露出树干 */
  const y0 = Math.round(H * (stout ? 0.28 : 0.34))
  const R0 = H * (stout ? 0.44 : 0.3)
  let y = y0
  let layer = 0
  while (y <= H - 2) {
    const t = (y - y0) / Math.max(1, H - 2 - y0)
    const rad = Math.max(1.1, R0 * (1 - t * 0.82))
    const ox = rad > 2.2 ? r.int(-1, 1) : 0
    const oz = rad > 2.2 ? r.int(-1, 1) : 0
    const rx = rad * r.range(0.85, 1.15)
    const rz = rad * r.range(0.85, 1.15)
    /* 枝：几条短原木伸进枝层 */
    const nb = rad > 2 ? r.int(2, 4) : 0
    for (let i = 0; i < nb; i++) {
      const [dx, dz] = polar(r.range(0, Math.PI * 2), rad * 0.7)
      branch(b, [0, y, 0], [ox + dx, y, oz + dz], B.PINE_LOG)
    }
    if (ox || oz) branch(b, [0, y, 0], [ox, y, oz], B.PINE_LOG)
    b.blob(ox, y, oz, rx, 0.9, rz, needle, (x, _y, z, d) => d < 0.7 || hashUnit(hash3i(x, y, z, seed)) < 0.6)
    if (rad > 1.6) b.blob(ox, y + 1, oz, rx * 0.62, 0.9, rz * 0.62, needle, (x, yy, z, d) => d < 0.6 || hashUnit(hash3i(x, yy, z, seed + 7)) < 0.5)
    /* 少量外伸长枝 */
    if (!stout && layer === 1 && r.chance(0.6)) {
      const ang = r.range(0, Math.PI * 2)
      const [dx, dz] = polar(ang, rad + 1.5)
      branch(b, [0, y, 0], [dx, y + 1, dz], B.PINE_LOG)
      b.blob(dx, y + 1, dz, 1.6, 0.8, 1.6, needle)
    }
    y += stout ? 2 : r.int(2, 3)
    layer++
  }
  /* 树梢 */
  b.set(0, H - 1, 0, needle)
  b.set(0, H, 0, needle)
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    b.setIfEmpty(dx, H - 1, dz, needle)
  return pruneFloating(b.build())
}

/** 横枝景观松：弯干、少而长的横枝，枝端是一片片平展的针叶云 */
function landscapePine(seed: number, height: number): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('landscape-pine')
  const H = Math.round(height * 0.9)
  const needle = S(B.LEAVES_PINE)
  roots(b, r, B.PINE_LOG, 3)
  const side = r.range(0, Math.PI * 2)
  const [lx, lz] = polar(side, 1)
  const mid = Math.round(H * 0.45)
  branch(b, [0, 0, 0], [0, mid, 0], B.PINE_LOG)
  branch(b, [0, mid, 0], [lx, mid + 1, lz], B.PINE_LOG)
  branch(b, [lx, mid + 1, lz], [lx, H - 2, lz], B.PINE_LOG)
  const pads = r.int(3, 4)
  for (let i = 0; i < pads; i++) {
    const y = Math.round(H * (0.42 + i * 0.16))
    const main = i === 0 || r.chance(0.5)
    const ang = side + (main ? 0 : r.range(1.6, 3.6)) + r.range(-0.4, 0.4)
    const len = main ? r.range(4.5, 6.5) : r.range(2.5, 4)
    const [dx, dz] = polar(ang, len)
    const sx = y > mid ? lx : 0
    const sz = y > mid ? lz : 0
    branch(b, [sx, y, sz], [sx + dx, y + 1, sz + dz], B.PINE_LOG)
    const pr = main ? r.range(2.2, 3) : r.range(1.6, 2.2)
    b.blob(sx + dx, y + 1, sz + dz, pr, 0.7, pr * r.range(0.7, 1), needle, (x, yy, z, d) => d < 0.7 || hashUnit(hash3i(x, yy, z, seed)) < 0.55)
    b.blob(sx + dx, y + 2, sz + dz, pr * 0.55, 0.7, pr * 0.5, needle)
  }
  b.blob(lx, H - 1, lz, 2.4, 0.9, 2.2, needle)
  b.blob(lx, H, lz, 1.3, 0.7, 1.3, needle)
  return pruneFloating(b.build())
}

/* ================= 柳 ================= */

export const WILLOW_VARIANTS = [{ name: '河岸柳' }, { name: '景观柳' }, { name: '庭院柳' }] as const

/**
 * 柳：弯干 → 3–5 条两段主枝伸向不同方向与高度 → 高低错位的不规则冠团
 * → 垂枝只从冠团下缘长出：起点不同、长度不同、有折线、有疏密、外围长内部短。
 */
export function willow({ variant, seed, height }: TreeParams): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('willow')
  const H = Math.round(height)
  const leaf = S(B.LEAVES_WILLOW)
  const strand = S(B.WILLOW_STRAND)
  const trunkH = Math.max(3, Math.round(H * r.range(0.36, 0.44)))
  if (H >= 9) roots(b, r, B.LOG, r.int(2, 3))

  /* 弯干：三段，每段横移不超过一格 */
  const k1 = Math.round(trunkH * 0.4)
  const k2 = Math.round(trunkH * 0.75)
  const o1: [number, number] = [r.int(-1, 1), 0]
  const o2: [number, number] = [o1[0], r.int(-1, 1)]
  branch(b, [0, 0, 0], [0, k1, 0])
  branch(b, [0, k1, 0], [o1[0], k2, o1[1]])
  branch(b, [o1[0], k2, o1[1]], [o2[0], trunkH, o2[1]])
  const top: P3 = [o2[0], trunkH, o2[1]]

  /* 两段主枝 */
  const n = variant === 2 ? r.int(3, 4) : r.int(4, 5)
  const a0 = r.range(0, Math.PI * 2)
  const reach = H * (variant === 1 ? 0.42 : 0.34)
  const clusters: { c: P3; rx: number; ry: number }[] = []
  for (let i = 0; i < n; i++) {
    const ang = a0 + (i * Math.PI * 2) / n + r.range(-0.4, 0.4)
    const sy = trunkH - r.int(0, 1)
    const l1 = reach * r.range(0.45, 0.6)
    const [d1x, d1z] = polar(ang, l1)
    const mid: P3 = [top[0] + d1x, sy + r.int(1, 2), top[2] + d1z]
    branch(b, [top[0], sy, top[2]], mid)
    const ang2 = ang + r.range(-0.5, 0.5)
    const l2 = reach * r.range(0.3, 0.5)
    const [d2x, d2z] = polar(ang2, l2)
    const tip: P3 = [mid[0] + d2x, mid[1] + r.int(0, 2), mid[2] + d2z]
    branch(b, mid, tip)
    clusters.push({ c: [tip[0], tip[1] + 1, tip[2]], rx: r.range(1.5, 2.1), ry: r.range(0.85, 1.1) })
    if (r.chance(0.45)) clusters.push({ c: mid, rx: r.range(1.1, 1.5), ry: 0.85 })
  }
  /* 冠心团 */
  clusters.push({ c: [top[0], trunkH + r.int(2, 3), top[2]], rx: r.range(1.5, 2), ry: 1.2 })
  branch(b, top, [top[0], trunkH + 2, top[2]])
  /* 伞形主冠：扁而宽，把各枝端团连成一顶，边缘仍按团簇起伏 */
  crown(b, [top[0], trunkH + 3, top[2]], reach * 0.75, 1.5, reach * 0.75, leaf, seed + 9, 0.55, 0.45)
  for (const { c, rx, ry } of clusters) crown(b, c, rx, ry, rx * r.range(0.8, 1.1), leaf, seed, 0.55, 0.55)

  /* 垂枝：取每列冠团下缘为起点 */
  const bottom = new Map<number, P3>()
  let maxDist = 1
  for (const blk of b.s.blocks) {
    if ((blk.state & 255) !== B.LEAVES_WILLOW) continue
    const kk = ((blk.x + 64) << 8) | (blk.z + 64)
    const cur = bottom.get(kk)
    if (!cur || blk.y < cur[1]) bottom.set(kk, [blk.x, blk.y, blk.z])
    maxDist = Math.max(maxDist, Math.hypot(blk.x - top[0], blk.z - top[2]))
  }
  for (const [x, y, z] of bottom.values()) {
    if (b.s.has(x, y - 1, z)) continue
    // 垂枝彼此不贴：四邻已有垂枝就跳过，避免连成一堵叶墙
    const dist = Math.hypot(x - top[0], z - top[2])
    if (dist < 1.5 || dist < maxDist * 0.45) continue
    const outer = dist / maxDist
    if (hashUnit(hash3i(x, y, z, seed + 31)) > 0.35 + outer * 0.55) continue
    // 外围长、内侧短；垂到离地约三成树高为止，不拖地
    const floor = Math.max(2, Math.round(H * 0.28))
    const lenMax = Math.min(y - floor, Math.round(1 + Math.pow(outer, 1.4) * H * 0.4 + r.range(-1, 1.5)))
    let cx = x
    let cz = z
    let cy = y - 1
    let len = 0
    const [ox, oz] = [Math.sign(x - top[0]), Math.sign(z - top[2])]
    while (len < lenMax && cy >= floor) {
      if (b.s.has(cx, cy, cz)) break
      b.set(cx, cy, cz, strand)
      len++
      /* 折线：偶尔向外错一格（先横再下，保持面相连） */
      if (len > 1 && hashUnit(hash3i(cx, cy, cz, seed + 5)) < 0.2) {
        const nx = cx + (hashUnit(hash3i(cx, cy, cz, seed + 6)) < 0.5 ? ox : 0)
        const nz = cz + (nx === cx ? oz : 0)
        if ((nx !== cx || nz !== cz) && !b.s.has(nx, cy, nz)) {
          cx = nx
          cz = nz
          b.set(cx, cy, cz, strand)
        }
      }
      cy--
    }
  }
  return pruneFloating(b.build())
}

/* ================= 桃 ================= */

export const PEACH_VARIANTS = [{ name: '桃·疏枝' }, { name: '桃·团花' }, { name: '桃·斜枝' }] as const

/** 桃：短主干 → 2–4 条主枝 → 各带一截次枝 → 花簇围绕枝端，簇间露枝；浅粉为主、局部深粉 */
export function peach({ variant, seed, height }: TreeParams): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('peach')
  const H = Math.round(height)
  const trunkH = Math.max(2, Math.round(H * 0.3))
  branch(b, [0, 0, 0], [0, trunkH, 0])
  const n = variant === 1 ? r.int(3, 4) : r.int(2, 4)
  const a0 = r.range(0, Math.PI * 2)
  const tips: P3[] = []
  const slant = variant === 2 ? r.range(0, Math.PI * 2) : null
  for (let i = 0; i < n; i++) {
    const ang = slant !== null ? slant + r.range(-0.9, 0.9) : a0 + (i * Math.PI * 2) / n + r.range(-0.35, 0.35)
    const len = r.range(2, 3.3)
    const [dx, dz] = polar(ang, len)
    const sy = trunkH - (i % 2)
    const tip: P3 = [dx, Math.min(H - 2, sy + r.int(2, 3)), dz]
    branch(b, [0, sy, 0], tip)
    tips.push(tip)
    /* 次枝 */
    const m = r.int(1, 2)
    for (let j = 0; j < m; j++) {
      const a2 = ang + r.sign() * r.range(0.6, 1.2)
      const [ex, ez] = polar(a2, r.range(1.2, 2.2))
      const from: P3 = [Math.round(dx * 0.6), sy + 1, Math.round(dz * 0.6)]
      const t2: P3 = [from[0] + ex, from[1] + r.int(1, 2), from[2] + ez]
      branch(b, from, t2)
      tips.push(t2)
    }
  }
  const flower = (x: number, y: number, z: number): PackedState => S(hashUnit(hash3i(x, y, z, seed + 3)) < 0.22 ? B.BLOSSOM_DEEP : B.BLOSSOM)
  for (const t of tips) {
    const rr = r.range(1.1, variant === 1 ? 1.9 : 1.6)
    b.blob(t[0], t[1] + 0.4, t[2], rr, rr * 0.85, rr, S(B.BLOSSOM), (x, y, z, d) => d < 0.55 || hashUnit(hash3i(x, y, z, seed)) < 0.7)
  }
  for (const blk of b.s.blocks) if ((blk.state & 255) === B.BLOSSOM) b.set(blk.x, blk.y, blk.z, flower(blk.x, blk.y, blk.z))
  return pruneFloating(b.build())
}

/* ================= 竹丛 ================= */

export const BAMBOO_VARIANTS = [{ name: '竹丛·疏' }, { name: '竹丛·密' }, { name: '竹丛·高' }] as const

/** 竹丛：3–7 根分节竹竿，成熟 / 中等 / 幼竹高度差明显；上部左右交替的侧枝与叶簇 */
export function bambooGrove({ variant, seed, height }: TreeParams): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('bamboo')
  const n = variant === 1 ? r.int(5, 7) : r.int(3, 5)
  const H = Math.round(height * (variant === 2 ? 1.15 : 1))
  const spots: [number, number][] = [[0, 0]]
  let guard = 0
  while (spots.length < n && guard++ < 200) {
    const x = r.int(-2, 2)
    const z = r.int(-2, 2)
    if (x * x + z * z > 6.5) continue
    if (spots.some(([sx, sz]) => sx === x && sz === z)) continue
    spots.push([x, z])
  }
  const leaf = S(B.BAMBOO_LEAVES)
  spots.forEach(([x, z], i) => {
    const rank = i === 0 ? 1 : i < n * 0.4 ? r.range(0.85, 1) : i < n * 0.75 ? r.range(0.62, 0.75) : r.range(0.4, 0.52)
    const h = Math.max(3, Math.round(H * rank))
    for (let y = 0; y < h; y++) b.set(x, y, z, S(B.BAMBOO))
    /* 侧枝：左右交替，自竿中部往上 */
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]
    let di = r.int(0, 3)
    for (let y = Math.round(h * 0.5); y < h - 1; y += 2) {
      const [dx, dz] = dirs[di]
      b.setIfEmpty(x + dx, y, z + dz, leaf)
      if (h > 6) {
        b.setIfEmpty(x + dx * 2, y, z + dz * 2, leaf)
        b.setIfEmpty(x + dx * 2, y + 1, z + dz * 2, leaf)
      }
      di = (di + 2 + (r.chance(0.3) ? 1 : 0)) % 4
    }
    /* 竿梢叶簇 */
    b.setIfEmpty(x, h, z, leaf)
    for (const [dx, dz] of dirs) b.setIfEmpty(x + dx, h - 1, z + dz, leaf)
  })
  return pruneFloating(b.build())
}

/* ================= 椰棕（岭南） ================= */

export const PALM_VARIANTS = [{ name: '斜干椰' }, { name: '直干棕' }] as const

/** 细长单干（斜干椰在中段、上段各偏一格），顶上八片羽叶向外伸出、末梢下垂 */
export function palm({ variant, seed, height }: TreeParams): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('palm')
  const H = Math.max(7, Math.round(height * 0.9))
  const lean = variant === 0 ? r.sign() : 0
  const alongX = r.chance(0.5)
  let x = 0
  let z = 0
  for (let y = 0; y < H; y++) {
    if (lean && (y === Math.round(H * 0.45) || y === Math.round(H * 0.78))) {
      b.set(x, y, z, log(B.PALM_LOG, Axis.Y))
      if (alongX) x += lean
      else z += lean
    }
    b.set(x, y, z, log(B.PALM_LOG, Axis.Y))
  }
  const leaf = S(B.LEAVES_PALM)
  b.set(x, H, z, leaf)
  b.set(x, H + 1, z, leaf)
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]
  for (const [dx, dz] of dirs) {
    const diag = dx !== 0 && dz !== 0
    const len = diag ? 3 : 4
    for (let i = 1; i <= len; i++) {
      const droop = i === len ? 2 : i === len - 1 ? 1 : 0
      const px = x + dx * i
      const pz = z + dz * i
      b.set(px, H - droop, pz, leaf)
      if (droop) b.set(px, H - droop + 1, pz, leaf)
      if (diag) b.set(px, H - droop, z + dz * (i - 1), leaf)
    }
  }
  return pruneFloating(b.build())
}

/* ================= 白桦（东北林海） ================= */

export const BIRCH_VARIANTS = [{ name: '白桦' }, { name: '双干白桦' }] as const

/** 白干挺直、窄高的卵形冠，几根细枝斜出 */
export function birch({ variant, seed, height }: TreeParams): VoxelStructure {
  const r = new Random(seed)
  const b = new StructureBuilder('birch')
  const H = height
  const leaf = S(B.LEAVES_BROAD)
  branch(b, [0, 0, 0], [0, H - 1, 0], B.BIRCH_LOG)
  if (variant === 1) {
    b.set(1, 1, 0, log(B.BIRCH_LOG, Axis.X))
    branch(b, [1, 1, 0], [1, Math.round(H * 0.75), 0], B.BIRCH_LOG)
    crown(b, [1, Math.round(H * 0.72), 0], 1.8, 2.2, 1.8, leaf, seed + 5)
  }
  for (let i = 0; i < 3; i++) {
    const y = r.int(Math.round(H * 0.45), H - 3)
    const [dx, dz] = polar(r.range(0, Math.PI * 2), 2)
    branch(b, [0, y, 0], [dx, y + 1, dz], B.BIRCH_LOG)
  }
  crown(b, [0, Math.round(H * 0.64), 0], 2.3, H * 0.3, 2.3, leaf, seed)
  crown(b, [0, H - 1, 0], 1.5, 1.6, 1.5, leaf, seed + 3)
  return pruneFloating(b.build())
}
