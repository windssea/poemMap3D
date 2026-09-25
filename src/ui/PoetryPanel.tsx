import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../app/AppStore'
import { isMasterpiece, type Poem } from '../features/poetry/types'
import { cnum } from './cnum'
import { useServices } from './ServicesContext'

/**
 * 诗目（竖排目录、锦边纸笺，贴在地点旁、引线指向地点）与诗卷（右起展开的手卷）。
 * 一处只有一首诗时点地名直接展卷；多首先列诗目。
 */
export function PoetryPanel() {
  const panel = useApp((s) => s.panelState)
  const tourActive = useApp((s) => s.tourState.active)
  const trail = useApp((s) => s.trailState.poet)
  const hidden = tourActive || !!trail
  return (
    <>
      <PlaceList open={panel === 'place' && !hidden} />
      <HandScroll open={panel === 'poem' && !hidden} />
    </>
  )
}

function PlaceList({ open }: { open: boolean }) {
  const { aggregator, navigation, facade } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const ref = useRef<HTMLDivElement>(null)
  const summary = placeId ? aggregator.get(placeId) : undefined

  /* 贴在地点旁：镜头飞行时不跟，落定后取整像素摆一次；用户转镜头时位移超过 1 像素才动，不抖 */
  useEffect(() => {
    if (!open || !placeId) return
    const anchor = facade.placeAnchor(placeId) ?? (summary ? facade.geoAnchor(summary.place.lng, summary.place.lat) : null)
    if (!anchor) return
    const p = { x: 0, y: 0, depth: 0 }
    let last: { x: number; y: number } | null = null
    return facade.onFrame(() => {
      const el = ref.current
      if (!el || innerWidth <= 760) return
      if (facade.isFlying()) {
        el.style.opacity = '0'
        last = null
        return
      }
      el.style.opacity = ''
      if (!facade.project(anchor, p)) return
      const w = el.offsetWidth
      const h = el.offsetHeight
      const gap = 44
      const side = p.x + gap + w < innerWidth - 16 ? 'r' : 'l'
      const x = Math.round(Math.min(Math.max(side === 'r' ? p.x + gap : p.x - gap - w, 16), innerWidth - w - 16))
      const y = Math.round(Math.min(Math.max(p.y - h * 0.35, 76), innerHeight - h - 84))
      if (last && Math.abs(last.x - x) < 1 && Math.abs(last.y - y) < 1) return
      last = { x, y }
      el.classList.toggle('r', side === 'r')
      el.classList.toggle('l', side === 'l')
      el.style.setProperty('--ly', `${Math.min(Math.max(p.y - y, 24), h - 24)}px`)
      el.style.transform = `translate(${x}px, ${y}px)`
    })
  }, [open, placeId, facade, summary])

  if (!summary) return <div className="plist" ref={ref} />
  return (
    <div className={`plist ${open ? 'on' : ''}`} ref={ref} role="dialog" aria-label="此处诗目">
      <i className="lead" />
      <div className="pl-paper">
        <i className="c c1" />
        <i className="c c2" />
        <i className="c c3" />
        <i className="c c4" />
        <div className="pl-head">
          <div className="sl">诗目</div>
          <div>
            <div className="pl-n">{summary.place.name}</div>
            <div className="pl-r">
              {summary.place.region} · {cnum(summary.poems.length)}首
            </div>
          </div>
        </div>
        <ol className="plo">
          {summary.poems.map((q, n) => (
            <li key={q.id}>
              <button onClick={() => navigation.selectPoem(q.id, false)}>
                <span className="no">{cnum(n + 1)}</span>
                <span className="t">
                  {q.title}
                  {isMasterpiece(q) && <i className="mp">名篇</i>}
                </span>
                <span className="a">
                  {q.dynasty} · {q.author}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <button className="xbtn" aria-label="关闭" onClick={() => navigation.selectPlace(null)}>
        ×
      </button>
    </div>
  )
}

function HandScroll({ open }: { open: boolean }) {
  const { aggregator, poetry, navigation, trails, facade } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const poemId = useApp((s) => s.selectedPoemId)
  const root = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'off' | 'unroll' | 'on' | 'rollup'>('off')
  const [shown, setShown] = useState<Poem | null>(null)
  const summary = placeId ? aggregator.get(placeId) : undefined
  const poem = poemId ? poetry.get(poemId) : null
  if (poem && poem !== shown && open) setShown(poem)

  /* 展开 / 收卷动画 */
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    el.style.setProperty('--sw', `${el.querySelector('.strip')?.clientWidth ?? 900}px`)
    if (open) setPhase((p) => (p === 'on' || p === 'unroll' ? p : 'unroll'))
    else setPhase((p) => (p === 'off' ? p : 'rollup'))
  }, [open])
  useEffect(() => {
    if (phase === 'rollup') {
      const t = setTimeout(() => setPhase('off'), 620)
      return () => clearTimeout(t)
    }
  }, [phase])
  useEffect(() => {
    if (track.current) track.current.scrollLeft = 0
  }, [shown])

  /* 滚轮横读、按住拖动；Esc 收卷 */
  useEffect(() => {
    const t = track.current
    if (!t) return
    const wheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        t.scrollLeft -= e.deltaY
        e.preventDefault()
      }
    }
    let drag: { x: number; s: number } | null = null
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      drag = { x: e.clientX, s: t.scrollLeft }
      t.classList.add('drag')
      t.setPointerCapture(e.pointerId)
    }
    const move = (e: PointerEvent) => {
      if (drag) t.scrollLeft = drag.s - (e.clientX - drag.x)
    }
    const up = () => {
      drag = null
      t.classList.remove('drag')
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) navigation.selectPlace(null)
    }
    t.addEventListener('wheel', wheel, { passive: false })
    t.addEventListener('pointerdown', down)
    t.addEventListener('pointermove', move)
    t.addEventListener('pointerup', up)
    t.addEventListener('pointercancel', up)
    addEventListener('keydown', key)
    return () => {
      t.removeEventListener('wheel', wheel)
      t.removeEventListener('pointerdown', down)
      t.removeEventListener('pointermove', move)
      t.removeEventListener('pointerup', up)
      t.removeEventListener('pointercancel', up)
      removeEventListener('keydown', key)
    }
  }, [open, navigation])

  const q = shown
  const list = summary?.poems ?? []
  const idx = q ? list.findIndex((x) => x.id === q.id) : -1
  const step = (d: number) => {
    if (idx < 0 || !list.length) return
    navigation.selectPoem(list[(idx + d + list.length) % list.length].id, false)
  }
  const author = q ? poetry.author(q.author) : undefined
  const famous = new Set(q?.fame ? Array.from({ length: q.fame.count }, (_, i) => q.fame!.line + i) : [])
  const cls = phase === 'off' ? '' : `on ${phase === 'unroll' ? 'unroll' : phase === 'rollup' ? 'rollup' : ''}`

  return (
    <>
      <div className={`veil ${open ? 'on' : ''}`} onClick={() => navigation.selectPlace(null)} />
      <div className={`hscroll ${cls}`} ref={root} aria-hidden={!open} aria-label="诗卷" role="dialog" onAnimationEnd={(e) => e.target === e.currentTarget.querySelector('.strip') && phase === 'unroll' && setPhase('on')}>
        <div className="roller" />
        <div className="strip">
          <div className="track" ref={track}>
            {q && summary && (
              <>
                <div className="seg silk">
                  <div className="qian">
                    {q.title}
                    <em />
                  </div>
                </div>
                <div className="seg gs" />
                <div className="seg paper yin">
                  <div className="yn" style={[...summary.place.name].length > 4 ? { fontSize: 40 } : undefined}>
                    {summary.place.name}
                  </div>
                  <div className="yr">{summary.place.region.replace(/\s*·\s*/g, '·')}</div>
                  <div className="ys">山河诗卷</div>
                </div>
                <div className="seg gs" />
                <div className="seg paper core">
                  <div className="cv">
                    <h2 className="pt">{q.title}</h2>
                    <div className="pa">
                      <em>〔{q.dynasty}〕</em>
                      {q.author}
                      {isMasterpiece(q) && <i className="mp">名篇</i>}
                    </div>
                    {q.preface && <div className="ppr">{q.preface}</div>}
                    {q.lines.map((l, i) => (
                      <p key={i} className={famous.has(i) ? 'fl' : undefined}>
                        {l}
                      </p>
                    ))}
                    <div className="seal2">
                      <span>{q.author}</span>
                    </div>
                  </div>
                </div>
                <div className="seg gs" />
                <div className="seg old ba">
                  {q.translation && (
                    <>
                      <div className="bt">译文</div>
                      <p>{q.translation}</p>
                    </>
                  )}
                  {q.appreciation && (
                    <>
                      <div className="bt">赏析</div>
                      <p>{q.appreciation}</p>
                    </>
                  )}
                  {q.origin && (
                    <>
                      <div className="bt">写于{summary.place.name}</div>
                      <p>{q.origin}</p>
                    </>
                  )}
                  {q.story && (
                    <>
                      <div className="bt">诗话</div>
                      <p>{q.story}</p>
                    </>
                  )}
                  {q.notes && q.notes.length > 0 && (
                    <>
                      <div className="bt">注释</div>
                      {q.notes.map((n) => (
                        <div className="nt" key={n.term}>
                          <b>{n.term}</b>：{n.gloss}
                        </div>
                      ))}
                    </>
                  )}
                  {author?.bio && (
                    <>
                      <div className="bt">
                        {q.author}
                        {author.years ? `　${author.years}` : ''}
                      </div>
                      <p>{author.bio}</p>
                    </>
                  )}
                  {q.tags.length > 0 && (
                    <div className="tags">
                      {q.tags.map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="end">山河诗卷　敬录</div>
                </div>
                <div className="seg gs" />
                <div className="seg silk" />
              </>
            )}
          </div>
        </div>
        <div className="stick">
          <i className="band" />
          <i className="jade" />
        </div>
      </div>
      <div className={`sbar ${open ? 'on' : ''}`}>
        {list.length > 1 && <button onClick={() => step(-1)}>‹ 上一首</button>}
        {list.length > 1 && <button onClick={() => navigation.closePanel()}>诗目</button>}
        {list.length > 1 && (
          <span className="cnt">
            {cnum(idx + 1)} / {cnum(list.length)}
          </span>
        )}
        {list.length > 1 && <button onClick={() => step(1)}>下一首 ›</button>}
        {q && trails.get(q.author) && (
          <button
            title="在全国地图上看诗人一生的足迹"
            onClick={() => {
              navigation.selectPlace(null)
              facade.showPoetTrail(q.author)
            }}
          >
            {q.author}足迹
          </button>
        )}
        <button className="shut" title="收卷 (Esc)" onClick={() => navigation.selectPlace(null)}>
          收卷
        </button>
      </div>
    </>
  )
}
