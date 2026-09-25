import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

interface LabelItem {
  key: string
  kind: 'place' | 'geo'
  name: string
  cls: string
  placeId?: string
  count?: number
  priority: number
  major: boolean
  anchor: THREE.Vector3 | null
  lng?: number
  lat?: number
}

/** 江河与长城的名签（全国、区域视角） */
const GEO_LABELS = [
  { name: '长江', lng: 112.9, lat: 29.9, cls: 'jiang' },
  { name: '长江', lng: 106.9, lat: 29.8, cls: 'jiang' },
  { name: '黄河', lng: 111.6, lat: 35.0, cls: 'he' },
  { name: '黄河', lng: 106.5, lat: 38.9, cls: 'he' },
  { name: '万里长城', lng: 115.9, lat: 40.6, cls: 'wall' },
]
/**
 * 地名签：三级显示（全国 / 区域 / 地点）、屏幕矩形避让（彼此之间与界面面板）、选中聚焦。
 * React 只创建一次 DOM，逐帧位置由引擎的帧事件直接写 transform，不触发 React 重渲染。
 */
export function LabelLayer() {
  const { facade, aggregator, navigation, majorPlaces } = useServices()
  const selected = useApp((s) => s.selectedPlaceId)
  const level = useApp((s) => s.cameraLevel)
  const tourActive = useApp((s) => s.tourState.active)
  const refs = useRef(new Map<string, HTMLDivElement>())
  const state = useRef({ selected, level, tourActive })
  state.current = { selected, level, tourActive }

  const items = useMemo<LabelItem[]>(() => {
    const out: LabelItem[] = aggregator.all().map((s) => ({
      key: `p-${s.place.id}`,
      kind: 'place',
      // 名楼名胜以楼名为签（江楼 → 岳阳楼，石头驿 → 滕王阁）
      name: facade.landmarkName(s.place.id) ?? s.place.name,
      cls: majorPlaces.has(s.place.id) ? 'major' : '',
      placeId: s.place.id,
      count: s.poems.length,
      priority: s.priority,
      major: majorPlaces.has(s.place.id),
      anchor: facade.placeAnchor(s.place.id),
      lng: s.place.lng,
      lat: s.place.lat,
    }))
    GEO_LABELS.forEach((g, i) => out.push({ key: `g-${i}`, kind: 'geo', name: g.name, cls: `geo ${g.cls}`, priority: 1000 - i, major: true, anchor: null, lng: g.lng, lat: g.lat }))
    for (const it of out) {
      if (!it.anchor && it.lng !== undefined) {
        const v = facade.geoAnchor(it.lng, it.lat!)
        v.y += 18
        it.anchor = v
      }
    }
    return out
  }, [aggregator, facade, majorPlaces])

  /* 光标指到的地点：地名签浮起高亮 */
  useEffect(
    () =>
      facade.onHoverPlace((id) => {
        for (const [k, el] of refs.current) el.classList.toggle('hov', !!id && k === `p-${id}`)
      }),
    [facade],
  )

  useEffect(() => {
    const pos = { x: 0, y: 0, depth: 0 }
    let panels: DOMRect[] = []
    let tick = 0
    const sorted = [...items].sort((a, b) => b.priority - a.priority)
    /* 遮挡：每帧轮流检查几个地名签（射线穿过山体或近处建筑就藏起来） */
    const occluded = new Map<string, boolean>()
    let occIdx = 0
    const lv0 = () => state.current.level
    const off = facade.onFrame((f) => {
      if (lv0() !== 'national')
        for (let k = 0; k < 4 && sorted.length; k++) {
          const it = sorted[occIdx++ % sorted.length]
          if (it.anchor && it.kind === 'place') occluded.set(it.key, facade.isOccluded(it.anchor))
        }
      if (tick++ % 30 === 0) panels = [...document.querySelectorAll('.chrome')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.width < innerWidth * 0.9)
      const { selected: sel, level: lv } = state.current
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
      let shown = 0
      const cap = lv === 'national' ? 16 : lv === 'regional' ? 36 : 10
      const order = sel ? [...sorted.filter((i) => i.placeId === sel), ...sorted.filter((i) => i.placeId !== sel)] : sorted
      let selPos: { x: number; y: number } | null = null
      for (const it of order) {
        const el = refs.current.get(it.key)
        if (!el || !it.anchor) continue
        let on = false
        const isSel = !!sel && it.placeId === sel
        const allow =
          it.kind === 'geo' ? lv !== 'local' : isSel || lv !== 'national' || it.major || shown < 8
        if (allow && facade.project(it.anchor, pos)) {
          // 太远的不显示：近看只留镜头附近的，区域视角也收一收；被遮挡的不显示
          const farLimit = lv === 'local' ? Math.max(140, f.distance * 1.7) : lv === 'regional' ? Math.max(700, f.distance * 2.2) : Infinity
          const tooFar = it.kind === 'place' && !isSel && (pos.depth > farLimit || (lv !== 'national' && occluded.get(it.key) === true))
          const h = it.name.length * 16 + 34
          const w = 34
          const r = { x0: pos.x - w / 2, y0: pos.y - h, x1: pos.x + w / 2, y1: pos.y + 4 }
          const inView = pos.x > -20 && pos.y > 10 && pos.x < innerWidth + 20 && pos.y < innerHeight + 10
          const hit = placed.some((p) => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)
          const underPanel = panels.some((p) => r.x0 < p.right && r.x1 > p.left && r.y0 < p.bottom && r.y1 > p.top)
          const nearSel = !isSel && selPos && Math.hypot(pos.x - selPos.x, pos.y - selPos.y) < 70
          if (inView && !tooFar && (isSel || (!hit && !underPanel && !nearSel && (it.kind !== 'place' || shown < cap)))) {
            on = true
            placed.push(r)
            if (it.kind === 'place') shown++
            if (isSel) selPos = { x: pos.x, y: pos.y }
            el.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0)`
          }
        }
        el.classList.toggle('on', on)
        el.classList.toggle('sel', isSel)
        el.classList.toggle('dim', !!sel && !isSel && it.kind === 'place')
      }
    })
    return off
  }, [items, facade])

  return (
    <div className={`labels ${tourActive ? 'touring' : ''}`}>
      {items.map((it) => (
        <div
          key={it.key}
          className={`lbl ${it.cls}`}
          ref={(el) => {
            if (el) refs.current.set(it.key, el)
            else refs.current.delete(it.key)
          }}
        >
          <div className="in" onClick={() => it.placeId && navigation.selectPlace(it.placeId)} title={it.kind === 'place' ? `${it.name} · ${it.count} 首` : undefined}>
            <span>{it.name}</span>
            {it.kind === 'place' && it.count! > 1 && <b>{it.count}</b>}
            {it.kind === 'place' && <i className="dot" />}
          </div>
        </div>
      ))}
    </div>
  )
}
