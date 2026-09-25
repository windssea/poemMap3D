import { useEffect, useRef } from 'react'
import { type AppServices, bootstrap } from '../app/bootstrap'
import { appStore } from '../app/AppStore'

/**
 * React 中唯一的世界容器。引擎在这里挂载一次，之后完全独立运行；
 * React 不管理树、山、水、区块、网格与渲染循环。
 */
export function WorldCanvas({ onReady }: { onReady: (s: AppServices) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current || !ref.current) return
    started.current = true
    bootstrap(ref.current).then(onReady, (err: unknown) => {
      console.error(err)
      appStore.set((s) => ({ loading: { ...s.loading, error: err instanceof Error ? err.message : String(err) } }))
    })
  }, [onReady])

  return <div ref={ref} className="world-canvas" />
}
