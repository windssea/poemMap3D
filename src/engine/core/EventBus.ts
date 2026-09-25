type Handler<T> = (payload: T) => void

/** 类型化事件总线：引擎内部与引擎 → 应用层的通知都走它 */
export class EventBus<Events extends object> {
  private readonly map = new Map<keyof Events, Set<Handler<unknown>>>()

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.map.get(type)
    if (!set) this.map.set(type, (set = new Set()))
    set.add(fn as Handler<unknown>)
    return () => set!.delete(fn as Handler<unknown>)
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.map.get(type)
    if (set) for (const fn of [...set]) fn(payload)
  }

  clear(): void {
    this.map.clear()
  }
}
