import { describe, expect, it } from 'vitest'
import { BlockShape } from '../src/world/block/BlockDefinition'
import { BlockRegistry } from '../src/world/block/BlockRegistry'
import { B, Blocks } from '../src/world/block/Blocks'
import { mirrorState, packState, rotateState, stateAxis, stateFacing, stateHalf, stateId, unpackState } from '../src/world/block/BlockState'
import { TEXTURES } from '../src/world/block/BlockTextures'
import { Axis, Direction } from '../src/world/block/Direction'

describe('Block', () => {
  it('每个 B 常量都已注册且 id 唯一', () => {
    const ids = Object.values(B)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(Blocks.has(id)).toBe(true)
    expect(Blocks.all().length).toBe(ids.length)
  })

  it('注册重复 id 会报错', () => {
    const r = new BlockRegistry()
    r.register(Blocks.get(B.STONE))
    expect(() => r.register({ ...Blocks.get(B.DIRT), id: B.STONE })).toThrow()
  })

  it('贴图表不超过一个字节，且方块引用的贴图都存在', () => {
    expect(TEXTURES.length).toBeLessThan(256)
    const keys = new Set<string>(TEXTURES.map((t) => t.key))
    for (const d of Blocks.all()) for (const k of Object.values(d.faces)) expect(keys.has(k)).toBe(true)
  })

  it('状态打包往返一致', () => {
    const p = packState({ id: B.ROOF_GRAY_STAIRS, facing: Direction.East, half: 'top', axis: Axis.Z, variant: 5 })
    const s = unpackState(p)
    expect(s).toEqual({ id: B.ROOF_GRAY_STAIRS, facing: Direction.East, half: 'top', axis: Axis.Z, variant: 5 })
    expect(stateId(p)).toBe(B.ROOF_GRAY_STAIRS)
  })

  it('状态旋转：四次回到原样，朝向顺时针，轴向互换', () => {
    const p = packState({ id: B.LOG, facing: Direction.North, axis: Axis.X })
    const r1 = rotateState(p, 1)
    expect(stateFacing(r1)).toBe(Direction.East)
    expect(stateAxis(r1)).toBe(Axis.Z)
    expect(rotateState(rotateState(r1, 1), 2)).toBe(p)
    expect(stateHalf(r1)).toBe(0)
  })

  it('状态镜像两次还原', () => {
    const p = packState({ id: B.ROOF_GRAY_STAIRS, facing: Direction.East })
    expect(stateFacing(mirrorState(p, 'x'))).toBe(Direction.West)
    expect(mirrorState(mirrorState(p, 'x'), 'x')).toBe(p)
    expect(stateFacing(mirrorState(p, 'z'))).toBe(Direction.East)
  })

  it('形状与渲染属性', () => {
    expect(Blocks.get(B.STONE).shape).toBe(BlockShape.FULL_CUBE)
    expect(Blocks.get(B.STONE).occludesNeighbor).toBe(true)
    expect(Blocks.get(B.ROOF_GRAY_STAIRS).shape).toBe(BlockShape.STAIRS)
    expect(Blocks.get(B.ROOF_GRAY_STAIRS).occludesNeighbor).toBe(false)
    expect(Blocks.get(B.WATER).liquid).toBe(true)
    expect(Blocks.get(B.LEAVES_BROAD).occludesNeighbor).toBe(false)
    expect(Blocks.get(B.TALL_GRASS).replaceable).toBe(true)
    expect(Blocks.get(B.LATTICE_WINDOW).shape).toBe(BlockShape.PANE)
    expect(Blocks.get(B.PILLAR).shape).toBe(BlockShape.POST)
  })
})
