export type ResourceKind = 'json' | 'binary' | 'font'

interface Entry {
  kind: ResourceKind
  url: string
  promise?: Promise<unknown>
  value?: unknown
}

/**
 * 统一资源加载：诗词、地理数据、掩膜、字体等。提供缓存、预加载、懒加载、进度与释放。
 */
export class ResourceManager {
  private readonly entries = new Map<string, Entry>()
  private listeners = new Set<(loaded: number, total: number, label: string) => void>()
  private loaded = 0
  private total = 0

  constructor(private readonly base = import.meta.env.BASE_URL ?? '/') {}

  register(key: string, kind: ResourceKind, url: string): void {
    if (!this.entries.has(key)) this.entries.set(key, { kind, url })
  }

  onProgress(fn: (loaded: number, total: number, label: string) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private url(u: string): string {
    return /^https?:|^\//.test(u) ? u : `${this.base.replace(/\/$/, '')}/${u}`
  }

  load<T>(key: string): Promise<T> {
    const e = this.entries.get(key)
    if (!e) return Promise.reject(new Error(`未登记的资源：${key}`))
    if (e.value !== undefined) return Promise.resolve(e.value as T)
    if (!e.promise) {
      this.total++
      e.promise = this.fetch(e).then((v) => {
        e.value = v
        this.loaded++
        for (const fn of this.listeners) fn(this.loaded, this.total, key)
        return v
      })
    }
    return e.promise as Promise<T>
  }

  /** 预加载一组资源 */
  preload(keys: string[]): Promise<unknown[]> {
    return Promise.all(keys.map((k) => this.load(k)))
  }

  /** 空闲时再加载（字体等非首屏资源） */
  lazy(key: string): void {
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500))
    idle(() => void this.load(key).catch(() => undefined))
  }

  get<T>(key: string): T | undefined {
    return this.entries.get(key)?.value as T | undefined
  }

  dispose(key?: string): void {
    if (key) {
      const e = this.entries.get(key)
      if (e) {
        e.value = undefined
        e.promise = undefined
      }
    } else for (const e of this.entries.values()) (e.value = undefined), (e.promise = undefined)
  }

  private async fetch(e: Entry): Promise<unknown> {
    if (e.kind === 'font') {
      const [family, file] = e.url.split('|')
      const face = new FontFace(family, `url(${this.url(file)})`, { display: 'swap' })
      await face.load()
      document.fonts.add(face)
      return face
    }
    const res = await fetch(this.url(e.url))
    if (!res.ok) throw new Error(`资源加载失败：${e.url}（${res.status}）`)
    return e.kind === 'json' ? res.json() : res.arrayBuffer()
  }
}
