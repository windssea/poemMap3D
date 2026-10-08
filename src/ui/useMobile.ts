import { useSyncExternalStore } from 'react'

/** 手机布局的断点（与样式表里的 760px 一致） */
const MQ = '(max-width: 760px)'

const subscribe = (fn: () => void) => {
  const m = matchMedia(MQ)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}

/** 窄屏用手机布局：底部图标栏 + 抽屉；宽屏用一条底栏 */
export function useMobile(): boolean {
  return useSyncExternalStore(subscribe, () => matchMedia(MQ).matches)
}
