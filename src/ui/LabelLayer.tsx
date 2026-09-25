import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { useApp } from '../app/AppStore'
import { useServices } from './ServicesContext'

interface LabelItem {
  key: string
  kind: 'place' | 'geo' | 'rgn'
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

/** 地理与文化区名（全国视角） */
const GEO_LABELS = [
  { name: '长江', lng: 112.9, lat: 29.9, cls: 'jiang' },
  { name: '长江', lng: 106.9, lat: 29.8, cls: 'jiang' },
  { name: '黄河', lng: 111.6, lat: 35.0, cls: 'he' },
  { name: '黄河', lng: 106.5, lat: 38.9, cls: 'he' },
  { name: '万里长城', lng: 115.9, lat: 40.6, cls: 'wall' },
]
const REGIONS = [
  { name: '江南', sub: '吴越', lng: 119.8, lat: 30.1 },
  { name: '中原', sub: '河洛', lng: 113.8, lat: 34.3 },
  { name: '关中', sub: '秦川', lng: 108.6, lat: 34.9 },
  { name: '巴蜀', sub: '天府', lng: 104.8, lat: 30.3 },
  { name: '荆楚', sub: '云梦', lng: 112.6, lat: 30.6 },
  { name: '塞北', sub: '边关', lng: 106, lat: 41.5 },
  { name: '岭南', sub: '南粤', lng: 113.6, lat: 23.6 },
  { name: '齐鲁', sub: '泰岱', lng: 117.8, lat: 36.3 },
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
      name: s.place.name,
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
    REGIONS.forEach((r, i) => out.push({ key: `r-${i}`, kind: 'rgn', name: r.name, cls: 'rgn', priority: 2000 - i, major: true, anchor: null, lng: r.lng, lat: r.lat }))
    for (const it of out) {
      if (!it.anchor && it.lng !== undefined) {
        const v = facade.geoAnchor(it.lng, it.lat!)
        v.y += it.kind === 'rgn' ? 40 : 18
        it.anchor = v
      }
    }
    return out
  }, [aggregator, facade, majorPlaces])

  useEffect(() => {
    const pos = { x: 0, y: 0, depth: 0 }
    let panels: DOMRect[] = []
    let tick = 0
    const sorted = [...items].sort((a, b) => b.priority - a.priority)
    const off = facade.onFrame((f) => {
      if (tick++ % 30 === 0) panels = [...document.querySelectorAll('.chrome')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.width < innerWidth * 0.9)
      const { selected: sel, level: lv } = state.current
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = []
      let shown = 0
      const cap = lv === 'national' ? 16 : lv === 'regional' ? 60 : 10
      const order = sel ? [...sorted.filter((i) => i.placeId === sel), ...sorted.filter((i) => i.placeId !== sel)] : sorted
      let selPos: { x: number; y: number } | null = null
      for (const it of order) {
        const el = refs.current.get(it.key)
        if (!el || !it.anchor) continue
        let on = false
        const isSel = !!sel && it.placeId === sel
        const allow =
          it.kind === 'rgn' ? lv === 'national' : it.kind === 'geo' ? lv !== 'local' : isSel || lv !== 'national' || it.major || shown < 8
        if (allow && facade.project(it.anchor, pos)) {
          const tooFar = it.kind === 'place' && lv === 'local' && pos.depth > f.distance * 2.6 && !isSel
          const h = it.kind === 'rgn' ? 40 : it.name.length * 16 + 34
          const w = it.kind === 'rgn' ? 160 : 34
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
