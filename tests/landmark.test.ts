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
