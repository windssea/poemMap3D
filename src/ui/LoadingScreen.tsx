import { useMemo, useState } from 'react'
import { useApp } from '../app/AppStore'
import { BUILD, buildLabel } from '../app/buildInfo'

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

/** 诊断信息：版本、错误、WebGL 2、浏览器与地址——用户复制给我们，就能对上是哪个构建出的什么错 */
function diagnosis(error: string, gl2: boolean): string {
  return [`山河诗卷 ${BUILD.commit} ${BUILD.builtAt} world:${BUILD.world}`, `错误：${error}`, `WebGL 2：${gl2 ? '有' : '无'}`, `浏览器：${navigator.userAgent}`, `地址：${location.href}`, `时间：${new Date().toISOString()}`].join('\n')
}

function CopyDiagnosis({ error, gl2 }: { error: string; gl2: boolean }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        const text = diagnosis(error, gl2)
        const ok = () => {
          setDone(true)
          setTimeout(() => setDone(false), 1600)
        }
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(ok, () => window.prompt('复制诊断信息', text))
        else window.prompt('复制诊断信息', text)
      }}
    >
      {done ? '已复制' : '复制诊断信息'}
    </button>
  )
}

/** 远中近三层水墨山（视口底部，按 1600×600 画，宽屏时左右裁） */
const HILLS = {
  far: 'M0 420C120 380 200 300 300 330C380 350 430 260 520 250C610 240 660 330 760 320C860 310 900 220 1010 210C1120 200 1180 300 1290 290C1390 280 1460 230 1600 260V600H0Z',
  mid: 'M0 480C90 450 170 390 260 410C350 430 400 360 500 350C600 340 650 420 760 430C860 440 930 370 1030 360C1140 350 1200 430 1320 440C1430 450 1520 400 1600 410V600H0Z',
  near: 'M0 540C110 520 200 470 320 490C430 505 520 460 640 470C770 480 840 530 980 520C1100 512 1180 470 1300 480C1430 490 1520 520 1600 510V600H0Z',
} as const

/** 一层山：墨色自上而下淡入雾里，边缘经噪声扰动成参差的水墨边 */
function Hill({ k, ink, rough }: { k: keyof typeof HILLS; ink: number; rough: number }) {
  return (
    <svg className={`ld-hill ${k}`} viewBox="0 0 1600 600" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id={`ld-g-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.3" stopColor="var(--c-mo)" stopOpacity={ink} />
          <stop offset="0.62" stopColor="var(--c-mo)" stopOpacity={ink * 0.45} />
          <stop offset="0.95" stopColor="var(--c-mo)" stopOpacity="0" />
        </linearGradient>
        <filter id={`ld-f-${k}`} x="-5%" y="-10%" width="110%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="3" seed={k.length} />
          <feDisplacementMap in="SourceGraphic" scale={rough} />
          <feGaussianBlur stdDeviation={k === 'far' ? 3 : k === 'mid' ? 1.6 : 0.8} />
        </filter>
      </defs>
      <path d={HILLS[k]} fill={`url(#ld-g-${k})`} filter={`url(#ld-f-${k})`} />
    </svg>
  )
}

/**
 * 载入画面：宣纸（细纤维 + 浅斑驳 + 旧纸暗边）上，三层水墨山由淡到浓晕开，标题后一团淡墨洇开，朱印落下；
 * 进度是一笔参差的墨线随进度写出。载入完，整张纸带一点模糊淡出（墨散）。出错时停在纸上给出原因与动作。
 */
export function LoadingScreen() {
  const loading = useApp((s) => s.loading)
  const gl2 = useMemo(() => (loading.error ? hasWebGL2() : true), [loading.error])
  return (
    <div className={`loading ${loading.ready ? 'done' : ''}`} aria-hidden={loading.ready}>
      <svg className="ld-paper" aria-hidden>
        <filter id="ld-mottle">
          <feTurbulence type="fractalNoise" baseFrequency="0.005 0.009" numOctaves="3" seed="2" />
          <feColorMatrix values="0 0 0 0 0.52  0 0 0 0 0.42  0 0 0 0 0.28  0 0 0 0.2 0" />
        </filter>
        <filter id="ld-fiber">
          <feTurbulence type="fractalNoise" baseFrequency="0.018 0.42" numOctaves="2" seed="7" />
          <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.37  0 0 0 0 0.25  0 0 0 0.09 0" />
        </filter>
        <filter id="ld-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" />
          <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.33  0 0 0 0 0.24  0 0 0 0.07 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#ld-mottle)" />
        <rect width="100%" height="100%" filter="url(#ld-fiber)" />
        <rect width="100%" height="100%" filter="url(#ld-grain)" />
      </svg>
      <Hill k="far" ink={0.13} rough={26} />
      <Hill k="mid" ink={0.2} rough={18} />
      <Hill k="near" ink={0.3} rough={12} />
      <div className="inner">
        <svg className="ld-blot" viewBox="0 0 420 240" aria-hidden>
          <defs>
            <radialGradient id="ld-blot-g">
              <stop offset="0" stopColor="var(--c-mo)" stopOpacity="0.13" />
              <stop offset="0.55" stopColor="var(--c-mo)" stopOpacity="0.06" />
              <stop offset="1" stopColor="var(--c-mo)" stopOpacity="0" />
            </radialGradient>
            <filter id="ld-blot-f">
              <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="5" />
              <feDisplacementMap in="SourceGraphic" scale="40" />
            </filter>
          </defs>
          <ellipse cx="210" cy="120" rx="190" ry="96" fill="url(#ld-blot-g)" filter="url(#ld-blot-f)" />
        </svg>
        <div className="ld-title">
          <h1>山河诗卷</h1>
          <div className="seal ld-seal">诗</div>
        </div>
        {/* 出错了就不再显示进度与「研墨」，免得看着像还在载入 */}
        {!loading.error && (
          <>
            <svg className="ld-stroke" viewBox="0 0 260 28" aria-hidden>
              <defs>
                <filter id="ld-brush" x="-5%" y="-60%" width="110%" height="220%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.09 0.5" numOctaves="2" seed="3" />
                  <feDisplacementMap in="SourceGraphic" scale="3.5" />
                </filter>
              </defs>
              <path className="track" d="M8 15C70 9 140 19 252 12" pathLength={1} />
              <path className="ink" d="M8 15C70 9 140 19 252 12" pathLength={1} filter="url(#ld-brush)" style={{ strokeDashoffset: 1 - Math.max(0.02, Math.min(1, loading.progress)) }} />
            </svg>
            <small>{loading.label}</small>
          </>
        )}
        {loading.error && (
          <div className="err" role="alert">
            {gl2 ? `山河暂时无法显示：${loading.error}` : '这个浏览器不支持 WebGL 2，无法显示山河。请换用新版 Chrome、Edge、Firefox 或 Safari。'}
            <div className="err-actions">
              {gl2 && (
                <>
                  <button type="button" onClick={() => location.reload()}>
                    重试
                  </button>
                  <button type="button" onClick={reloadLow}>
                    以「轻」画质重试
                  </button>
                </>
              )}
              <CopyDiagnosis error={loading.error} gl2={gl2} />
            </div>
            <div className="err-ver">{buildLabel()}</div>
          </div>
        )}
      </div>
    </div>
  )
}
