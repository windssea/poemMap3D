import { describe, expect, it } from 'vitest'
import { B } from '../src/world/block/Blocks'
import { analyzeConnectivity } from '../src/world/structure/StructureAnalysis'
import type { VoxelStructure } from '../src/world/structure/VoxelStructure'
import { MAX_TREE_RADIUS, TREE_TYPES, TREES, TreeCache } from '../src/world/vegetation/TreeRegistry'

const forEachTree = (fn: (s: VoxelStructure, label: string) => void) => {
  for (const type of TREE_TYPES) {
    const def = TREES[type]
    for (let v = 0; v < def.variants; v++)
      for (const seed of [1, 7, 42]) for (const height of [def.minHeight, Math.round((def.minHeight + def.maxHeight) / 2), def.maxHeight]) fn(new TreeCache().get(type, v, height, seed % TreeCache.SEED_SLOTS, 0), `${type}#${v} seed ${seed} h ${height}`)
  }
}

describe('Tree', () => {
  it('每棵树只有一个连通块、没有漂浮方块', () => {
    forEachTree((s, label) => {
      const r = analyzeConnectivity(s)
      expect(r.floating, label).toBe(0)
      // 竹丛是多根独立竹竿（地下以竹鞭相连），每根都着地即可
      if (!label.startsWith('bamboo')) expect(r.components, label).toBe(1)
    })
  })

  it('树根在 y = 0，包围盒合理', () => {
    forEachTree((s, label) => {
      const b = s.bounds()
      expect(b.minY, label).toBe(0)
      expect(b.maxY, label).toBeGreaterThan(3)
      expect(b.maxY, label).toBeLessThan(24)
      expect(Math.max(-b.minX, b.maxX, -b.minZ, b.maxZ), label).toBeLessThanOrEqual(MAX_TREE_RADIUS)
      expect(s.get(0, 0, 0) !== 0 || s.blocks.some((x) => x.y === 0), label).toBe(true)
    })
  })

  it('柳：垂枝依附冠团，长短不一', () => {
    for (let seed = 1; seed < 6; seed++) {
      const s = TREES.willow.factory({ variant: 0, seed, height: 12 })
      const leaves = s.blocks.filter((b) => (b.state & 255) === B.LEAVES_WILLOW)
      // 找出垂枝：下方与上方都是柳叶、且处在冠团下缘以下的竖直链
      const chains = new Map<string, number>()
      for (const l of leaves) {
        if (s.get(l.x, l.y + 1, l.z) !== 0 && (s.get(l.x, l.y + 1, l.z) & 255) === B.LEAVES_WILLOW) continue
        let len = 0
        let y = l.y - 1
        while ((s.get(l.x, y, l.z) & 255) === B.LEAVES_WILLOW) {
          len++
          y--
        }
        if (len >= 2) chains.set(`${l.x},${l.z}`, len)
      }
      const lens = [...chains.values()]
      expect(lens.length, `seed ${seed}`).toBeGreaterThan(3)
      expect(new Set(lens).size, `seed ${seed} 垂枝长度应不一`).toBeGreaterThan(1)
      expect(analyzeConnectivity(s).floating).toBe(0)
    }
  })

  it('柳不是「顶部大方块 + 一排等长叶条」：树冠分成多团、有可见枝', () => {
    const s = TREES.willow.factory({ variant: 0, seed: 3, height: 12 })
    const logs = s.blocks.filter((b) => (b.state & 255) === B.LOG)
    const branchLogs = logs.filter((b) => b.x !== 0 || b.z !== 0)
    expect(branchLogs.length).toBeGreaterThan(6)
  })

  it('竹丛：3–7 根竹竿，彼此不重叠，高度差明显', () => {
    for (let seed = 1; seed < 8; seed++) {
      const s = TREES.bamboo.factory({ variant: seed % 3, seed, height: 12 })
      const culms = new Map<string, number>()
      for (const b of s.blocks) if ((b.state & 255) === B.BAMBOO) culms.set(`${b.x},${b.z}`, Math.max(culms.get(`${b.x},${b.z}`) ?? 0, b.y))
      expect(culms.size).toBeGreaterThanOrEqual(3)
      expect(culms.size).toBeLessThanOrEqual(7)
      const hs = [...culms.values()]
      expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThanOrEqual(3)
    }
  })

  it('确定性：同参数同形', () => {
    const a = TREES.broadleaf.factory({ variant: 1, seed: 9, height: 12 })
    const b = TREES.broadleaf.factory({ variant: 1, seed: 9, height: 12 })
    expect(a.count).toBe(b.count)
    expect(a.blocks.map((x) => `${x.x},${x.y},${x.z},${x.state}`).sort()).toEqual(b.blocks.map((x) => `${x.x},${x.y},${x.z},${x.state}`).sort())
  })
})
