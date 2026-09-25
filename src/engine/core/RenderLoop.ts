/**
 * 渲染循环：requestAnimationFrame 驱动，dt 限幅（切后台回来不跳帧），
 * 按登记顺序调用 update，最后调用 render。
 */
export class RenderLoop {
  private raf = 0
  private last = 0
  private running = false
  time = 0
  frame = 0
  /** 最近 60 帧的平均帧时长（毫秒） */
  frameMs = 16
  private readonly updates: ((dt: number, time: number) => void)[] = []

  constructor(private readonly render: (dt: number, time: number) => void) {}

  add(fn: (dt: number, time: number) => void): void {
    this.updates.push(fn)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    const tick = (now: number) => {
      if (!this.running) return
      this.raf = requestAnimationFrame(tick)
      const raw = (now - this.last) / 1000
      this.last = now
      const dt = Math.min(0.1, Math.max(0, raw))
      this.frameMs += (raw * 1000 - this.frameMs) / 60
      this.time += dt
      this.frame++
      for (const u of this.updates) u(dt, this.time)
      this.render(dt, this.time)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }
}
