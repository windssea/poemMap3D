import { describe, expect, it } from 'vitest'
import { BlockRenderLayer } from '../src/world/block/BlockDefinition'
import { B } from '../src/world/block/Blocks'
import { S, packState } from '../src/world/block/BlockState'
import { Direction } from '../src/world/block/Direction'
import { meshVolume } from '../src/world/voxel/VoxelMesher'
import { VoxelVolume } from '../src/world/voxel/VoxelVolume'

const vol = () => new VoxelVolume(-1, 0, -1, 18, 32, 18)
const quads = (r: ReturnType<typeof meshVolume>, layer: number) => r.layers[layer].indexCount / 6

describe('VoxelMesher', () => {
  it('单个方块 6 个面', () => {
    const v = vol()
    v.set(4, 10, 4, S(B.STONE))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Solid)).toBe(6)
    expect(r.layers[BlockRenderLayer.Solid].vertexCount).toBe(24)
  })

  it('相邻两块：内部面剔除，贪心合并成 6 个面', () => {
    const v = vol()
    v.set(4, 10, 4, S(B.STONE))
    v.set(5, 10, 4, S(B.STONE))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Solid)).toBe(6)
  })

  it('不同贴图的相邻块不合并，但内部面仍剔除', () => {
    const v = vol()
    v.set(4, 10, 4, S(B.STONE))
    v.set(5, 10, 4, S(B.COBBLE))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Solid)).toBe(10)
  })

  it('贪心平面：8×8 的一层石板顶面只有 1 个四边形', () => {
    const v = vol()
    for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) v.set(x, 10, z, S(B.STONE))
    const r = meshVolume(v)
    // 顶 1 + 底 1 + 四周各 1
    expect(quads(r, BlockRenderLayer.Solid)).toBe(6)
  })

  it('透明邻居（树叶、水）不剔除实心面', () => {
    const v = vol()
    v.set(4, 10, 4, S(B.STONE))
    v.set(5, 10, 4, S(B.LEAVES_BROAD))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Solid)).toBe(6)
    // 树叶紧贴石头那一面被剔除
    expect(quads(r, BlockRenderLayer.Cutout)).toBe(5)
  })

  it('相邻树叶互相剔除', () => {
    const v = vol()
    v.set(4, 10, 4, S(B.LEAVES_BROAD))
    v.set(5, 10, 4, S(B.LEAVES_BROAD))
    expect(quads(meshVolume(v), BlockRenderLayer.Cutout)).toBe(6)
  })

  it('外边一圈只提供邻居，不生成网格', () => {
    const v = vol()
    v.set(-1, 10, 4, S(B.STONE))
    v.set(0, 10, 4, S(B.STONE))
    const r = meshVolume(v)
    // 只有 x=0 这块出面，且朝 -X 的面被外边方块挡住
    expect(quads(r, BlockRenderLayer.Solid)).toBe(5)
  })

  it('AO：地面上紧贴墙角的顶面顶点变暗', () => {
    const v = vol()
    for (let x = 0; x < 4; x++) for (let z = 0; z < 4; z++) v.set(x, 10, z, S(B.STONE))
    v.set(1, 11, 1, S(B.STONE))
    const r = meshVolume(v)
    const ao = r.layers[BlockRenderLayer.Solid].ao
    expect(Math.min(...ao)).toBeLessThan(3)
    expect(Math.max(...ao)).toBe(3)
  })

  it('水面：顶面低 2/16，放在半透明层', () => {
    const v = vol()
    v.set(3, 10, 3, S(B.STONE))
    v.set(3, 11, 3, S(B.WATER))
    const r = meshVolume(v)
    const t = r.layers[BlockRenderLayer.Translucent]
    expect(t.vertexCount).toBeGreaterThan(0)
    let maxY = 0
    for (let i = 1; i < t.positions.length; i += 3) maxY = Math.max(maxY, t.positions[i] / 16)
    expect(maxY).toBeCloseTo(11 + 14 / 16)
  })

  it('楼梯、半砖、十字草在对应层', () => {
    const v = vol()
    v.set(2, 10, 2, packState({ id: B.ROOF_GRAY_STAIRS, facing: Direction.North }))
    v.set(4, 10, 2, S(B.ROOF_GRAY_SLAB))
    v.set(6, 10, 2, S(B.TALL_GRASS))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Solid)).toBe(6 + 5 + 6)
    // 草等地被在 Plant 层（不投影），树叶仍在 Cutout 层
    expect(quads(r, BlockRenderLayer.Plant)).toBe(2)
    expect(quads(r, BlockRenderLayer.Cutout)).toBe(0)
  })

  it('灯笼额外输出光晕到效果层', () => {
    const v = vol()
    v.set(2, 10, 2, S(B.LANTERN))
    const r = meshVolume(v)
    expect(quads(r, BlockRenderLayer.Effect)).toBe(6)
  })
})
