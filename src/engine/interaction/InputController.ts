export interface InputHandlers {
  onStart(): void
  rotate(dx: number, dy: number): void
  pan(dx: number, dy: number): void
  zoom(delta: number, x: number, y: number): void
  tap(x: number, y: number): void
  hover(x: number, y: number): void
}

/**
 * 输入：鼠标 / 触控统一成「转、移、推拉、点、悬停」。
 * 拖动观景 · 右键（或 Shift）平移 · 滚轮远近 · 双指捏合缩放与平移 · 轻点选择。
 */
export class InputController {
  private readonly pointers = new Map<number, { x: number; y: number; button: number }>()
  private downAt = 0
  private downPos = { x: 0, y: 0 }
  private moved = 0
  private pinch = 0
  private readonly off: (() => void)[] = []
  enabled = true

  constructor(
    private readonly el: HTMLElement,
    private readonly h: InputHandlers,
  ) {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts)
      this.off.push(() => el.removeEventListener(type, fn as EventListener))
    }
    on('pointerdown', (e) => this.down(e))
    on('pointermove', (e) => this.move(e))
    on('pointerup', (e) => this.up(e))
    on('pointercancel', (e) => this.up(e))
    on('wheel', (e) => this.wheel(e), { passive: false })
    on('contextmenu', (e) => e.preventDefault())
  }

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return
    // 按住拖动时不让浏览器开始框选文字（地名签、界面文字）
    e.preventDefault()
    window.getSelection()?.removeAllRanges()
    this.el.setPointerCapture(e.pointerId)
    const p = this.local(e)
    this.pointers.set(e.pointerId, { ...p, button: e.button })
    if (this.pointers.size === 1) {
      this.downAt = performance.now()
      this.downPos = p
      this.moved = 0
    }
    if (this.pointers.size === 2) this.pinch = this.pinchDist()
    this.el.classList.add('grabbing')
    this.h.onStart()
  }

  private pinchDist(): number {
    const [a, b] = [...this.pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private move(e: PointerEvent): void {
    const p = this.local(e)
    const prev = this.pointers.get(e.pointerId)
    if (!prev) {
      if (this.enabled) this.h.hover(p.x, p.y)
      return
    }
    const dx = p.x - prev.x
    const dy = p.y - prev.y
    this.moved += Math.abs(dx) + Math.abs(dy)
    if (this.pointers.size === 2) {
      const before = [...this.pointers.values()]
      prev.x = p.x
      prev.y = p.y
      const d = this.pinchDist()
      if (this.pinch > 0) this.h.zoom((this.pinch - d) * 4, (before[0].x + before[1].x) / 2, (before[0].y + before[1].y) / 2)
      this.pinch = d
      this.h.pan(dx / 2, dy / 2)
      return
    }
    prev.x = p.x
    prev.y = p.y
    if (prev.button === 2 || e.shiftKey) this.h.pan(dx, dy)
    else this.h.rotate(dx, dy)
  }

  private up(e: PointerEvent): void {
    const had = this.pointers.delete(e.pointerId)
    if (this.pointers.size < 2) this.pinch = 0
    if (!this.pointers.size) this.el.classList.remove('grabbing')
    if (had && !this.pointers.size && this.moved < 7 && performance.now() - this.downAt < 400) this.h.tap(this.downPos.x, this.downPos.y)
  }

  private wheel(e: WheelEvent): void {
    if (!this.enabled) return
    e.preventDefault()
    const p = this.local(e)
    const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
    this.h.onStart()
    this.h.zoom(delta, p.x, p.y)
  }

  dispose(): void {
    for (const f of this.off) f()
  }
}
