import { useEffect, useState } from 'react'
import type { HoverInfo } from '../app/EngineFacade'
import { useApp } from '../app/AppStore'
import { useServices } from '../ui/ServicesContext'

const OCC = ['建筑', '缓冲', '入口', '视线', '地标', '铺装']

/** TerrainLab + ChunkDebug：悬停取样（区块、坐标、高度、坡度、生物群系、离水、占用、候选树）与区块统计 */
export function DebugPanel() {
  const { facade } = useServices()
  const debug = useApp((s) => s.debug)
  const level = useApp((s) => s.cameraLevel)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (!debug.chunks) return
    const off = facade.onHover(setHover)
    const t = setInterval(() => setTick((n) => n + 1), 500)
    return () => {
      off()
      clearInterval(t)
    }
  }, [debug.chunks, facade])

  if (!debug.chunks) return null
  const s = facade.stats()
  const c = s.chunks
  const occ = hover ? OCC.filter((_, i) => hover.occupancy & (1 << i)).join('、') || '—' : ''
  return (
    <div className="chrome panel debug">
      {`帧率      ${s.fps.toFixed(0)} fps   视角 ${level}
区块      近景 ${c.visible}  远景 ${c.farVisible}  缓存 ${c.cached}  生成中 ${c.generating}  待上传 ${c.uploadsPending}
Worker    ${s.workers.busy}/${s.workers.workers} 忙  队列 ${s.workers.queued}  完成 ${s.workers.done}
耗时      生成 ${c.avgGenMs.toFixed(1)}ms  网格 ${c.avgMeshMs.toFixed(1)}ms
三角形    近景 ${(c.triangles / 1000).toFixed(0)}k  远景 ${(c.farTriangles / 1000).toFixed(0)}k  合计 ${(s.worldTriangles / 1000).toFixed(0)}k  覆盖图 ${(s.overviewTriangles / 1000).toFixed(0)}k（${Math.round(s.overview * 100)}%）
`}
      {hover &&
        `—— 地形取样 ——
方块      ${hover.x}, ${hover.y}, ${hover.z}   区块 ${hover.chunk}
方块类型  ${hover.block}
地表高    ${hover.height}   坡度 ${hover.slope.toFixed(2)}
生物群系  ${hover.biome}   离水 ${hover.waterDistance > 1e6 ? '远' : hover.waterDistance.toFixed(1)}
占用      ${occ}
候选树    ${hover.treeCandidate}`}
    </div>
  )
}
