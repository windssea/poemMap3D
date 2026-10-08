import { useEffect, useMemo } from 'react'
import { useApp } from '../app/AppStore'
import { cnum } from './cnum'
import { routeTap } from './labelHits'
import { useServices } from './ServicesContext'

const PEEK_MS = 3500

/**
 * 手机上点画面：点中地名签直接展开；落在名胜范围里只在指尖上方浮出「某地 · 几首 ›」，再点才展开，
 * 几秒不点或一拖镜头就收起——随手一碰、拖动前的轻触都不会弹出诗目。
 */
export function TouchPeek() {
  const { navigation, aggregator, facade, store } = useServices()
  const tap = useApp((s) => s.touchTap)
  const hidden = useApp((s) => s.ui.hidden)
  // 每次新点按只判一次（地名签的位置取点按那一刻的）
  const route = useMemo(() => (tap ? routeTap(tap.x, tap.y, tap.placeId) : null), [tap])

  useEffect(() => {
    if (!route || route.kind === 'none') return
    if (route.kind === 'open') {
      store.set({ touchTap: null })
      navigation.selectPlace(route.placeId, store.get().autoCamera)
      return
    }
    const t = setTimeout(() => store.set({ touchTap: null }), PEEK_MS)
    return () => clearTimeout(t)
  }, [route, navigation, store])

  if (!tap || route?.kind !== 'peek' || hidden) return null
  const summary = aggregator.get(route.placeId)
  if (!summary) return null
  const name = facade.landmarkName(route.placeId) ?? summary.place.name
  const x = Math.min(Math.max(tap.x - 70, 10), innerWidth - 190)
  const y = Math.max(tap.y - 64, 10)
  return (
    <button
      className="peek"
      style={{ transform: `translate(${Math.round(x)}px, ${Math.round(y)}px)` }}
      onClick={() => {
        store.set({ touchTap: null })
        navigation.selectPlace(route.placeId, store.get().autoCamera)
      }}
    >
      <b>{name}</b>
      <span>{cnum(summary.poems.length)}首</span>
      <i>›</i>
    </button>
  )
}
