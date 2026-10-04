import { describe, expect, it } from 'vitest'
import { BlockRenderLayer } from '../src/world/block/BlockDefinition'
import { B, Blocks } from '../src/world/block/Blocks'
import { S } from '../src/world/block/BlockState'
import { volumeBlockLight, volumeSkyLight } from '../src/world/light/VolumeSkyLight'
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
      if (x > 6 && x < 11 && z > 6 && z < 11) under = Math.min(under, (d.light[i] & 15))
      if (x < 2 && z < 2) open = Math.max(open, (d.light[i] & 15))
    }
    expect(open).toBe(15)
    expect(under).toBeLessThan(13)
  })
})

/** 一块区块大小的体（带 1 格外边），地面 y ≤ 4 */
function flat(cx: number): VoxelVolume {
  const v = VoxelVolume.forChunk(cx, 0)
  v.data.fill(0)
  for (let z = v.oz; z < v.oz + v.sz; z++) for (let x = v.ox; x < v.ox + v.sx; x++) for (let y = 0; y <= 4; y++) v.set(x, y, z, S(B.STONE))
  return v
}
const at = (v: VoxelVolume, L: Uint8Array, x: number, y: number, z: number) => L[idx(v, x, y, z)]

describe('方块光（灯笼、格窗）', () => {
  it('没有光源时不算', () => {
    const v = flat(0)
    expect(volumeBlockLight(v, Blocks, 0, 31)).toBeNull()
  })

  it('灯笼 13 级，逐格减 1，墙挡住', () => {
    const v = flat(0)
    v.set(8, 6, 8, S(B.LANTERN))
    for (let y = 5; y <= 9; y++) for (let z = 4; z <= 12; z++) v.set(10, y, z, S(B.STONE))
    const L = volumeBlockLight(v, Blocks, 0, 31)!
    expect(at(v, L, 8, 6, 8)).toBe(13)
    expect(at(v, L, 9, 6, 8)).toBe(12)
    expect(at(v, L, 8, 5, 8)).toBe(12)
    // 墙后要绕过墙头或墙端，比直线距离暗得多
    expect(at(v, L, 11, 6, 8)).toBeLessThan(13 - 3)
  })

  it('跨区块：邻区块边上的灯笼照进来，与灯笼所在区块算出的同一处光级一致', () => {
    const a = flat(0)
    a.set(14, 6, 8, S(B.LANTERN)) // 离东边界 2 格
    const La = volumeBlockLight(a, Blocks, 0, 31)!
    const b = flat(1)
    b.emitters = Int32Array.from([14, 6, 8, 13])
    const Lb = volumeBlockLight(b, Blocks, 0, 31, b.emitters)!
    for (const [x, y, z] of [
      [16, 6, 8],
      [16, 5, 9],
      [16, 7, 6],
    ])
      expect(at(b, Lb, x, y, z)).toBe(at(a, La, x, y, z))
    // 再往里一格，按体内传播继续递减
    expect(at(b, Lb, 17, 6, 8)).toBe(at(a, La, 16, 6, 8) - 1)
  })
})

/**
 * 体外遮挡：同一个场景，一份「整块算」（灯与墙都在体内，精确）做参照；另一份只取东边区块，灯在体外、墙在体外或跨边界，
 * 通过 lightHalo 带上体外遮挡。体块里每一格两边应完全一致。
 */
