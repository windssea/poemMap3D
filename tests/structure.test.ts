import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { S, packState, stateFacing } from '../src/world/block/BlockState'
import { Direction } from '../src/world/block/Direction'
import { buildBuilding, BuildingRegistry } from '../src/world/building/BuildingRegistry'
import { analyzeConnectivity } from '../src/world/structure/StructureAnalysis'
import { PlaceMode, placeStructure, preparePlacement } from '../src/world/structure/StructurePlacer'
import { VoxelStructure } from '../src/world/structure/VoxelStructure'
import { VoxelVolume } from '../src/world/voxel/VoxelVolume'

const sample = () => {
  const s = new VoxelStructure('t')
  s.set(0, 0, 0, S(B.STONE))
  s.set(2, 0, 0, S(B.DIRT))
  s.set(0, 1, 3, packState({ id: B.ROOF_GRAY_STAIRS, facing: Direction.North }))
  return s
}
const sig = (s: VoxelStructure) => s.blocks.map((b) => `${b.x},${b.y},${b.z},${b.state}`).sort()

describe('Structure', () => {
  it('旋转四次还原；旋转一次坐标与朝向一起转', () => {
    const s = sample()
    expect(sig(s.rotate(1).rotate(1).rotate(1).rotate(1))).toEqual(sig(s))
    const r = s.rotate(1)
    expect(r.get(0, 0, 2)).toBe(S(B.DIRT)) // (2,0) → (0,2)：东 → 南
    expect(stateFacing(r.get(-3, 1, 0))).toBe(Direction.East)
  })

  it('镜像两次还原', () => {
    const s = sample()
    expect(sig(s.mirror('x').mirror('x'))).toEqual(sig(s))
    expect(s.mirror('x').get(-2, 0, 0)).toBe(S(B.DIRT))
  })

  it('平移与包围盒', () => {
    const t = sample().translate(5, 2, -1)
    expect(t.bounds()).toEqual({ minX: 5, minY: 2, minZ: -1, maxX: 7, maxY: 3, maxZ: 2 })
  })

  it('跨区块放置：两块相邻体素各写一半，拼起来与整体放置一致', () => {
    const s = buildBuilding('hall', { width: 13, depth: 9 })
    const p = preparePlacement({ id: 'h', structure: s, x: 16, y: 10, z: 8, mode: PlaceMode.Replace, order: 0 })
    const whole = new VoxelVolume(0, 0, 0, 32, 64, 32)
    const left = new VoxelVolume(0, 0, 0, 16, 64, 32)
    const right = new VoxelVolume(16, 0, 0, 16, 64, 32)
    placeStructure(whole, p)
    placeStructure(left, p)
    placeStructure(right, p)
    for (let y = 0; y < 64; y++)
      for (let z = 0; z < 32; z++)
        for (let x = 0; x < 32; x++) expect(whole.get(x, y, z)).toBe(x < 16 ? left.get(x, y, z) : right.get(x, y, z))
  })

  it('所有建筑都是一个连通整体', () => {
    for (const id of BuildingRegistry.keys()) {
      const r = analyzeConnectivity(buildBuilding(id, {}))
      expect(r.floating, id).toBe(0)
    }
    /* 名楼的各种形制、重檐亭 */
    const variants = [
      { plan: 'cross' as const, top: 'cross' as const, levels: 3, width: 11 },
      { top: 'wudian' as const, levels: 3, width: 9, base: 'wall' as const, terrace: 4 },
      { top: 'cuanjian' as const, levels: 3, width: 13 },
      { levels: 2, width: 9 },
    ]
    for (const p of variants) expect(analyzeConnectivity(buildBuilding('grandTower', p)).floating, JSON.stringify(p)).toBe(0)
    expect(analyzeConnectivity(buildBuilding('pavilion', { double: true, width: 7, lanterns: true })).floating).toBe(0)
  })

  it('树（Soft 放置）不覆盖建筑', () => {
    const vol = new VoxelVolume(0, 0, 0, 16, 32, 16)
    vol.set(5, 5, 5, S(B.PLASTER))
    const tree = new VoxelStructure('tree')
    tree.set(0, 0, 0, S(B.LEAVES_BROAD))
    placeStructure(vol, preparePlacement({ id: 't', structure: tree, x: 5, y: 5, z: 5, mode: PlaceMode.Soft, order: 0 }))
    expect(vol.get(5, 5, 5)).toBe(S(B.PLASTER))
  })
})
