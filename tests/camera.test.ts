import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { designCamera } from '../src/world/landmark/CameraDesigner'
import { testWorld } from './helpers'

describe('地点机位', () => {
  const w = testWorld()
  it('每个有诗的地点都有地标可飞，机位离地足够、设计开销小', () => {
    const t0 = performance.now()
    let n = 0
    const bad: string[] = []
    const seen = new Set<number>()
    for (const lm of w.landmarks.landmarks) {
      if (!lm.def.id.startsWith('place-') || seen.has(lm.index)) continue
      seen.add(lm.index)
      const d = designCamera(lm, w.terrain, w.trees)
      const p = d.preset
      const cp = Math.cos(p.pitch)
      const cx = lm.x + Math.sin(p.yaw) * cp * p.distance
      const cz = lm.z + Math.cos(p.yaw) * cp * p.distance
      const cy = d.targetY + Math.sin(p.pitch) * p.distance
      const s = w.terrain.sample(Math.floor(cx), Math.floor(cz))
      if (cy - Math.max(s.surfaceY, s.waterY) < 10) bad.push(`${lm.def.name} 离地 ${Math.round(cy - s.surfaceY)}`)
      n++
    }
    const avg = (performance.now() - t0) / Math.max(1, n)
    expect(bad, bad.join('；')).toEqual([])
    expect(avg).toBeLessThan(120)
  })
  it('所有诗词地点都能找到地标', () => {
    const places: { id: string; name: string }[] = JSON.parse(fs.readFileSync('public/data/poems.json', 'utf8')).places
    const missing = places.filter((a) => !w.landmarks.byPlaceId(a.id)).map((a) => a.name)
    expect(missing, missing.join('、')).toEqual([])
  })
})
