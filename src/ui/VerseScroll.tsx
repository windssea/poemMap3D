import { useLayoutEffect, useRef } from 'react'
import { famousLines, type Poem } from '../features/poetry/types'

/**
 * 题诗立轴：诗题、〔朝代〕作者、此诗最有名的上下句、地点与作者印；
 * 自上而下展开，诗句逐列如毛笔写出。巡游与诗人足迹共用。
 */
export function VerseScroll({ poem, place }: { poem: Poem; place: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const lines = famousLines(poem)
  const mob = innerWidth <= 760
  const maxLen = Math.max(...lines.map((l) => [...l].length))
  const availH = Math.min(mob ? innerHeight * 0.34 : innerHeight * 0.58, 470) - 50
  const fz = Math.round(Math.min(mob ? 24 : 40, Math.max(mob ? 17 : 24, availH / (maxLen * 1.12))))
  let n = 0
  useLayoutEffect(() => {
    const m = ref.current?.querySelector('.vs-mount') as HTMLElement | null
    if (m) ref.current!.style.setProperty('--vh', `${m.offsetHeight}px`)
  }, [poem])
  return (
    <div className="verse" ref={ref} aria-live="polite">
      <i className="vs-rod" />
      <div className="vs-mount">
        <div className="vs-paper" style={{ ['--fz' as string]: `${fz}px` }}>
          <div className="vs-t">{poem.title}</div>
          <div className="vs-a">
            〔{poem.dynasty}〕{poem.author}
          </div>
          {lines.map((l, i) => {
            const len = [...l].length
            const style = { ['--d' as string]: `${1.1 + n * 0.08}s`, ['--t' as string]: `${len * 0.12 + 0.5}s` }
            n += len + 3
            return (
              <p key={i} style={style}>
                {l}
              </p>
            )
          })}
          <div className="vs-f">
            <span className="vs-pl">{place}</span>
            <span className="vs-seal">{poem.author}</span>
          </div>
        </div>
      </div>
      <i className="vs-rod b" />
    </div>
  )
}
