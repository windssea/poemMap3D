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

describe('地点不落水', () => {
  it('每个自动聚落至少落下一座建筑（不整组沉在水里）', async () => {
    const { testWorld } = await import('./helpers')
    const w = testWorld()
    const bad: string[] = []
    for (const lm of w.landmarks.landmarks) {
      if (!lm.def.structures.length || !lm.def.id.startsWith('place-')) continue
      if (!lm.placements.length) bad.push(lm.def.name)
    }
    expect(bad, bad.join('、')).toEqual([])
  }, 60000)

  it('手工地标的每一座建筑都建了出来（落水、跨不过的桥不会被悄悄跳过）', async () => {
    const { testWorld } = await import('./helpers')
    const w = testWorld()
    const miss: string[] = []
    for (const lm of w.landmarks.landmarks) {
      if (lm.def.id.startsWith('place-')) continue
      const ids = new Set(lm.placements.map((p) => p.id))
      lm.def.structures.forEach((s, i) => {
        if (s.b !== 'lamp' && !ids.has(`${lm.def.id}-${s.b}-${i}`)) miss.push(`${lm.def.name} ${s.b}(${s.x},${s.z})`)
      })
    }
    expect(miss, miss.join('、')).toEqual([])
  }, 60000)
})

describe('主体语义与机位视廊', () => {
  it('自然、雕刻主景按显式主体：黄山是迎客松、龙门是石窟大龛；显式主体下标都有效', async () => {
    const { heroIndex, heroKind } = await import('../src/world/landmark/LandmarkHero')
    const { LANDMARK_CATALOG } = await import('../src/world/landmark/LandmarkCatalog')
    const hs = LANDMARK_CATALOG.find((d) => d.id === 'huangshan')!
    const lmg = LANDMARK_CATALOG.find((d) => d.id === 'longmen')!
    expect(hs.structures[heroIndex(hs)].b).toBe('sculptedPine')
    expect(heroKind(hs)).toBe('tree')
    expect(lmg.structures[heroIndex(lmg)].b).toBe('grottoFacade')
    expect(heroKind(lmg)).toBe('carving')
    for (const d of LANDMARK_CATALOG) if (d.hero) expect(d.structures[d.hero.structure], `${d.name} hero 下标`).toBeTruthy()
  })

  it('每个定稿平视机位的近段视廊里没有高大的自然树', async () => {
    const { testWorld } = await import('./helpers')
    const w = testWorld()
    const bad: string[] = []
    for (const lm of w.landmarks.landmarks) {
      for (const s of lm.def.shots ?? []) {
        if (s.pitch > 0.75) continue
        const [ox, , oz] = s.offset ?? [0, 0, 0]
        const tx = lm.x + ox
        const tz = lm.z + oz
        const len = Math.min(s.distance * 0.8, lm.def.radius * 1.2)
        const dx = Math.sin(s.yaw)
        const dz = Math.cos(s.yaw)
        const R = Math.ceil(len) + 1
        for (const t of w.trees.collect(tx - R, tz - R, tx + R, tz + R)) {
          const vx = t.x - tx
          const vz = t.z - tz
          const along = vx * dx + vz * dz
          const across = Math.abs(vx * dz - vz * dx)
          // 中线附近（夹角一半以内）、离目标 4 格以外的高树
          if (along > 4 && along < len - 2 && across < along * Math.tan(0.11) && t.height >= 10) bad.push(`${lm.def.name}·${s.name} 树 (${t.x},${t.z}) 高 ${t.height}`)
        }
      }
    }
    expect(bad, `${bad.length} 处：` + bad.slice(0, 8).join('；')).toEqual([])
  }, 120000)
})

describe('建筑不悬空', () => {
  it('城门、牌坊、城墙每一列最低方块下面都是实地（地基接到地面，不留空缝）', async () => {
    const { testWorld } = await import('./helpers')
    const { CHUNK_SIZE } = await import('../src/world/coordinate/constants')
    const { Blocks } = await import('../src/world/block/Blocks')
    const w = testWorld()
    const vols = new Map<string, import('../src/world/voxel/VoxelVolume').VoxelVolume>()
    const id = (x: number, y: number, z: number) => {
      const k = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`
      let v = vols.get(k)
      if (!v) {
        v = w.chunks.generateVolume(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE), 1, false).volume
        vols.set(k, v)
      }
      return v.get(x, y, z) & 255
    }
    const bad: string[] = []
    for (const lm of w.landmarks.landmarks) {
      if (lm.def.id.startsWith('place-')) continue
      for (const p of lm.placements) {
        if (!/^(gate-|wall-)|-archway-|-gate-/.test(p.id) || !p.foundation) continue
        let gaps = 0
        for (const c of p.base) {
          if (c.y - p.minY > 1) continue // 檐口等悬空列不要求
          const x = p.x + c.x
          const z = p.z + c.z
          const below = id(x, p.y + c.y - 1, z)
          if (!below || Blocks.replaceable[below]) gaps++
        }
        if (gaps) bad.push(`${lm.def.name} ${p.id} ${gaps} 列`)
      }
    }
    expect(bad, bad.slice(0, 10).join('；')).toEqual([])
  }, 300000)

  it('园湖、西湖与相邻天然江河不留一级水墙（扬州园湖贴大运河、西湖接钱塘江与江南运河）', () => {
    const w = testWorld()
    const bad: string[] = []
    for (const id of ['yangzhou', 'hangzhou']) {
      const l = w.landmarks.landmarks.find((l) => l.def.id === id)!
      const r = l.def.radius
      for (let z = l.z - r; z <= l.z + r; z++)
        for (let x = l.x - r; x <= l.x + r; x++) {
          const a = w.terrain.column(x, z)
          if (!(a.waterY >= 0 && a.height < a.waterY)) continue
          for (const [dx, dz] of [[1, 0], [0, 1]]) {
            const b = w.terrain.column(x + dx, z + dz)
            if (!(b.waterY >= 0 && b.height < b.waterY) || b.waterY === a.waterY) continue
            const kinds = [a.waterKind, b.waterKind].sort().join()
            if (kinds === '2,3') bad.push(`${id} (${x},${z}) ${a.waterY}/${b.waterY}`)
          }
        }
    }
    expect(bad, bad.slice(0, 10).join('；')).toEqual([])
  }, 300000)
})
