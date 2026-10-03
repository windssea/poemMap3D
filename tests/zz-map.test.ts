import fs from 'node:fs'
import { it } from 'vitest'
import { testWorld } from './helpers'
it('map', () => {
  const w = testWorld()
  const lm = w.landmarks.landmarks.find((l) => l.def.name === (process.env.LM ?? '岳阳楼') || l.def.poetryPlaceId === process.env.LM)!
  const out: string[] = [`center ${lm.x},${lm.z} level ${lm.level}; 每格 2 块; 列 x=-50..+30, 行 z=-36..+36; # 水 B 建筑 T 树 o 中心; 数字=地面比基准高(+)/低(-)`]
  for (const p of lm.placements) out.push(`${p.id} [${p.world.minX - lm.x},${p.world.maxX - lm.x}]x[${p.world.minZ - lm.z},${p.world.maxZ - lm.z}] y${p.world.minY}-${p.world.maxY}`)
  const R = 60
  const trees = [...w.trees.collect(lm.x - R, lm.z - R, lm.x + R, lm.z + R), ...w.landmarks.treesNear(lm.x - R, lm.z - R, lm.x + R, lm.z + R)]
  for (let dz = -36; dz <= 36; dz += 2) {
    let row = (dz + '').padStart(4) + ' '
    for (let dx = -50; dx <= 30; dx += 2) {
      const x = lm.x + dx, z = lm.z + dz
      if (dx === 0 && dz === 0) { row += 'o'; continue }
      const inB = lm.placements.some((p) => x >= p.world.minX && x <= p.world.maxX && z >= p.world.minZ && z <= p.world.maxZ)
      const c = w.terrain.column(x, z)
      const t = trees.some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.z - z) <= 1)
      row += inB ? 'B' : c.waterY >= 0 && c.height < c.waterY ? '#' : t ? 'T' : String(Math.max(-9, Math.min(9, Math.round(c.height - lm.level)))).slice(-1)
    }
    out.push(row)
  }
  const c0 = w.terrain.column(lm.x - 30, lm.z)
  out.push(`water level at -30: ${c0.waterY} ground ${c0.height}`)
  fs.writeFileSync('map.txt', out.join('\n'))
})
