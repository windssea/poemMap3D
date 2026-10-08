import { describe, expect, it, vi } from 'vitest'
import { InputController } from '../src/engine/interaction/InputController'

/** 不起浏览器：假元素记下监听函数，手工派发指针事件 */
function setup() {
  ;(globalThis as { window?: unknown }).window ??= { getSelection: () => null }
  const fns = new Map<string, (e: unknown) => void>()
  const el = {
    addEventListener: (t: string, fn: (e: unknown) => void) => fns.set(t, fn),
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture: () => {},
    classList: { add: () => {}, remove: () => {} },
  }
  const h = { onStart: vi.fn(), rotate: vi.fn(), pan: vi.fn(), zoom: vi.fn(), tap: vi.fn(), hover: vi.fn() }
  new InputController(el as unknown as HTMLElement, h)
  const fire = (type: string, id: number, x: number, y: number) =>
    fns.get(type)!({ pointerId: id, clientX: x, clientY: y, button: 0, shiftKey: false, preventDefault: () => {} })
  return { h, fire }
}

describe('触控手势分类', () => {
  it('单指轻点仍算选择', () => {
    const { h, fire } = setup()
    fire('pointerdown', 1, 100, 100)
    fire('pointerup', 1, 100, 100)
    expect(h.tap).toHaveBeenCalledWith(100, 100)
  })

  it('系统取消不算轻点', () => {
    const { h, fire } = setup()
    fire('pointerdown', 1, 100, 100)
    fire('pointercancel', 1, 100, 100)
    expect(h.tap).not.toHaveBeenCalled()
  })

  it('双指短触（不论先抬哪一指）不算轻点', () => {
    for (const first of [1, 2]) {
      const { h, fire } = setup()
      fire('pointerdown', 1, 100, 100)
      fire('pointerdown', 2, 160, 100)
      fire('pointerup', first, 0, 0)
      fire('pointerup', 3 - first, 0, 0)
      expect(h.tap).not.toHaveBeenCalled()
    }
  })

  it('捏合后剩下的一指不接着转镜头；下一轮单指照常', () => {
    const { h, fire } = setup()
    fire('pointerdown', 1, 100, 100)
    fire('pointerdown', 2, 160, 100)
    fire('pointermove', 2, 200, 100)
    expect(h.zoom).toHaveBeenCalled()
    fire('pointerup', 2, 200, 100)
    fire('pointermove', 1, 140, 130)
    expect(h.rotate).not.toHaveBeenCalled()
    fire('pointerup', 1, 140, 130)
    fire('pointerdown', 3, 50, 50)
    fire('pointermove', 3, 60, 50)
    expect(h.rotate).toHaveBeenCalledWith(10, 0)
    fire('pointerup', 3, 60, 50)
    fire('pointerdown', 4, 70, 70)
    fire('pointerup', 4, 70, 70)
    expect(h.tap).toHaveBeenCalledTimes(1)
    expect(h.tap).toHaveBeenCalledWith(70, 70)
  })
})
