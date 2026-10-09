/**
 * 题跋 + 印谱（暂不使用，保留备用）：点地标后在留白处题名句、下排按朝代的诗人小印。
 * 目前点地标仍走原逻辑（一首直接展卷、多首列诗目），PoetryPanel 不挂这个组件。
 */
import { type PointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppStore'
import { famousLines, fameOf, type Poem } from '../features/poetry/types'
import { useServices } from './ServicesContext'

/** 朝代先后（印谱按它排） */
const ORDER = ['先秦', '秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '辽', '金', '元', '明', '清']
const rank = (d: string) => {
  const i = ORDER.indexOf(d)
  return i < 0 ? ORDER.length : i
}

/** 印文：作者全名，竖排——两三字一列，四字两列（右列先读，同古印） */
const sealText = (author: string) => <span className={`n${Math.min(4, [...author].length)}`}>{author}</span>

/** 印谱最多几位诗人（一人一方印，一行排得下）；多出来的由最后一方「全部」打开目录 */
const MAX_SEALS = 6

/** 一位诗人在此地的诗：名气高的在前 */
interface AuthorSeal {
  author: string
  poems: Poem[]
}
/** 题诗最多几列 */
const MAX_COLS = 6

/** 题诗：名句按标点断成一句一列（题跋不加标点）；每列固定七字高，长句自然换列——五言、七言、长短句高度一致，切换不跳 */
const phrases = (p: Poem): string[] =>
  famousLines(p)
    .join('')
    .split(/[，。、；：！？,.;:!?·]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_COLS)

const CN = '〇一二三四五六七八九'
/** 一到九十九的中文数字 */
const cn = (n: number) => (n < 10 ? CN[n] : n < 20 ? '十' + (n % 10 ? CN[n % 10] : '') : CN[Math.floor(n / 10)] + '十' + (n % 10 ? CN[n % 10] : ''))

/**
 * 题跋 + 印谱：点地标，镜头落定后在画面留白处（地标的另一侧、上方天空）题上这处最有名的两句，落款、钤印；
 * 下面一行小印按朝代排开，一首诗一方——指到哪方，上面的题诗就换成那首的名句；点印或点题诗展开诗卷。
 * 「目录」打开原来的竖排诗目（按诗题找）。镜头飞行中先隐去，落定后再写出来。
 */
export function Inscription({ open, catalog, onCatalog }: { open: boolean; catalog: boolean; onCatalog: () => void }) {
  const { aggregator, navigation, facade } = useServices()
  const placeId = useApp((s) => s.selectedPlaceId)
  const summary = placeId ? aggregator.get(placeId) : undefined
  const root = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState<'l' | 'r'>('r')
  const [settled, setSettled] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  /** 点开了哪位诗人的诗题小单（一人多首时） */
  const [menu, setMenu] = useState<string | null>(null)
  const leave = useRef(0)

  /* 印谱：一位诗人一方印；取名篇最高的至多 MAX_SEALS 位，按朝代先后排、按朝代分组；其余收起 */
  const total = summary?.poems.length ?? 0
  const authors = useMemo(() => {
    const by = new Map<string, Poem[]>()
    for (const p of [...(summary?.poems ?? [])].sort((a, b) => fameOf(b) - fameOf(a))) {
      const list = by.get(p.author)
      if (list) list.push(p)
      else by.set(p.author, [p])
    }
    return [...by.entries()].map(([author, poems]): AuthorSeal => ({ author, poems }))
  }, [summary])
  const groups = useMemo(() => {
    const picked = authors.slice(0, MAX_SEALS).sort((a, b) => rank(a.poems[0].dynasty) - rank(b.poems[0].dynasty) || fameOf(b.poems[0]) - fameOf(a.poems[0]))
    const out: { dynasty: string; seals: AuthorSeal[] }[] = []
    for (const s of picked) {
      const d = s.poems[0].dynasty
      const g = out[out.length - 1]
      if (g && g.dynasty === d) g.seals.push(s)
      else out.push({ dynasty: d, seals: [s] })
    }
    return out
  }, [authors])
  const restAuthors = Math.max(0, authors.length - MAX_SEALS)
  const top = summary?.poems[0]
  const shown = (preview && summary?.poems.find((p) => p.id === preview)) || top

  useEffect(() => {
    setPreview(null)
    setMenu(null)
  }, [placeId])

  /* 诗题签：点别处不收（容易丢），再点这位诗人的印、换一位诗人或按 Esc 才收 */
  useEffect(() => {
    if (!menu) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    addEventListener('keydown', key, true)
    return () => removeEventListener('keydown', key, true)
  }, [menu])

  /* 镜头落定才题字；题在地标的另一侧（带回差，镜头小转时不来回跳） */
  useEffect(() => {
    setSettled(false)
    if (!open || !placeId) return
    const anchor = facade.placeAnchor(placeId) ?? (summary ? facade.geoAnchor(summary.place.lng, summary.place.lat) : null)
    const p = { x: 0, y: 0, depth: 0 }
    let still = 0
    let away = 0
    let cur: 'l' | 'r' | null = null
    return facade.onFrame((f) => {
      if (facade.isFlying()) {
        still = 0
        away = 0
        setSettled(false)
        return
      }
      const seen = !!anchor && facade.project(anchor, p) && p.x > -40 && p.x < innerWidth + 40 && p.y > -40 && p.y < innerHeight + 40
      if (seen) {
        away = 0
        const want = p.x > innerWidth * (cur === 'l' ? 0.4 : cur === 'r' ? 0.6 : 0.5) ? 'l' : 'r'
        if (want !== cur) {
          cur = want
          setSide(want)
        }
      } else if (anchor && (away += f.dt) > 0.5) {
        // 用户把地标拖出了画面：当作不看了，题跋收起（不必去点「收起」）
        navigation.selectPlace(null)
        return
      }
      still += f.dt
      if (still > 0.25) setSettled(true)
    })
  }, [open, placeId, facade, summary, navigation])

  if (!summary || !shown) return <div className="chrome ins" ref={root} />
  const lines = phrases(shown)
  let n = 0
  const fast = !!preview
  return (
    <div className={`chrome ins ${side} ${open && settled ? 'on' : ''} ${catalog ? 'cat' : ''}`} ref={root} role="dialog" aria-label={`${summary.place.name} 题跋`}>
      <button className="ins-text" key={shown.id} aria-label={`展开《${shown.title}》`} onClick={() => navigation.selectPoem(shown.id, false)}>
        {lines.map((l, i) => {
          const len = [...l].length
          const style = { ['--d' as string]: `${(fast ? 0.05 : 0.35) + n * (fast ? 0.025 : 0.09)}s`, ['--t' as string]: `${len * (fast ? 0.04 : 0.11) + 0.35}s` }
          n += len + 2
          return (
            <p key={i} style={style}>
              {l}
            </p>
          )
        })}
        {/* 落款两列：〔朝代〕作者、诗题；各自不超过一列诗高，长题截断——题跋整块高度固定，下面的印不会被推动 */}
        <span className="ins-k" style={{ ['--d' as string]: `${(fast ? 0.1 : 0.4) + n * (fast ? 0.025 : 0.09)}s` }}>
          <span>
            〔{shown.dynasty}〕{shown.author}
          </span>
          <span>《{shown.title}》</span>
        </span>
        <span className="ins-go">展卷</span>
      </button>
      <div className="ins-pu">
        <div className="ins-h">
          <b>{summary.place.name}</b>
          {total > 1 && <span>{cn(total)}首</span>}
          {total > 1 && (
            <>
              <button onClick={onCatalog} aria-pressed={catalog}>
                目录
              </button>
              <i>·</i>
            </>
          )}
          <button onClick={() => navigation.selectPlace(null)}>收起</button>
        </div>
        <div className="ins-seals">
          {groups.map((g) => (
            <div className="ins-g" key={g.dynasty}>
              {groups.length > 1 && <em>{g.dynasty}</em>}
              {g.seals.map(({ author, poems }) => {
                const many = poems.length > 1
                const hoverTo = (id: string) => (e: PointerEvent) => {
                  if (e.pointerType !== 'mouse') return
                  clearTimeout(leave.current)
                  // 停一下再换：鼠标划过几方印时不必每方都重写一遍
                  leave.current = window.setTimeout(() => setPreview(id), 120)
                }
                return (
                  <div className="ins-a" key={author}>
                    <button
                      className={`ins-s ${shown.author === author ? 'cur' : ''}`}
                      aria-label={many ? `${author} ${poems.length} 首` : `${author}《${poems[0].title}》`}
                      aria-expanded={many ? menu === author : undefined}
                      onPointerEnter={hoverTo(poems[0].id)}
                      // 移开不切回：题诗停在最后看的那首
                      onPointerLeave={() => clearTimeout(leave.current)}
                      onClick={() => (many ? setMenu(menu === author ? null : author) : navigation.selectPoem(poems[0].id, false))}
                    >
                      {sealText(author)}
                      {many && <i className="ins-dot" aria-hidden />}
                    </button>
                    {many && menu === author && (
                      <div className="ins-menu" role="menu" aria-label={`${author}在此地的诗`}>
                        <div className="ins-menu-list">
                          {poems.map((p) => {
                            const cur = p.id === shown.id
                            return (
                              // 点一下选中（上面题诗预览），再点同一首才展卷；划过不改选中
                              <button
                                key={p.id}
                                role="menuitemradio"
                                aria-checked={cur}
                                className={cur ? 'cur' : ''}
                                onClick={() => {
                                  clearTimeout(leave.current)
                                  if (cur) navigation.selectPoem(p.id, false)
                                  else setPreview(p.id)
                                }}
                              >
                                {p.title}
                              </button>
                            )
                          })}
                        </div>
                        <p className="ins-menu-tip">点选预览 · 再点展卷</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
          {restAuthors > 0 && (
            <button className="ins-s ins-all" aria-label={`全部 ${total} 首`} onClick={onCatalog}>
              <span>全部</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
