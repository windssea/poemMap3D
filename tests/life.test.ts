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
