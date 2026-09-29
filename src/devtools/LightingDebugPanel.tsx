import { useState } from 'react'
import type { LightingTweaks, LightView } from '../engine/rendering/LightingDebug'
import { ISOLATION, PHASE0 } from '../engine/rendering/LightingDebug'
import { TIMES, TIME_NAMES, type TimeOfDay } from '../engine/environment/types'
import { useApp } from '../app/AppStore'
import { useServices } from '../ui/ServicesContext'

const VIEWS: { id: LightView; label: string }[] = [
  { id: 'albedo', label: '反照率' },
  { id: 'ao', label: 'AO' },
  { id: 'face', label: '面光' },
  { id: 'shadow', label: '阴影' },
  { id: 'fog', label: '雾伪彩' },
  { id: 'final', label: '完整' },
]

/**
 * 开发环境的光照对照。每个滑条和开关都写进引擎：灯的强度、阴影开关、雾、顶点 AO 和着色器视图。
 */
export function LightingDebugPanel() {
  const { facade } = useServices()
  const time = useApp((s) => s.time)
  const [t, setT] = useState<LightingTweaks>(() => facade.lighting())

  const apply = (patch: Partial<LightingTweaks>) => {
    facade.setLighting(patch)
    setT(facade.lighting())
  }

  return (
    <div className="chrome panel light-debug" data-pop>
      <h3>光照</h3>
      <div className="row">
        {ISOLATION.map((p) => (
          <button key={p.id} className="chip" onClick={() => apply(p.patch)}>
            {p.label}
          </button>
        ))}
        <button
          className="chip"
          onClick={() => {
            facade.resetLighting()
            setT(facade.lighting())
          }}
        >
          F 完整
        </button>
      </div>
      <div className="row">
        {PHASE0.map((p) => (
          <button key={p.id} className="chip" onClick={() => apply(p.patch)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="row">
        {VIEWS.map((v) => (
          <button key={v.id} className={`chip ${t.view === v.id ? 'on' : ''}`} onClick={() => apply({ view: v.id })}>
            {v.label}
          </button>
        ))}
      </div>
      <Slider label="AO" value={t.ao} min={0} max={1} step={0.01} onChange={(ao) => apply({ ao })} />
      <Slider label="天空光" value={t.sky} min={0} max={2} step={0.01} onChange={(sky) => apply({ sky })} />
      <Slider label="太阳" value={t.sun} min={0} max={2} step={0.01} onChange={(sun) => apply({ sun })} />
      <Slider label="曝光" value={t.exposure} min={0.6} max={1.6} step={0.01} onChange={(exposure) => apply({ exposure })} />
      <Slider label="面光" value={t.face} min={0} max={1} step={0.01} onChange={(face) => apply({ face })} />
      <label>
        <span>动态阴影</span>
        <input type="checkbox" checked={t.shadow} onChange={(e) => apply({ shadow: e.target.checked })} />
      </label>
      <label>
        <span>雾</span>
        <input type="checkbox" checked={t.fog} onChange={(e) => apply({ fog: e.target.checked })} />
      </label>
      <div className="row">
        {TIMES.map((id) => (
          <button key={id} className={`chip ${time === id ? 'on' : ''}`} onClick={() => facade.setTime(id as TimeOfDay)}>
            {TIME_NAMES[id]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void }) {
  return (
    <label>
      <span>
        {label} {value.toFixed(2)}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}
