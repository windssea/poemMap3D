import { useMemo } from 'react'
import { dynastySpan } from '../features/poetry/types'
import { useServices } from './ServicesContext'

export function Brand() {
  const { poetry, places } = useServices()
  const span = useMemo(() => dynastySpan(poetry.all().map((p) => p.dynasty)), [poetry])
  return (
    <div className="chrome brand fade">
      <div className="seal">诗</div>
      <div>
        <h1>山河诗卷</h1>
        <p>
          {span} · {poetry.count} 首 · {places.count} 处
        </p>
      </div>
    </div>
  )
}
