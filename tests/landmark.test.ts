import { describe, expect, it } from 'vitest'
import { Blocks } from '../src/world/block/Blocks'
import { Occupancy } from '../src/world/structure/OccupancyMap'
import { testWorld } from './helpers'

describe('Landmark', () => {
  const w = testWorld()

  it('三处样板地标都已解析，并与诗词地点关联', () => {
    for (const id of ['hangzhou', 'lushan', 'changan']) {
      const lm = w.landmarks.byPlaceId(id)
      expect(lm, id).toBeDefined()
      expect(lm!.placements.length, id).toBeGreaterThan(2)
    }
  })

  it('建筑占用正确：建筑方块所在列都登记为 Building', () => {
    const lm = w.landmarks.byPlaceId('changan')!
    for (const p of lm.placements.slice(0, 10)) for (const b of p.blocks.slice(0, 50)) expect(w.landmarks.occupancy.has(p.x + b.x, p.z + b.z, Occupancy.Building)).toBe(true)
  })

  it('入口通道与视线通道上没有树', () => {
    for (const id of ['hangzhou', 'changan', 'lushan']) {
      const lm = w.landmarks.byPlaceId(id)!
      const R = lm.def.radius
      const trees = w.trees.collect(lm.x - R, lm.z - R, lm.x + R, lm.z + R)
      for (const t of trees) {
        expect(w.landmarks.occupancy.has(t.x, t.z, Occupancy.Entrance | Occupancy.Building | Occupancy.Buffer), `${id} ${t.x},${t.z}`).toBe(false)
        if (t.type !== 'bamboo' && w.landmarks.occupancy.has(t.x, t.z, Occupancy.Sightline)) expect(t.height).toBeLessThanOrEqual(8)
      }
    }
  })

  it('入口前方没有实心方块挡路（生成后检查）', () => {
    const lm = w.landmarks.byPlaceId('hangzhou')!
    const hall = lm.placements.find((p) => p.id.includes('-hall-'))!
    // 殿正面朝南：正前方台阶外 3 格的地表上方为空
    const b = hall.structure.bounds()
    const x = hall.x
    const z = hall.z + b.maxZ + 2
    const vol = w.chunks.generate(x >> 4, z >> 4).volume
    const ground = w.terrain.surfaceHeightAt(x, z)
    for (let y = ground + 1; y < ground + 3; y++) expect(Blocks.get(vol.get(x, y, z) & 255).solid, `y=${y}`).toBe(false)
  })

  it('城池不压江河：城墙范围内没有河湖水面', () => {
    for (const lm of w.landmarks.landmarks) {
      const wall = lm.def.walls?.[0]
      if (!wall) continue
      let wet = 0
      for (let dz = -wall.hd; dz <= wall.hd; dz += 3)
        for (let dx = -wall.hw; dx <= wall.hw; dx += 3) {
          const c = w.terrain.column(lm.x + wall.x + dx, lm.z + wall.z + dz)
          if (c.waterY > c.height && c.waterKind !== 4) {
            const rv = w.terrain.rivers.query(lm.x + wall.x + dx, lm.z + wall.z + dz)
            if (rv && lm.def.allowRivers?.includes(w.terrain.rivers.rivers[rv.river].def.id)) continue
            wet++
          }
        }
      expect(wet, lm.def.name).toBe(0)
    }
  })

  it('庐山有瀑布', () => {
    expect(w.landmarks.byPlaceId('lushan')!.waterfall).not.toBeNull()
  })
})

describe('主楼视廊', () => {
  it('四座名楼正面的视廊里不长乔木（自然林与目录种植都不进）', async () => {
    const { testWorld } = await import('./helpers')
    const { Occupancy } = await import('../src/world/structure/OccupancyMap')
    const w = testWorld()
    for (const name of ['岳阳楼', '滕王阁', '鹳雀楼', '黄鹤楼']) {
      const lm = w.landmarks.landmarks.find((l) => l.def.name === name)!
      const R = lm.def.radius * 1.4
      const trees = [...w.trees.collect(lm.x - R, lm.z - R, lm.x + R, lm.z + R), ...w.landmarks.treesNear(lm.x - R, lm.z - R, lm.x + R, lm.z + R)]
      let corridor = 0
      for (let z = lm.z - R; z <= lm.z + R; z++) for (let x = lm.x - R; x <= lm.x + R; x++) if (w.landmarks.occupancy.has(x, z, Occupancy.HeroView)) corridor++
      expect(corridor, `${name} 视廊面积`).toBeGreaterThan(100)
      const inside = trees.filter((t) => w.landmarks.occupancy.has(t.x, t.z, Occupancy.HeroView))
      expect(inside.length, `${name} 视廊里的树`).toBe(0)
    }
  }, 60000)
})

describe('泊舟', () => {
  it('每条泊舟整条落在水面上，不压到岸上', async () => {
    const { testWorld } = await import('./helpers')
    const w = testWorld()
    for (const lm of w.landmarks.landmarks)
      for (const p of lm.placements.filter((q) => q.id.includes('skiff'))) {
        let dry = 0
        for (let x = p.world.minX; x <= p.world.maxX; x++)
          for (let z = p.world.minZ; z <= p.world.maxZ; z++) {
            const c = w.terrain.column(x, z)
            if (!(c.waterY >= 0 && c.height < c.waterY)) dry++
          }
        expect(dry, `${lm.def.name} ${p.id}`).toBe(0)
      }
  }, 60000)
})