describe('方块光：体外遮挡（跨区块不漏光）', () => {
  type Scene = (x: number, y: number, z: number) => boolean
  const LAMP: [number, number, number] = [13, 6, 8]
  const build = (vol: VoxelVolume, solid: Scene) => {
    for (let z = vol.oz; z < vol.oz + vol.sz; z++)
      for (let x = vol.ox; x < vol.ox + vol.sx; x++) for (let y = 0; y < 20; y++) if (solid(x, y, z)) vol.set(x, y, z, S(B.STONE))
  }
  const reference = (solid: Scene) => {
    const v = new VoxelVolume(-20, 0, -30, 70, 32, 70)
    build(v, solid)
    v.set(LAMP[0], LAMP[1], LAMP[2], S(B.LANTERN))
    return { v, L: volumeBlockLight(v, Blocks, 0, 31)! }
  }
  const cropped = (solid: Scene) => {
    const b = VoxelVolume.forChunk(1, 0)
    b.data.fill(0)
    build(b, solid)
    b.emitters = Int32Array.from([LAMP[0], LAMP[1], LAMP[2], 13])
    const R = 13
    const x0 = b.ox - R
    const z0 = b.oz - R
    const y0 = LAMP[1] - 13
    const sx = b.sx + 2 * R
    const sz = b.sz + 2 * R
    const sy = 27
    const solidArr = new Uint8Array(sx * sy * sz)
    for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) if (y + y0 >= 0 && solid(x + x0, y + y0, z + z0)) solidArr[(y * sz + z) * sx + x] = 1
    b.lightHalo = { x0, y0: Math.max(0, y0), z0, sx, sy, sz, solid: solidArr }
    if (y0 < 0) {
      // 世界底以下不建 halo 格：截掉负的那几层
      const cut = -y0
      b.lightHalo = { x0, y0: 0, z0, sx, sy: sy - cut, sz, solid: solidArr.slice(cut * sx * sz) }
    }
    return { b, L: volumeBlockLight(b, Blocks, 0, 31, b.emitters) }
  }
  const ground: Scene = (_x, y) => y <= 4
  const compare = (solid: Scene) => {
    const r = reference(solid)
    const c = cropped(solid)
    const diff: string[] = []
    for (let y = 5; y <= 14; y++)
      for (let z = c.b.oz; z < c.b.oz + c.b.sz; z++)
        for (let x = c.b.ox; x < c.b.ox + c.b.sx; x++) {
          const want = r.L[idx(r.v, x, y, z)]
          const got = c.L ? c.L[idx(c.b, x, y, z)] : 0
          if (want !== got) diff.push(`(${x},${y},${z}) 应 ${want} 得 ${got}`)
        }
    return { r, c, diff }
  }

  it('墙在灯所在的区块（体外）：墙后不漏光，与整块算一致', () => {
    const wall: Scene = (x, y, z) => ground(x, y, z) || (x === 14 && y < 20)
    const { r, c, diff } = compare(wall)
    expect(diff.slice(0, 5)).toEqual([])
    expect(r.L[idx(r.v, 16, 6, 8)]).toBe(0)
    expect(c.L ? c.L[idx(c.b, 16, 6, 8)] : 0).toBe(0)
  })

  it('墙跨区块边界：与整块算一致', () => {
    const wall: Scene = (x, y, z) => ground(x, y, z) || ((x === 15 || x === 16) && y < 20 && z !== 30)
    expect(compare(wall).diff.slice(0, 5)).toEqual([])
  })

  it('墙上开门洞：光从门洞照进来，强弱与整块算一致', () => {
    const wall: Scene = (x, y, z) => ground(x, y, z) || (x === 14 && y < 20 && !(z === 8 && y >= 5 && y <= 6))
    const { c, diff } = compare(wall)
    expect(diff.slice(0, 5)).toEqual([])
    expect(c.L![idx(c.b, 15, 6, 8)]).toBeGreaterThan(0)
  })

  it('同一世界格，不同裁剪（相邻两区块）光级相同', () => {
    const wall: Scene = (x, y, z) => ground(x, y, z) || (x === 20 && y < 9 && z >= 2 && z <= 14)
    const r = reference(wall)
    const c = cropped(wall)
    for (const [x, y, z] of [
      [16, 6, 8],
      [21, 6, 8],
      [21, 10, 8],
      [18, 6, 15],
    ])
      expect(c.L![idx(c.b, x, y, z)], `(${x},${y},${z})`).toBe(r.L[idx(r.v, x, y, z)])
  })
})
