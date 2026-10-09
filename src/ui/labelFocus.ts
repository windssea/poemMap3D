import type { Dof } from '../app/AppStore'
import type { CameraLevel } from '../engine/camera/CameraPose'
import type { Quality } from '../engine/rendering/QualityManager'

/**
 * 地名签是否落在景深之外（画面上那一块已经明显虚了）——是就藏起来，签与景一起虚实。
 * 与渲染流水线里的虚化一致：
 *  - 浅 / 极浅（真实景深）：按深度离对焦距离的比例 |1 − 对焦/深度| 判断；虚化从约 0.06 起渐强，
 *    签在明显虚了（浅 0.34、极浅 0.22）时才藏；长焦虚得更厉害，门槛按焦段倍数收窄（同流水线限 0.75–2 倍）。
 *    全国视角流水线不做真实景深，签照常显示。
 *  - 微缩（移轴）：按屏幕高度——中线上下三成以外已经虚了。
 *  - 「轻」画质没有后期流水线，看不到虚化，签不藏。
 * @param depth 签在镜头空间的深度；y 屏幕纵坐标、H 屏幕高；eyeDistance、distance 为真实与取景距离（比值即焦段倍数）；
 *   focus 为对焦距离（中心自动对焦，缺省为 eyeDistance）
 */
export function outOfFocus(dof: Dof, quality: Quality, level: CameraLevel, depth: number, y: number, H: number, eyeDistance: number, distance: number, focus = eyeDistance): boolean {
  if (dof === 'off' || quality === 'low') return false
  if (dof === 'mini') return Math.abs(y / Math.max(1, H) - 0.5) > 0.3
  if (level === 'national') return false
  const lens = Math.min(2, Math.max(0.75, eyeDistance / Math.max(1, distance)))
  const limit = (dof === 'deep' ? 0.22 : 0.34) / lens
  return Math.abs(1 - focus / Math.max(1, depth)) > limit
}
