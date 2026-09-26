/**
 * 区块缓存（浏览器 IndexedDB，Worker 里直接用）：生成过的区块网格与方块数据存下来，
 * 下次放大缩小、再来这一带时直接取出，不再重新生成。
 *
 * 键 = 构建号 : 精度 : 坐标。构建号每次构建（开发时每次启动）都变，世界生成改了缓存自动作废；
 * 条目超过上限整库清空重来（简单可靠，远比 LRU 省事）。所有操作失败都静默降级为「不缓存」。
 */
const DB_NAME = 'shanhe-world'
const STORE = 'chunks'
const META_KEY = '__build'
const LIMIT = 9000

export class ChunkStore {
  private readonly db: Promise<IDBDatabase | null>
  private puts = 0

  constructor(private readonly build: string) {
    this.db = this.open()
  }

  private open(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    return new Promise((resolve) => {
      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(DB_NAME, 1)
      } catch {
        resolve(null)
        return
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onerror = () => resolve(null)
      req.onsuccess = () => {
        const db = req.result
        /* 构建号不同：整库作废 */
        const tx = db.transaction(STORE, 'readwrite')
        const st = tx.objectStore(STORE)
        const g = st.get(META_KEY)
        g.onsuccess = () => {
          if (g.result !== this.build) {
            st.clear()
            st.put(this.build, META_KEY)
          }
        }
        tx.oncomplete = () => resolve(db)
        tx.onerror = () => resolve(null)
        tx.onabort = () => resolve(null)
      }
    })
  }

  key(lod: number, cx: number, cz: number): string {
    return `${lod}:${cx}:${cz}`
  }

  async get<T>(key: string): Promise<T | null> {
    const db = await this.db
    if (!db) return null
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
        r.onsuccess = () => resolve((r.result as T) ?? null)
        r.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  async has(key: string): Promise<boolean> {
    const db = await this.db
    if (!db) return false
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).getKey(key)
        r.onsuccess = () => resolve(r.result !== undefined)
        r.onerror = () => resolve(false)
      } catch {
        resolve(false)
      }
    })
  }

  /**
   * 存：put 调用时就结构化克隆了值，调用方随后可以把其中的缓冲区转移给主线程。
   * 返回的 Promise 在克隆完成（请求已发出）时即结束，不等写盘。
   */
  async put(key: string, value: unknown): Promise<void> {
    const db = await this.db
    if (!db) return
    try {
      const st = db.transaction(STORE, 'readwrite').objectStore(STORE)
      st.put(value, key)
      if (++this.puts % 300 === 0) {
        const c = db.transaction(STORE, 'readonly').objectStore(STORE).count()
        c.onsuccess = () => {
          if (c.result > LIMIT) {
            const t = db.transaction(STORE, 'readwrite').objectStore(STORE)
            t.clear()
            t.put(this.build, META_KEY)
          }
        }
      }
    } catch {
      /* 配额满等：不缓存 */
    }
  }
}
