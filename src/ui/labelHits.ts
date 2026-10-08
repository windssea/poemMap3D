/**
 * 手机上点画面怎么处理：地名签由地名层每帧登记屏幕矩形；手指点下时先看点没点中某个签，
 * 点中就直接展开；没点中但落在某处名胜范围里，只出预览小签；都不是就什么也不做。
 * （手机上地名签本身不接指针，拖动从签上开始也能转镜头。）
 */
export interface LabelHit {
  placeId: string
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 当前画面上显示着的地点签（地名层每帧重写） */
export const labelHits: LabelHit[] = []

/** 手指的点按区：签太窄（30px）时左右放宽到至少 44px，上下各放 6px */
const MIN_W = 44
const PAD_Y = 6

export type TapRoute = { kind: 'open'; placeId: string } | { kind: 'peek'; placeId: string } | { kind: 'none' }

export function routeTap(x: number, y: number, nearest: string | null, hits: readonly LabelHit[] = labelHits): TapRoute {
  let best: LabelHit | null = null
  let bd = Infinity
  for (const h of hits) {
    const cx = (h.x0 + h.x1) / 2
    const half = Math.max(MIN_W, h.x1 - h.x0) / 2
    if (x < cx - half || x > cx + half || y < h.y0 - PAD_Y || y > h.y1 + PAD_Y) continue
    // 几个签的放宽区重叠时取横向最近的
    const d = Math.abs(x - cx)
    if (d < bd) {
      bd = d
      best = h
    }
  }
  if (best) return { kind: 'open', placeId: best.placeId }
  return nearest ? { kind: 'peek', placeId: nearest } : { kind: 'none' }
}
