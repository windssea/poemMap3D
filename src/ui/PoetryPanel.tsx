import { useApp } from '../app/AppStore'
import { famousLines, isMasterpiece, type Poem } from '../features/poetry/types'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

/** 诗目（某地的诗）与诗卷（整首、译文、赏析、注释、本事） */
export function PoetryPanel() {
  const { aggregator, poetry, navigation } = useServices()
  const panel = useApp((s) => s.panelState)
  const placeId = useApp((s) => s.selectedPlaceId)
  const poemId = useApp((s) => s.selectedPoemId)
  const tourActive = useApp((s) => s.tourState.active)
  if (panel === 'none' || !placeId || tourActive) return null
  const summary = aggregator.get(placeId)
  if (!summary) return null
  const poem = poemId ? poetry.get(poemId) : null
  return (
    <div className="chrome panel poetry" role="dialog" aria-label={summary.place.name}>
      <header>
        <h2>{summary.place.name}</h2>
        <small>
          {summary.place.region} · {summary.poems.length} 首
        </small>
        <button className="ico close" title="关闭" onClick={() => navigation.selectPlace(null)}>
          <Icon name="close" />
        </button>
      </header>
      {panel === 'poem' && poem ? (
        <PoemScroll poem={poem} onBack={() => navigation.closePanel()} />
      ) : (
        <div className="list">
          {summary.poems.map((p) => (
            <button key={p.id} onClick={() => navigation.selectPoem(p.id, false)}>
              <div>
                <span className="t">《{p.title}》</span>
                {isMasterpiece(p) && <span className="badge">名篇</span>}
                <span className="m">
                  {p.dynasty} · {p.author}
                </span>
              </div>
              <div className="f">{famousLines(p).join('')}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PoemScroll({ poem, onBack }: { poem: Poem; onBack: () => void }) {
  const { poetry } = useServices()
  const famous = new Set(poem.fame ? Array.from({ length: poem.fame.count }, (_, i) => poem.fame!.line + i) : [])
  const author = poetry.author(poem.author)
  return (
    <div className="scroll">
      <button className="back" onClick={onBack}>
        ← 诗目
      </button>
      <h1 className="title">{poem.title}</h1>
      <div className="meta">
        {poem.dynasty} · {poem.author}
        {author?.years ? `（${author.years}）` : ''} · {poem.placeName}
      </div>
      {poem.preface && <div className="preface">{poem.preface}</div>}
      <div className="lines">
        {poem.lines.map((l, i) => (
          <div key={i} className={famous.has(i) ? 'famous' : ''}>
            {l}
          </div>
        ))}
      </div>
      {poem.translation && (
        <>
          <h3>译文</h3>
          <p>{poem.translation}</p>
        </>
      )}
      {poem.appreciation && (
        <>
          <h3>赏析</h3>
          <p>{poem.appreciation}</p>
        </>
      )}
      {poem.notes && poem.notes.length > 0 && (
        <>
          <h3>注释</h3>
          {poem.notes.map((n) => (
            <p key={n.term} className="note">
              <b>{n.term}</b>：{n.gloss}
            </p>
          ))}
        </>
      )}
      {poem.story && (
        <>
          <h3>本事</h3>
          <p>{poem.story}</p>
        </>
      )}
      {poem.origin && (
        <>
          <h3>地缘</h3>
          <p>{poem.origin}</p>
        </>
      )}
    </div>
  )
}
