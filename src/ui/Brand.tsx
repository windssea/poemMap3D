import { useServices } from './ServicesContext'

export function Brand() {
  const { poetry, places } = useServices()
  return (
    <div className="chrome brand">
      <div className="seal">诗</div>
      <div>
        <h1>山河诗卷</h1>
        <p>
          先秦至宋 · {poetry.count} 首 · {places.count} 处
        </p>
      </div>
    </div>
  )
}
