import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/AppStore'
import type { SearchResult } from '../features/poetry/PoetrySearchService'
import { Icon } from './icons'
import { useServices } from './ServicesContext'
import { useMobile } from './useMobile'

const KIND = { poem: '诗', author: '人', place: '地' } as const

export function SearchPanel() {
  const { search, navigation, store, trails } = useServices()
  const q = useApp((s) => s.search)
  const panel = useApp((s) => s.panelState)
  const sheetOpen = useApp((s) => s.ui.sheet === 'search')
  const mobile = useMobile()
  const [hl, setHl] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const results = useMemo(() => search.search(q), [q, search])
  const cur = Math.min(hl, results.length - 1)

  /* 方向键走到列表外时，高亮项滚进可见区 */
  useEffect(() => {
    list.current?.querySelector('.hl')?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  /* 手机：点「寻诗」打开时直接进入输入 */
  useEffect(() => {
    if (mobile && sheetOpen) input.current?.focus()
  }, [mobile, sheetOpen])

  const closeSheet = () => store.set((s) => ({ ui: { ...s.ui, sheet: null } }))

  const choose = (r: SearchResult) => {
    store.set((s) => ({ search: '', ui: { ...s.ui, sheet: null } }))
    // 收起手机软键盘，也免得看不见的输入框继续接键盘
    input.current?.blur()
    if (r.kind === 'place') navigation.selectPlace(r.id)
    else if (r.kind === 'poem') navigation.selectPoem(r.id)
    else navigation.selectAuthor(r.id)
  }

  // 手机上搜索是「寻诗」抽屉：不点开就不占地方
  if (mobile && !sheetOpen) return null
  const off = !mobile && panel !== 'none'
  return (
    <div className={`chrome search ${mobile ? 'm' : 'fade'}`} data-pop={mobile || undefined} style={{ opacity: off ? 0 : 1, pointerEvents: off ? 'none' : 'auto' }}>
      <div className="panel box">
        <Icon name="search" />
        <input
          ref={input}
          value={q}
          placeholder={`寻诗：诗题 · 诗人 · 地名${trails.all().length ? ' · 诗句' : ''}`}
          onChange={(e) => {
            store.set({ search: e.target.value })
            setHl(0)
          }}
          onKeyDown={(e) => {
            // 输入法还在选字：Enter 是上屏、Esc 是取消候选，都不归搜索框管
            if (e.nativeEvent.isComposing || e.keyCode === 229) return
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!results.length) return
              e.preventDefault()
              setHl(Math.max(0, Math.min(results.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1))))
            } else if (e.key === 'Enter' && results[cur]) choose(results[cur])
            else if (e.key === 'Escape') {
              if (q) store.set({ search: '' })
              else if (mobile) closeSheet()
              else input.current?.blur()
            }
          }}
          aria-label="搜索诗词"
        />
        {mobile && (
          <>
            <button className="ico" aria-label="诗人足迹" onClick={() => store.set((s) => ({ ui: { ...s.ui, sheet: null }, trailState: { ...s.trailState, picking: true } }))}>
              <Icon name="footprints" size={20} />
            </button>
            <button className="ico" aria-label="关闭" onClick={closeSheet}>
              <Icon name="close" size={18} />
            </button>
          </>
        )}
      </div>
      {results.length > 0 && (
        <div className="panel results" ref={list}>
          {results.map((r, i) => (
            <button key={`${r.kind}-${r.id}-${i}`} className={i === cur ? 'hl' : ''} onClick={() => choose(r)} onMouseEnter={() => setHl(i)}>
              <div className="t">
                <span className="k">{KIND[r.kind]}</span>
                {r.title}
              </div>
              <div className="s">{r.subtitle}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
