import { useMemo } from 'react'
import { useApp } from '../app/AppStore'

/** 浏览器是否支持 WebGL 2（不支持时重试、降画质都没用，不给这两个按钮） */
function hasWebGL2(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

/** 带 ?q=low 重新载入：区块半径、阴影、像素比都降到最低一档 */
function reloadLow(): void {
  const u = new URL(location.href)
  u.searchParams.set('q', 'low')
  location.assign(u.toString())
}

export function LoadingScreen() {
  const loading = useApp((s) => s.loading)
  const gl2 = useMemo(() => (loading.error ? hasWebGL2() : true), [loading.error])
  return (
    <div className={`loading ${loading.ready ? 'done' : ''}`} aria-hidden={loading.ready}>
      <div className="inner">
        <div className="seal" style={{ width: 56, height: 56, fontSize: 36 }}>
          诗
        </div>
        <h1>山河诗卷</h1>
        <div className="bar">
          <i style={{ width: `${Math.round(loading.progress * 100)}%` }} />
        </div>
        <small>{loading.label}</small>
        {loading.error && (
          <div className="err" role="alert">
            {gl2 ? `载入失败：${loading.error}` : '这个浏览器不支持 WebGL 2，无法显示山河。请换用新版 Chrome、Edge、Firefox 或 Safari。'}
            {gl2 && (
              <div className="err-actions">
                <button type="button" onClick={() => location.reload()}>
                  重试
                </button>
                <button type="button" onClick={reloadLow}>
                  以「轻」画质重试
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
