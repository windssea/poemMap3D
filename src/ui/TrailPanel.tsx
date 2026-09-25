import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useApp } from '../app/AppStore'
import { cnum } from './cnum'
import { useServices } from './ServicesContext'
import { VerseScroll } from './VerseScroll'

/** 诗人足迹：挑选诗人、年谱面板、地图上的站点标记 / 笔头 / 说明卡与题诗 */
export function TrailPanel() {
  const { trails, facade, store, director } = useServices()
  const state = useApp((s) => s.trailState)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('li.cur')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [state.prog])

  if (state.picking)
    return (
      <div className="trailp mini" style={{ bottom: 'auto' }}>
        <div className="tr-h">
          <div className="tr-seal">足迹</div>
          <div>
            <div className="tr-n">诗人足迹</div>
            <div className="tr-y">择一位诗人，看他一生的行迹与诗</div>
          </div>
          <button className="tr-x" aria-label="关闭" onClick={() => store.set({ trailState: { ...state, picking: false } })}>
            ×
          </button>
        </div>
        <div className="poets" style={{ background: 'var(--c-paper)' }}>
          {trails.all().map((t) => (
            <button key={t.poet} onClick={() => facade.showPoetTrail(t.poet)}>
              <i style={{ background: t.color }} />
              <b>{t.poet}</b>
              <span>
                {t.years} · {t.stops.length} 站
              </span>
            </button>
          ))}
        </div>
      </div>
    )
  if (!state.poet) return null
  const t = trails.get(state.poet)
  if (!t) return null
  const done = state.phase === 'done'
  const N = t.stops.length
  return (
    <>
      <aside className={`trailp ${done ? '' : 'mini'}`} style={{ ['--c' as string]: t.color }} aria-label="诗人足迹">
        <div className="tr-h">
          <div className="tr-seal">足迹</div>
          <div>
            <div className="tr-n">{t.poet}</div>
            <div className="tr-y">
              {t.years} · {N} 站
            </div>
            <div className="tr-s">{done ? `全程 ${cnum(N)} 站` : `第 ${cnum(state.prog + 1)} 站 / 共 ${cnum(N)} 站 · ${t.stops[state.prog].place}`}</div>
          </div>
          <button className="tr-x" aria-label="关闭" onClick={() => facade.hidePoetTrail()}>
            ×
          </button>
        </div>
        <ol className="tr-list" ref={listRef}>
          {t.stops.map((s, i) => (
            <li key={i} className={`${i <= state.prog || done ? 'done' : ''} ${i === state.prog && !done ? 'cur' : ''}`} onClick={() => director.goto(i)}>
              <b>{s.year}</b>
              <div>
                <span>{s.place}</span>
                <p>{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="tr-b">
          <button onClick={() => director.overview()}>全程</button>
          <button onClick={() => director.replay()}>重播</button>
        </div>
      </aside>
      <TrailOverlay />
    </>
  )
}

/** 地图上的足迹叠加层：逐帧投影，直接写 transform，不触发 React 重渲染 */
function TrailOverlay() {
  const { director, facade, poetry } = useServices()
  const state = useApp((s) => s.trailState)
  const layer = useRef<HTMLDivElement>(null)
  const rt = director.runtime
  const marks = useMemo(() => {
    if (!rt) return []
    const by = new Map<string, { name: string; years: string[]; idx: number[]; p: THREE.Vector3 }>()
    rt.trail.stops.forEach((s, i) => {
      const m = by.get(s.place)
      if (m) {
        m.years.push(s.year)
        m.idx.push(i)
      } else by.set(s.place, { name: s.place, years: [s.year], idx: [i], p: rt.stops[i].clone().setY(rt.stops[i].y + 6) })
    })
    return [...by.values()]
  }, [rt])

  useEffect(() => {
    const el = layer.current
    if (!el || !rt) return
    const p = { x: 0, y: 0, depth: 0 }
    const tmp = new THREE.Vector3()
    return facade.onFrame(() => {
      const r = director.runtime
      if (!r) return
      const doneIdx = r.phase === 'done' ? r.stops.length - 1 : r.prog
      const pts = el.querySelectorAll<HTMLDivElement>('.tr-pt')
      marks.forEach((m, k) => {
        const node = pts[k]
        if (!node) return
        const on = m.idx[0] <= doneIdx && facade.project(m.p, p)
        node.classList.toggle('on', on)
        node.classList.toggle('cur', on && m.idx.includes(doneIdx) && r.phase !== 'done')
        if (on) node.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
      })
      const head = el.querySelector<HTMLDivElement>('.tr-head')
      if (head) {
        const moving = r.phase === 'move' && facade.project(facade.trailHead(r.frac), p)
        head.style.opacity = moving ? '1' : '0'
        if (moving) head.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
      }
      const card = el.querySelector<HTMLDivElement>('.tr-card')
      if (card) {
        const i = r.phase === 'stay' ? r.prog : r.phase === 'paused' ? r.pauseI : r.phase === 'move' && r.clock < r.segDur * 0.4 ? r.prog : -1
        card.style.opacity = i >= 0 ? '1' : '0'
        if (i >= 0) {
          const a = r.phase === 'move' ? facade.trailHead(r.frac) : tmp.copy(r.stops[i]).setY(r.stops[i].y + 4)
          if (facade.project(a, p)) {
            const sy = Math.min(Math.max(p.y, 150), innerHeight - 24)
            const wantL = p.x > innerWidth * 0.62
            card.classList.toggle('l', wantL)
            card.style.transform = `translate3d(${p.x.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`
          }
          if (card.dataset.i !== String(i)) {
            card.dataset.i = String(i)
            const s = r.trail.stops[i]
            const tc = document.createElement('div')
            tc.className = 'tc'
            for (const [tag, text] of [['b', s.year], ['span', s.place], ['p', s.note]] as const) {
              const e = document.createElement(tag)
              e.textContent = text
              tc.appendChild(e)
            }
            card.replaceChildren(tc)
          }
        }
      }
    })
  }, [rt, marks, facade, director])

  if (!rt) return null
  const verse = state.verseIdx >= 0 ? rt.verses[state.verseIdx] : null
  const vStop = state.verseIdx >= 0 ? rt.trail.stops[state.verseIdx] : null
  return (
    <>
      <div className="trail-layer" ref={layer} style={{ ['--c' as string]: rt.trail.color }}>
        {marks.map((m) => (
          <div className="tr-pt" key={m.name}>
            <i />
            <span>
              {m.name}
              <em>{m.years.join(' · ')}</em>
            </span>
          </div>
        ))}
        <div className="tr-head" />
        <div className="tr-card" />
      </div>
      {verse && vStop && poetry.get(verse.id) && <VerseScroll key={`${verse.id}-${state.verseIdx}`} poem={verse} place={`${vStop.year}年 · ${vStop.place}`} />}
    </>
  )
}
