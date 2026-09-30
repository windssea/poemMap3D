import { describe, expect, it } from 'vitest'
import { WORLD_HEIGHT } from '../src/world/coordinate/constants'
import { generateCoarseRegion } from '../src/world/generation/CoarseGenerator'
import { downsample2, isLeafBlock } from '../src/world/voxel/VoxelDownsampler'
import { VoxelVolume } from '../src/world/voxel/VoxelVolume'
import { testWorld } from './helpers'

/** 每列最高方块是树叶的列占比（skip：丢掉外边一圈） */
function canopyShare(v: VoxelVolume, skip: number): number {
  let leaf = 0
  let n = 0
  for (let z = skip; z < v.sz - skip; z++)
    for (let x = skip; x < v.sx - skip; x++) {
      let id = 0
      for (let y = v.sy - 1; y >= 0; y--) {
        const s = v.data[(y * v.sz + z) * v.sx + x]
        if (s) {
          id = s & 255
          break
        }
      }
      n++
      if (isLeafBlock(id)) leaf++
    }
  return leaf / n
}

/**
 * 近景（原分辨率）、远景（2×2 合并）、远景片（4×4×4）画的是同一片林子。
 * 林冠覆盖率要一致：某一层树冠明显偏少，那一圈地表露出来偏浅偏黄；偏多则偏深——镜头拉远时就是一圈一圈的亮度环带。
 */
describe('各层级的林冠覆盖率一致（不出亮度环带）', () => {
  const w = testWorld()
  for (const place of ['hangzhou', 'bianjing', 'lushan']) {
    it(place, () => {
      const lm = w.landmarks.byPlaceId(place)!
      const rx = Math.floor(lm.x / 128)
      const rz = Math.floor(lm.z / 128)
      const full = w.chunks.generateArea(new VoxelVolume(rx * 128 - 2, 0, rz * 128 - 2, 132, WORLD_HEIGHT, 132), true).volume
      const far = downsample2(w.chunks.generateArea(new VoxelVolume(rx * 128 - 2, 0, rz * 128 - 2, 132, WORLD_HEIGHT, 132), false).volume)
      const coarse = generateCoarseRegion(w.terrain, w.landmarks, w.trees, rx, rz).volume
      const a = canopyShare(full, 2)
      expect(a).toBeGreaterThan(0.05)
      expect(canopyShare(far, 1) / a).toBeGreaterThan(0.85)
      expect(canopyShare(far, 1) / a).toBeLessThan(1.15)
      expect(canopyShare(coarse, 1) / a).toBeGreaterThan(0.85)
      expect(canopyShare(coarse, 1) / a).toBeLessThan(1.15)
    }, 60000)
  }
})
