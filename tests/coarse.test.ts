import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { generateCoarseRegion } from '../src/world/generation/CoarseGenerator'
import { meshVolume } from '../src/world/voxel/VoxelMesher'
import { testWorld } from './helpers'

describe('远景片（4×4×4）', () => {
  const w = testWorld()
  const lm = w.landmarks.byPlaceId('hangzhou')!
  const rx = Math.floor(lm.x / 64)
  const rz = Math.floor(lm.z / 64)

  it('杭州一片：有湖水、有瓦顶或树冠，网格三角形远少于原分辨率', () => {
    const t0 = performance.now()
    const g = generateCoarseRegion(w.terrain, w.landmarks, w.trees, rx, rz)
    const ms = performance.now() - t0
    const ids = new Set<number>()
    for (const s of g.volume.data) if (s) ids.add(s & 255)
    expect(ids.has(B.WATER)).toBe(true)
    expect(ids.has(B.ROOF_GRAY) || ids.has(B.LEAVES_BROAD) || ids.has(B.LEAVES_WILLOW)).toBe(true)
    const mesh = meshVolume(g.volume)
    expect(mesh.quads).toBeGreaterThan(50)
    expect(mesh.quads).toBeLessThan(20000)
    expect(ms).toBeLessThan(1500)
  })

  it('外边与相邻片内部一致（无缝）', () => {
    const a = generateCoarseRegion(w.terrain, w.landmarks, w.trees, rx, rz).volume
    const b = generateCoarseRegion(w.terrain, w.landmarks, w.trees, rx + 1, rz).volume
    // a 的最东一列外边 = b 的第一列内部
    for (let z = 1; z < a.sz - 1; z++)
      for (let y = 0; y < a.sy; y++) expect(a.data[(y * a.sz + z) * a.sx + a.sx - 1]).toBe(b.data[(y * b.sz + z) * b.sx + 1])
  })
})
