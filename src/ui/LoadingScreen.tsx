import { useApp } from '../app/AppStore'

export function LoadingScreen() {
  const loading = useApp((s) => s.loading)
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
        {loading.error && <div className="err">载入失败：{loading.error}（需要支持 WebGL 2 与模块化 Worker 的浏览器）</div>}
      </div>
    </div>
  )
}
