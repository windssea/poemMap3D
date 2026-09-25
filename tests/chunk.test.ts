import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { S } from '../src/world/block/BlockState'
import { Chunk } from '../src/world/chunk/Chunk'
import { ChunkSection } from '../src/world/chunk/ChunkSection'
import { blockToChunk, blockToLocal, chunkKey, chunkKeyX, chunkKeyZ, edgeNeighbors } from '../src/world/coordinate/coords'
import { World } from '../src/world/World'

describe('Chunk 坐标', () => {
  it('正负坐标换算', () => {
    expect(blockToChunk(0)).toBe(0)
    expect(blockToChunk(15)).toBe(0)
    expect(blockToChunk(16)).toBe(1)
    expect(blockToChunk(-1)).toBe(-1)
    expect(blockToChunk(-16)).toBe(-1)
    expect(blockToChunk(-17)).toBe(-2)
    expect(blockToLocal(-1)).toBe(15)
    expect(blockToLocal(-16)).toBe(0)
    expect(blockToLocal(17)).toBe(1)
  })

  it('区块键往返', () => {
    for (const [x, z] of [
      [0, 0],
      [-5, 7],
      [300, -250],
      [-32000, 32000],
    ]) {
      const k = chunkKey(x, z)
      expect(chunkKeyX(k)).toBe(x)
      expect(chunkKeyZ(k)).toBe(z)
    }
  })

  it('边缘方块影响相邻区块', () => {
    expect(edgeNeighbors(5, 5)).toEqual([])
    expect(edgeNeighbors(0, 5)).toEqual([{ cx: -1, cz: 0 }])
    expect(edgeNeighbors(15, 31)).toEqual(
      expect.arrayContaining([
        { cx: 1, cz: 1 },
        { cx: 0, cz: 2 },
        { cx: 1, cz: 2 },
      ]),
    )
    expect(edgeNeighbors(-1, 0)).toHaveLength(3)
  })
})

describe('ChunkSection / Chunk', () => {
  it('统一段按需展开并可压缩', () => {
    const s = new ChunkSection(S(B.STONE))
    expect(s.blocks).toBeNull()
    expect(s.get(3, 4, 5)).toBe(B.STONE)
    s.set(1, 1, 1, S(B.DIRT))
    expect(s.blocks).not.toBeNull()
    s.set(1, 1, 1, S(B.STONE))
    s.compact()
    expect(s.blocks).toBeNull()
  })

  it('高度图随放置与移除更新', () => {
    const c = new Chunk(0, 0)
    c.setBlock(2, 70, 3, S(B.GRASS))
    c.setBlock(2, 60, 3, S(B.STONE))
    expect(c.heightmap[3 * 16 + 2]).toBe(70)
    c.setBlock(2, 70, 3, 0)
    expect(c.heightmap[3 * 16 + 2]).toBe(60)
  })

  it('数据往返与哈希', () => {
    const c = new Chunk(3, -2)
    c.setBlock(0, 10, 0, S(B.LOG))
    c.setBlock(15, 200, 15, S(B.SNOW))
    const d = Chunk.fromData(c.toData())
    expect(d.hash()).toBe(c.hash())
    expect(d.getBlock(15, 200, 15)).toBe(B.SNOW)
  })
})

describe('World 跨区块读写', () => {
  it('负坐标与相邻区块', () => {
    const w = new World()
    w.ensureChunk(-1, 0)
    w.ensureChunk(0, 0)
    w.setBlock(-1, 64, 3, S(B.STONE))
    w.setBlock(0, 64, 3, S(B.DIRT))
    expect(w.getBlock(-1, 64, 3)).toBe(B.STONE)
    expect(w.getChunk(-1, 0)!.getBlock(15, 64, 3)).toBe(B.STONE)
    expect(w.getBlock(0, 64, 3)).toBe(B.DIRT)
  })

  it('改动区块边缘时相邻区块被标脏', () => {
    const w = new World()
    w.ensureChunk(0, 0)
    w.ensureChunk(-1, 0)
    const dirty: string[] = []
    w.onDirty = (cx, cz) => dirty.push(`${cx},${cz}`)
    w.setBlock(0, 50, 8, S(B.STONE))
    expect(dirty).toContain('0,0')
    expect(dirty).toContain('-1,0')
  })
})
