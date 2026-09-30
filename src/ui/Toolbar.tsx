import { useApp } from '../app/AppStore'
import { MUSIC_MODES, NATURE_MODES, SOUND_NAMES } from '../app/AmbientSound'
import { QUALITY_PRESETS, type Quality, VIEW_RANGES, type ViewRange } from '../engine/rendering/QualityManager'
import { Icon } from './icons'
import { useServices } from './ServicesContext'

const QUALITIES: Quality[] = ['low', 'mid', 'high']

/**
 * 底栏最后一组「设置」：点开是一张设置卡——
 *  · 画质（轻 · 衡 · 高）
 *  · 渲染视距（标准 · 远 · 更远 · 极远）：越远看得越清楚，但区块生成、内存与帧耗时近似按面积增加
 *  · 自动取景（点地名时镜头是否自动对准）
 *  · 背景音（自然 · 古乐）
 *  · 截图、隐藏界面（任意处单击恢复）
 * 调试面板改由地址栏 ?debug 打开。
 */
export function Toolbar() {
  const { facade, store, sound: soundSvc } = useServices()
  const autoCam = useApp((s) => s.autoCamera)
  const sound = useApp((s) => s.sound)
  const open = useApp((s) => s.ui.settingsOpen)
  const quality = useApp((s) => s.quality)
  const view = useApp((s) => s.viewRange)
  return (
    <div className="panel grp" style={{ position: 'relative' }}>
      <span className="lab">设置</span>
      <button className="chip" data-pop-toggle title="画质、渲染视距、自动取景、背景音、截图" onClick={() => store.set((s) => ({ ui: { ...s.ui, settingsOpen: !s.ui.settingsOpen } }))}>
        {QUALITY_PRESETS[quality]?.label ?? '衡'} · {VIEW_RANGES[view].label}
        <span style={{ display: 'inline-block', transform: open ? 'none' : 'rotate(180deg)', marginLeft: 4, verticalAlign: -3 }}>
          <Icon name="chevron" size={14} />
        </span>
      </button>
      {open && (
        <div className="panel amb-pop set-pop" data-pop>
          <div className="tp-h">设置</div>
          <div className="amb-row">
            <span className="ap-k">画质</span>
            {QUALITIES.map((q) => (
              <button key={q} className={`chip ${q === quality ? 'on' : ''}`} title={q === 'low' ? '轻：无阴影，适合低配与手机' : q === 'mid' ? '衡：两级阴影、泛光与调色' : '高：三级阴影、屏幕空间环境光'} onClick={() => facade.setQuality(q)}>
                {QUALITY_PRESETS[q].label}
              </button>
            ))}
          </div>
          <div className="amb-row">
            <span className="ap-k">视距</span>
            {VIEW_RANGES.map((v, i) => (
              <button
                key={v.label}
                className={`chip ${i === view ? 'on' : ''}`}
                title={i === 0 ? '默认渲染范围' : `渲染半径约 ${v.k} 倍（区块数约 ${Math.round(v.k * v.k * 10) / 10} 倍），更远更清楚，也更吃内存与显卡；载入需要更久`}
                onClick={() => facade.setViewRange(i as ViewRange)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="amb-row">
            <span className="ap-k">取景</span>
            <button className={`chip ${autoCam ? 'on' : ''}`} title="点地名时镜头自动对准" onClick={() => store.set({ autoCamera: true })}>
              自动
            </button>
            <button className={`chip ${autoCam ? '' : 'on'}`} title="点地名只展开诗目，镜头不动" onClick={() => store.set({ autoCamera: false })}>
              手动
            </button>
          </div>
          {([['自然', NATURE_MODES], ['古乐', MUSIC_MODES]] as const).map(([lab, modes]) => (
            <div className="amb-row" key={lab}>
              <span className="ap-k">{lab}</span>
              {modes.map((m) => (
                <button
                  key={m}
                  className={`chip ${m === sound ? 'on' : ''}`}
                  title={m === 'auto' ? '随季节、时辰、天气自动调配' : undefined}
                  onClick={() => {
                    soundSvc.setMode(m)
                    store.set({ sound: m })
                  }}
                >
                  {SOUND_NAMES[m]}
                </button>
              ))}
            </div>
          ))}
          <div className="amb-row">
            <span className="ap-k">其他</span>
            <button
              className="chip"
              title="保存当前画面"
              onClick={() => {
                const a = document.createElement('a')
                a.href = facade.screenshot()
                a.download = '山河诗卷.png'
                a.click()
              }}
            >
              截图
            </button>
            <button className="chip" title="隐藏界面（任意处单击恢复）" onClick={() => store.set((s) => ({ ui: { ...s.ui, hidden: true, settingsOpen: false } }))}>
              隐藏界面
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
