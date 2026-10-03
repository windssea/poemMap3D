import { describe, expect, it } from 'vitest'
import { BlockRenderLayer } from '../src/world/block/BlockDefinition'
import { B, Blocks } from '../src/world/block/Blocks'
import { S } from '../src/world/block/BlockState'
import { volumeSkyLight } from '../src/world/light/VolumeSkyLight'
import { meshVolume } from '../src/world/voxel/VoxelMesher'
import { VoxelVolume } from '../src/world/voxel/VoxelVolume'

/** 地面（y ≤ 4 石）上搭一个 9×9 的屋面（y = 9，半砖），四角立柱；地面在 y = 5 起是空气 */
function hall(roof: number = S(B.ROOF_GRAY_SLAB)): VoxelVolume {
  const v = new VoxelVolume(-1, 0, -1, 18, 32, 18)
  for (let z = 0; z < 18; z++) for (let x = 0; x < 18; x++) for (let y = 0; y <= 4; y++) v.set(x - 1, y, z - 1, S(B.STONE))
  for (let z = 4; z <= 12; z++) for (let x = 4; x <= 12; x++) v.set(x, 9, z, roof)
  return v
}

const idx = (v: VoxelVolume, x: number, y: number, z: number) => ((y - v.oy) * v.sz + (z - v.oz)) * v.sx + (x - v.ox)

describe('天空光（网格化用）', () => {
  it('露天 15；屋面下从檐口向里逐格变暗；实心为 0', () => {
    const v = hall()
    const L = volumeSkyLight(v, Blocks, 0, 31)
    expect(L[idx(v, 1, 5, 1)]).toBe(15)
    const edge = L[idx(v, 4, 5, 8)]
    const mid = L[idx(v, 8, 5, 8)]
    expect(edge).toBe(14)
    expect(mid).toBeLessThan(edge)
    expect(mid).toBeGreaterThanOrEqual(9)
    expect(L[idx(v, 8, 2, 8)]).toBe(0)
  })

  it('半砖、楼梯挡天，树叶不挡', () => {
    const leaves = hall(S(B.LEAVES_BROAD))
    expect(volumeSkyLight(leaves, Blocks, 0, 31)[idx(leaves, 8, 5, 8)]).toBe(15)
  })

  it('远景每格代表 2 格：同样的进深衰减两倍', () => {
    const v = hall()
    const a = volumeSkyLight(v, Blocks, 0, 31, 1)[idx(v, 6, 5, 8)]
    const b = volumeSkyLight(v, Blocks, 0, 31, 2)[idx(v, 6, 5, 8)]
    expect(15 - b).toBe(2 * (15 - a))
  })

  it('网格顶点带上天空光：屋下地面比露天地面暗', () => {
    const r = meshVolume(hall())
    const d = r.layers[BlockRenderLayer.Solid]
    let under = 15
    let open = 0
    for (let i = 0; i < d.vertexCount; i++) {
      const x = d.positions[i * 3] / 16
      const y = d.positions[i * 3 + 1] / 16
      const z = d.positions[i * 3 + 2] / 16
      const up = d.normals[i * 3 + 1] > 0
      if (!up || y !== 5) continue
      if (x > 6 && x < 11 && z > 6 && z < 11) under = Math.min(under, d.sky[i])
      if (x < 2 && z < 2) open = Math.max(open, d.sky[i])
    }
    expect(open).toBe(15)
    expect(under).toBeLessThan(13)
  })
})
