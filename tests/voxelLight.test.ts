import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { S } from '../src/world/block/BlockState'
import { Chunk } from '../src/world/chunk/Chunk'
import { computeChunkLight } from '../src/world/light/VoxelLight'

/** 一块平地（y ≤ 10 为石），上面搭一个 5×5 的石顶棚（y = 14），棚下中间挂一盏灯笼 */
function scene(): Chunk {
  const c = new Chunk(0, 0)
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 0; y <= 10; y++) c.setBlock(x, y, z, S(B.STONE))
  for (let z = 5; z <= 9; z++) for (let x = 5; x <= 9; x++) c.setBlock(x, 14, z, S(B.STONE))
  c.setBlock(7, 13, 7, S(B.LANTERN))
  return c
}

describe('体素光照（0–15 天空光 / 方块光）', () => {
  const L = computeChunkLight(scene())

  it('露天为 15，实心里为 0', () => {
    expect(L.sky(1, 11, 1)).toBe(15)
    expect(L.sky(1, 5, 1)).toBe(0)
  })

  it('棚下的天空光从棚边向里逐格变暗，但不是全黑', () => {
    const edge = L.sky(5, 12, 7)
    const mid = L.sky(7, 12, 7)
    expect(edge).toBeGreaterThan(mid)
    expect(mid).toBeGreaterThan(8)
    expect(mid).toBeLessThan(15)
  })

  it('灯笼是 14 级方块光，向外逐格衰减', () => {
    expect(L.block(7, 13, 7)).toBe(14)
    expect(L.block(7, 12, 7)).toBe(13)
    expect(L.block(7, 11, 7)).toBe(12)
    expect(L.block(3, 11, 7)).toBeLessThan(L.block(6, 11, 7))
  })

  it('全暗的段不分配', () => {
    expect(L.allocatedSections).toBeLessThanOrEqual(2)
  })
})
