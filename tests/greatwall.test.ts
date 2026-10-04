import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { CHUNK_SIZE } from '../src/world/coordinate/constants'
import type { VoxelVolume } from '../src/world/voxel/VoxelVolume'
import { testWorld } from './helpers'

/*
 * 长城拓扑验收：不只看「各组件存在」，而是墙—关—墙连续、门洞能走通、马道连贯、敌台门正对马道。
 * 墙点按墙线、线上序号排好；相邻两点之间若断开，断口必须有正当理由（江河、关城、券门关楼）。
 */
describe('长城拓扑', () => {
  const w = testWorld()
  const gw = w.greatWall
  const pts = gw.points
  const forts = w.landmarks.landmarks.flatMap((l) => (l.def.walls ?? []).map((c) => ({ id: l.def.id, x0: l.x + c.x - c.hw, x1: l.x + c.x + c.hw, z0: l.z + c.z - c.hd, z1: l.z + c.z + c.hd })))
  const nearFort = (x: number, z: number, m: number) => forts.some((f) => x >= f.x0 - m && x <= f.x1 + m && z >= f.z0 - m && z <= f.z1 + m)
  // 券门关楼、地标里的关门（剑门关这样墙从关门两侧爬上山的）都算墙的着落
  const gateC = [
    ...gw.gates.map((g) => ({ x: (g.world.minX + g.world.maxX) / 2, z: (g.world.minZ + g.world.maxZ) / 2 })),
    ...w.landmarks.landmarks.flatMap((l) => l.placements.filter((p) => /-gate-\d+$/.test(p.id)).map((p) => ({ x: p.x, z: p.z }))),
  ]
  const nearGate = (x: number, z: number, m: number) => gateC.some((g) => Math.hypot(g.x - x, g.z - z) <= m)
  const wet = (x: number, z: number) => {
    const c = w.terrain.column(x, z)
    return c.waterY >= 0 && c.height < c.waterY
  }
  const wallAt = new Set(pts.map((p) => ((p.x + 32768) << 16) | (p.z + 32768)))
  const nearWall = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (wallAt.has(((x + dx + 32768) << 16) | (z + dz + 32768))) return true
    return false
  }
  const byLine = new Map<number, typeof pts>()
  for (const p of pts) {
    const l = byLine.get(p.line) ?? []
    l.push(p)
    byLine.set(p.line, l)
  }
  for (const l of byLine.values()) l.sort((a, b) => a.seq - b.seq)

  it('墙线不无故断开：断口只能是江河、关城或券门关楼', () => {
    const bad: string[] = []
    for (const [line, l] of byLine)
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1]
        const b = l[i]
        const d = Math.hypot(b.x - a.x, b.z - a.z)
        if (d <= 1.5) continue
        const n = Math.ceil(d)
        for (let k = 1; k < n; k++) {
          const x = Math.round(a.x + ((b.x - a.x) * k) / n)
          const z = Math.round(a.z + ((b.z - a.z) * k) / n)
          // 与别的墙线重合处（内外长城交汇）去重留下的空也算连着
          if (wet(x, z) || nearFort(x, z, 3) || nearGate(x, z, 9) || nearWall(x, z, 1)) continue
          bad.push(`线${line} (${a.x},${a.z})→(${b.x},${b.z})`)
          break
        }
      }
    expect(bad, bad.slice(0, 10).join('；')).toEqual([])
  })

  it('墙线两头有着落：接到另一条墙、关城或水边，不悬一截在野地里', () => {
    const bad: string[] = []
    for (const [line, l] of byLine)
      for (const e of [l[0], l[l.length - 1]]) {
        // 关城支线远端止于山头墩台（敌台）也算有着落
        let ok = nearFort(e.x, e.z, 4) || nearGate(e.x, e.z, 10) || e.tower > 0
        for (let dz = -4; dz <= 4 && !ok; dz++) for (let dx = -4; dx <= 4 && !ok; dx++) if (wet(e.x + dx, e.z + dz)) ok = true
        if (!ok) ok = pts.some((q) => q.line !== line && Math.hypot(q.x - e.x, q.z - e.z) <= 4)
        // 墙顶进山体：端点外三格内地面已高到墙顶附近
        if (!ok) {
          const o = l.length > 1 ? (e === l[0] ? l[1] : l[l.length - 2]) : e
          const dx = Math.sign(e.x - o.x)
          const dz = Math.sign(e.z - o.z)
          for (let k = 1; k <= 3 && !ok; k++) if (w.terrain.column(e.x + dx * k, e.z + dz * k).height >= e.top - 2) ok = true
        }
        if (!ok) bad.push(`线${line} 端点 (${e.x},${e.z})`)
      }
    expect(bad, bad.join('；')).toEqual([])
  })

  it('马道连贯：相邻墙点墙顶高差不超过一格（地面本身一格一级往上陡的崖坡除外，那里是天梯）', () => {
    const bad: string[] = []
    for (const l of byLine.values())
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1]
        const b = l[i]
        if (Math.hypot(b.x - a.x, b.z - a.z) > 1.5) continue
        if (Math.abs(b.top - a.top) <= 1) continue
        const dg = Math.abs(w.terrain.column(b.x, b.z).height - w.terrain.column(a.x, a.z).height)
        if (dg < 1) bad.push(`(${a.x},${a.z}) ${a.top}→${b.top} 地面差 ${dg.toFixed(1)}`)
      }
    expect(bad, `${bad.length} 处：` + bad.slice(0, 8).join('；')).toEqual([])
  })

  it('墙不在坡上撑成高柱：马道高出地面不超过 14 格', () => {
    const bad = pts.filter((p) => p.top - Math.floor(w.terrain.column(p.x, p.z).height) > 14).map((p) => `(${p.x},${p.z})`)
    expect(bad, bad.slice(0, 8).join('；')).toEqual([])
  })

  /* 体素级检查：生成所在区块，看真实方块 */
  const vols = new Map<string, VoxelVolume>()
  const volAt = (x: number, z: number): VoxelVolume => {
    const cx = Math.floor(x / CHUNK_SIZE)
    const cz = Math.floor(z / CHUNK_SIZE)
    const k = `${cx},${cz}`
    let v = vols.get(k)
    if (!v) {
      v = w.chunks.generateVolume(cx, cz, 1, false).volume
      vols.set(k, v)
    }
    return v
  }
  const id = (x: number, y: number, z: number) => volAt(x, z).get(x, y, z) & 255
  const passable = (x: number, y: number, z: number) => {
    const a = id(x, y, z)
    const b = id(x, y + 1, z)
    return (a === 0 || a === B.TALL_GRASS) && (b === 0 || b === B.TALL_GRASS)
  }

  it('关城城门门洞走得通（长城不把关门砌死）', () => {
    const bad: string[] = []
    for (const lm of w.landmarks.landmarks) {
      if (!lm.def.greatWall && !['yanmenguan'].includes(lm.def.id)) continue
      for (const p of lm.placements) {
        if (!p.id.startsWith('gate-')) continue
        const alongZ = p.id.endsWith('-n') || p.id.endsWith('-s')
        // 门洞贯穿门座进深：沿门的轴线从一头到另一头
        for (let k = -3; k <= 3; k++) {
          const x = alongZ ? p.x : p.x + k
          const z = alongZ ? p.z + k : p.z
          if (!passable(x, p.y, z)) {
            bad.push(`${lm.def.name} ${p.id} 在 (${x},${p.y},${z}) 堵住：${id(x, p.y, z)}/${id(x, p.y + 1, z)}`)
            break
          }
        }
      }
    }
    for (const g of gw.gates) {
      const alongZ = g.world.maxX - g.world.minX < g.world.maxZ - g.world.minZ
      // 券门：门洞方向与关楼长边垂直
      for (let k = -3; k <= 3; k++) {
        const x = alongZ ? g.x + k : g.x
        const z = alongZ ? g.z : g.z + k
        if (!passable(x, g.y, z)) {
          bad.push(`券门 (${g.x},${g.z}) 在 (${x},${g.y},${z}) 堵住`)
          break
        }
      }
    }
    expect(bad, bad.join('；')).toEqual([])
  }, 120000)

  it('敌台门正对马道：门洞两格高、门外一格是马道面', () => {
    const towers = pts.filter((p) => p.tower > 0)
    // 抽查：关隘附近的全部敌台 + 全线均匀取一批
    const passIds = ['shanhaiguan', 'jiayuguan', 'yanmenguan']
    const passLm = w.landmarks.landmarks.filter((l) => passIds.includes(l.def.id))
    const pick = towers.filter((t, i) => i % Math.ceil(towers.length / 16) === 0 || passLm.some((l) => Math.hypot(l.x - t.x, l.z - t.z) < 90))
    const bad: string[] = []
    for (const t of pick)
      for (const s of [-1, 1]) {
        const R = 4
        const fx = t.alongZ ? t.x + s * t.door : t.x + s * R
        const fz = t.alongZ ? t.z + s * R : t.z + s * t.door
        if (!passable(fx, t.top + 1, fz)) {
          bad.push(`敌台 (${t.x},${t.z}) 门 (${fx},${fz}) 不通`)
          continue
        }
        // 门外一格：马道（实心面在墙顶高度上下一格内、其上可通行）
        const ox = t.alongZ ? fx : fx + s
        const oz = t.alongZ ? fz + s : fz
        let ok = false
        for (let y = t.top - 1; y <= t.top + 1 && !ok; y++) if (id(ox, y, oz) !== 0 && passable(ox, y + 1, oz)) ok = true
        // 门外正好是墙线尽头 / 断口（关城、水）就不要求
        if (!ok && !nearFort(ox, oz, 3) && !wet(ox, oz) && nearWall(ox, oz, 2)) bad.push(`敌台 (${t.x},${t.z}) 门外 (${ox},${oz}) 没有马道`)
      }
    expect(bad, `${bad.length} 处：` + bad.slice(0, 8).join('；')).toEqual([])
  }, 300000)
})
