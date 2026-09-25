import fs from 'node:fs'
import { LandMask } from '../src/world/generation/geography/LandMask'
import { buildMacroGeography } from '../src/world/generation/geography/MacroGeography'
import { WorldContext } from '../src/world/generation/WorldContext'
import type { PlaceAnchor } from '../src/world/landmark/LandmarkDefinition'

let ctx: WorldContext | null = null

/** 测试共用的完整世界（构建一次） */
export function testWorld(): WorldContext {
  if (ctx) return ctx
  const buf = fs.readFileSync('public/data/landmask.bin')
  const mask = LandMask.decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const data = JSON.parse(fs.readFileSync('public/data/poems.json', 'utf8'))
  const anchors: PlaceAnchor[] = data.places.map((p: { id: string; name: string; lng: number; lat: number; poemIds: string[] }) => ({
    id: p.id,
    name: p.name,
    lng: p.lng,
    lat: p.lat,
    weight: p.poemIds.length,
  }))
  ctx = new WorldContext({ macro: buildMacroGeography(mask), anchors })
  return ctx
}
