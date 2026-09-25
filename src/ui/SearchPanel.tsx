import { useMemo, useState } from 'react'
import { useApp } from '../app/AppStore'
import type { SearchResult } from '../features/poetry/PoetrySearchService'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

const KIND = { poem: '诗', author: '人', place: '地' } as const

export function SearchPanel() {
  const { search, navigation, store, trails } = useServices()
  const q = useApp((s) => s.search)
  const panel = useApp((s) => s.panelState)
  const [hl, setHl] = useState(0)
  const results = useMemo(() => search.search(q), [q, search])

  const choose = (r: SearchResult) => {
    store.set({ search: '' })
    if (r.kind === 'place') navigation.selectPlace(r.id)
    else if (r.kind === 'poem') navigation.selectPoem(r.id)
    else navigation.selectAuthor(r.id)
  }

  return (
    <div className="chrome search" style={{ opacity: panel !== 'none' ? 0 : 1, pointerEvents: panel !== 'none' ? 'none' : 'auto' }}>
      <div className="panel box">
        <Icon name="search" />
        <input
          value={q}
          placeholder={`寻诗：诗题 · 诗人 · 地名${trails.all().length ? ' · 诗句' : ''}`}
          onChange={(e) => {
            store.set({ search: e.target.value })
            setHl(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setHl((h) => Math.min(results.length - 1, h + 1))
            else if (e.key === 'ArrowUp') setHl((h) => Math.max(0, h - 1))
            else if (e.key === 'Enter' && results[hl]) choose(results[hl])
            else if (e.key === 'Escape') store.set({ search: '' })
          }}
          aria-label="搜索诗词"
        />
        <button className="ico" title="诗人足迹" onClick={() => store.set((s) => ({ trailState: { ...s.trailState, picking: !s.trailState.picking } }))}>
          <Icon name="trail" />
        </button>
      </div>
      {results.length > 0 && (
        <div className="panel results">
          {results.map((r, i) => (
            <button key={`${r.kind}-${r.id}-${i}`} className={i === hl ? 'hl' : ''} onClick={() => choose(r)} onMouseEnter={() => setHl(i)}>
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
