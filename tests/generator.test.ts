import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { SEA_LEVEL } from '../src/world/coordinate/constants'
import { getProjection } from '../src/world/coordinate/GeoProjection'
import { testWorld } from './helpers'

describe('World Generation', () => {
  const w = testWorld()

  it('相同种子：区块哈希相同', () => {
    const lm = w.landmarks.byPlaceId('hangzhou')!
    const a = w.chunks.generate(lm.x >> 4, lm.z >> 4).chunk.hash()
    const b = w.chunks.generate(lm.x >> 4, lm.z >> 4).chunk.hash()
    expect(a).toBe(b)
  })

  it('跨区块一致：外边一圈与相邻区块内部完全相同（含树冠与建筑）', () => {
    for (const id of ['hangzhou', 'changan', 'lushan']) {
      const lm = w.landmarks.byPlaceId(id)!
      const cx = lm.x >> 4
      const cz = lm.z >> 4
      const a = w.chunks.generate(cx, cz).volume
      const east = w.chunks.generate(cx + 1, cz).chunk
      const south = w.chunks.generate(cx, cz + 1).chunk
      for (let y = 0; y < 256; y++)
        for (let l = 0; l < 16; l++) {
          expect(a.get((cx + 1) * 16, y, cz * 16 + l)).toBe(east.getBlock(0, y, l))
          expect(a.get(cx * 16 + l, y, (cz + 1) * 16)).toBe(south.getBlock(l, y, 0))
        }
    }
  })

  it('海洋与陆地大势：东海为水、长安为陆、青藏高原高', () => {
    const P = getProjection()
    const sea = P.project(125, 29)
    const s = w.terrain.sample(Math.round(sea.x), Math.round(sea.z))
    expect(s.waterY).toBe(SEA_LEVEL)
    const tibet = P.project(90, 32)
    expect(w.terrain.surfaceHeightAt(tibet.x, tibet.z)).toBeGreaterThan(150)
    const ca = w.landmarks.byPlaceId('changan')!
    expect(w.terrain.sample(ca.x, ca.z).waterY).toBe(-1)
  })

  it('长江有水，水面不高于岸', () => {
    const r = w.rivers.rivers.find((x) => x.def.id === 'yangtze')!
    const [x, z] = r.pts[Math.floor(r.pts.length * 0.8)]
    const s = w.terrain.sample(Math.round(x), Math.round(z))
    expect(s.waterY).toBeGreaterThan(s.surfaceY)
  })

  it('区块里有地表方块与水', () => {
    const lm = w.landmarks.byPlaceId('hangzhou')!
    const c = w.chunks.generate((lm.x - 14) >> 4, lm.z >> 4).chunk
    let water = 0
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) for (let y = 30; y < 80; y++) if ((c.getBlock(lx, y, lz) & 255) === B.WATER) water++
    expect(water).toBeGreaterThan(0)
  })
})
