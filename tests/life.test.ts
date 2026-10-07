import { describe, expect, it } from 'vitest'
import { segmentClear, standable } from '../src/engine/effects/Pasture'

const set = (cells: [number, number][]) => new Set(cells.map(([x, z]) => x * 65536 + z))

describe('牲畜场地检查', () => {
  it('两头合法、中间一格禁行：直线不许走', () => {
    const p = set([
      [0, 0],
      [2, 0],
    ])
    expect(standable(p, 0.5, 0.5, 0)).toBe(true)
    expect(standable(p, 2.5, 0.5, 0)).toBe(true)
    expect(segmentClear(p, 0.5, 0.5, 2.5, 0.5, 0)).toBe(false)
  })

  it('体型净空：牛马四周一格都得是空地', () => {
    const cells: [number, number][] = []
    for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) cells.push([x, z])
    const p = set(cells)
    expect(standable(p, 2.5, 2.5, 1)).toBe(true)
    expect(standable(p, 0.5, 2.5, 1)).toBe(false)
    expect(standable(p, 0.5, 2.5, 0)).toBe(true)
  })

  it('沿途高差超过一格（陡坎）不走', () => {
    const p = set([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
    const h = (x: number) => (x >= 2 ? 3 : 0)
    expect(segmentClear(p, 0.5, 0.5, 1.5, 0.5, 0, h)).toBe(true)
    expect(segmentClear(p, 0.5, 0.5, 2.5, 0.5, 0, h)).toBe(false)
  })
})

describe('市井：出生与 60 秒游走', () => {
  it('几处地标里所有牲畜出生在可站格，60 秒里脚下始终合法', async () => {
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const { ANIMAL_KINDS } = await import('../src/engine/effects/LifeModels')
    const w = testWorld()
    const life = new LifeSystem(w) as any
    const bad: string[] = []
    let total = 0
    for (const id of ['place-p017', 'yangzhou', 'qinzhou', 'yueyaquan', 'huangzhou', 'jianmenguan']) {
      const lm = w.landmarks.landmarks.find((l) => l.def.id === id)
      if (!lm) continue
      life.populate(lm)
      const animals = life.animals as { kind: number; x: number; z: number }[]
      total += animals.length
      const margin = (k: number) => (['cattle', 'buffalo', 'horse'].includes(ANIMAL_KINDS[k]) ? 1 : 0)
      for (const a of animals) if (!standable(life.pasture, a.x, a.z, margin(a.kind))) bad.push(`${id} 出生 ${ANIMAL_KINDS[a.kind]} (${a.x.toFixed(1)},${a.z.toFixed(1)})`)
      for (let f = 0; f < 600; f++) {
        for (const a of animals) {
          life.wander(a, 0.1)
          if (!standable(life.pasture, a.x, a.z, 0)) {
            bad.push(`${id} 第${f}帧 ${ANIMAL_KINDS[a.kind]} 走进 (${Math.floor(a.x)},${Math.floor(a.z)})`)
            break
          }
        }
      }
    }
    expect(total).toBeGreaterThan(10)
    expect(bad, bad.slice(0, 6).join('；')).toEqual([])
  }, 120000)

  it('释放时所有实例网格（含独轮车、牲畜）的几何体都释放', async () => {
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const life = new LifeSystem(testWorld()) as any
    const meshes = life.instanced() as { geometry: { addEventListener: (e: string, f: () => void) => void } }[]
    let n = 0
    for (const m of meshes) m.geometry.addEventListener('dispose', () => n++)
    life.dispose()
    expect(n).toBe(meshes.length)
    expect(meshes.length).toBeGreaterThanOrEqual(9 * 2 + 1 + 1 + 6)
  }, 60000)
})

describe('各地标的市井配置', () => {
  it('园林、雅集、名山不放牲畜；关隘只有马和牛；兰亭只有书生、老人、童子', async () => {
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const { ANIMAL_KINDS, FIGURE_KINDS } = await import('../src/engine/effects/LifeModels')
    const w = testWorld()
    const life = new LifeSystem(w) as any
    const run = (id: string) => {
      const lm = w.landmarks.landmarks.find((l) => l.def.id === id)!
      life.populate(lm)
      return {
        animals: new Set((life.animals as { kind: number }[]).map((a) => ANIMAL_KINDS[a.kind])),
        people: new Set((life.walkers as { kind: number; still: boolean }[]).filter((p) => !p.still).map((p) => FIGURE_KINDS[p.kind])),
      }
    }
    for (const id of ['suzhou', 'lanting', 'huangshan', 'hangzhou']) expect(run(id).animals.size, id).toBe(0)
    const pass = run('jianmenguan')
    for (const a of pass.animals) expect(['horse', 'cattle']).toContain(a)
    const lt = run('lanting')
    for (const p of lt.people) expect(['scholar', 'elder', 'child', 'farmer', 'merchant']).toContain(p)
    expect(lt.people.has('scholar')).toBe(true)
  }, 120000)
})

describe('湖上行船', () => {
  it('苏州、杭州、洞庭一带湖船 90 秒里整条船身始终在水上、不压园墙建筑', async () => {
    const THREE = await import('three')
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const w = testWorld()
    const life = new LifeSystem(w) as any
    const bad: string[] = []
    let n = 0
    for (const id of ['suzhou', 'hangzhou', 'yueyanglou']) {
      const lm = w.landmarks.landmarks.find((l) => l.def.id === id)!
      life.populateWater(new THREE.Vector3(lm.x, lm.level, lm.z))
      const boats = (life.boats as { river: number; path?: unknown; kind: string; x: number; z: number; a: number }[]).filter((b) => b.river < 0 && !b.path && b.kind !== 'ship' && b.kind !== 'seaFisher')
      n += boats.length
      for (const b of boats) if (!life.hullClear(b.kind, b.x, b.z, b.a)) bad.push(`${id} 出生 ${b.kind} (${b.x.toFixed(0)},${b.z.toFixed(0)})`)
      for (let f = 0; f < 900; f++) {
        life.stepBoats(0.1, f * 0.1)
        for (const b of boats)
          if (!life.hullClear(b.kind, b.x, b.z, b.a)) {
            bad.push(`${id} 第${f}帧 ${b.kind} (${b.x.toFixed(0)},${b.z.toFixed(0)})`)
            break
          }
        if (bad.length) break
      }
    }
    expect(n).toBeGreaterThan(3)
    expect(bad, bad.slice(0, 5).join('；')).toEqual([])
  }, 180000)
})

describe('江河行船', () => {
  it('苏州、枫桥、杭州、扬州、岳阳一带河船 60 秒里船身压岸的帧不到 1%（窄河掉头倒着走、卡死的撤掉）', async () => {
    const THREE = await import('three')
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const w = testWorld()
    const life = new LifeSystem(w) as any
    const rates: string[] = []
    for (const id of ['suzhou', 'fengqiao', 'hangzhou', 'yangzhou', 'yueyanglou']) {
      const lm = w.landmarks.landmarks.find((l) => l.def.id === id)!
      life.populateWater(new THREE.Vector3(lm.x, lm.level, lm.z))
      let bad = 0
      let n = 0
      for (let f = 0; f < 600; f++) {
        life.stepBoats(0.1, f * 0.1)
        if (f < 30) continue
        for (const b of (life.boats as { river: number; kind: string; x: number; z: number; a: number }[]).filter((q) => q.river >= 0)) {
          n++
          if (!life.hullClear(b.kind, b.x, b.z, b.a, true)) bad++
        }
      }
      expect(n, id).toBeGreaterThan(1000)
      if (bad / n >= 0.01) rates.push(`${id} ${((bad / n) * 100).toFixed(1)}%`)
    }
    expect(rates).toEqual([])
  }, 300000)

  it('苏州一带的船不来回抖动（被挡转向、窄河掉头不在两种动作之间每帧切换）', async () => {
    const THREE = await import('three')
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const w = testWorld()
    const life = new LifeSystem(w) as any
    const lm = w.landmarks.landmarks.find((l) => l.def.id === 'suzhou')!
    life.populateWater(new THREE.Vector3(lm.x - 40, lm.level, lm.z))
    type P = { x: number; z: number; a: number }
    const hist = new Map<object, P[]>()
    const dt = 1 / 60
    for (let f = 0; f < 60 * 20; f++) {
      life.stepBoats(dt, f * dt)
      for (const b of life.boats as (P & object)[]) {
        const h = hist.get(b) ?? []
        h.push({ x: b.x, z: b.z, a: b.a })
        hist.set(b, h)
      }
    }
    const bad: string[] = []
    for (const [b, h] of hist) {
      if ((b as { dead?: boolean }).dead) continue
      // 朝向变化、沿船头方向的位移，正负号翻转的次数
      let flips = 0
      let pda = 0
      let pm = 0
      for (let i = 1; i < h.length; i++) {
        const da = h[i].a - h[i - 1].a
        const m = (h[i].x - h[i - 1].x) * Math.cos(h[i].a) + (h[i].z - h[i - 1].z) * Math.sin(h[i].a)
        if (Math.abs(da) > 1e-4 && Math.abs(pda) > 1e-4 && Math.sign(da) !== Math.sign(pda)) flips++
        if (Math.abs(m) > 1e-4 && Math.abs(pm) > 1e-4 && Math.sign(m) !== Math.sign(pm)) flips++
        if (Math.abs(da) > 1e-4) pda = da
        if (Math.abs(m) > 1e-4) pm = m
      }
      if (flips > 12) bad.push(`${(b as { kind: string }).kind} (${h[0].x.toFixed(0)},${h[0].z.toFixed(0)}) ${flips}`)
    }
    expect(hist.size).toBeGreaterThan(5)
    expect(bad).toEqual([])
  }, 300000)

  it('苏州一带江南运河上的船来往于枫桥与湖南出口之间，不困在湖里（岸边凸嘴换到河宽另一侧绕过去）', async () => {
    const THREE = await import('three')
    const { testWorld } = await import('./helpers')
    const { LifeSystem } = await import('../src/engine/effects/LifeSystem')
    const w = testWorld()
    const sz = w.landmarks.landmarks.find((l) => l.def.id === 'suzhou')!
    const life = new LifeSystem(w) as any
    life.populateWater(new THREE.Vector3(sz.x - 30, sz.level, sz.z + 20))
    const ri = w.rivers.rivers.findIndex((r) => r.def.id === 'jiangnan-canal')
    const boats = (life.boats as { river: number; s: number; dead?: boolean }[]).filter((b) => b.river === ri)
    let lo = Infinity
    let hi = -Infinity
    for (let f = 0; f < 15 * 420; f++) {
      life.stepBoats(1 / 15, f / 15)
      for (const b of boats) {
        lo = Math.min(lo, b.s)
        hi = Math.max(hi, b.s)
      }
    }
    expect(boats.length).toBeGreaterThan(1)
    expect(boats.filter((b) => b.dead)).toEqual([])
    expect(lo).toBeLessThan(13)
    expect(hi).toBeGreaterThan(42)
  }, 300000)
})
