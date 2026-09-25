import type { WorkerRequest, WorkerResponse } from '../../workers/protocol'

interface Job {
  id: number
  msg: WorkerRequest
  transfer: Transferable[]
  /** 越小越先做；派发时再求值（镜头移动后自动重排） */
  priority: () => number
  resolve: (r: WorkerResponse) => void
  reject: (e: Error) => void
  cancelled: boolean
  /** 上次重排时算得的优先级 */
  p: number
}

export interface PoolStats {
  workers: number
  busy: number
  queued: number
  done: number
}

/**
 * Worker 池：带优先级的任务队列，空闲 Worker 取当前最高优先级的任务。
 * 队列按优先级有序；优先级每隔一小段时间整体重算重排一次（镜头移动后跟上），
 * 平时入队二分插入、出队取头，不在每次派发时逐个重算（几千个任务时那是平方级的卡顿）。
 */
export class WorkerPool {
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly queue: Job[] = []
  private readonly inflight = new Map<number, Job>()
  private readonly byWorker = new Map<Worker, number>()
  private nextId = 1
  private lastSort = 0
  /** 整体重排的间隔（毫秒） */
  resortMs = 150
  done = 0
  onError: ((msg: string) => void) | null = null

  constructor(factory: () => Worker, count: number) {
    for (let i = 0; i < count; i++) {
      const w = factory()
      w.onmessage = (e: MessageEvent<WorkerResponse>) => this.receive(w, e.data)
      w.onerror = (e) => this.onError?.(e.message)
      this.workers.push(w)
    }
  }

  get size(): number {
    return this.workers.length
  }

  /** 给每个 Worker 发同一条消息（不进队列），等待各自的回复 */
  broadcast(msg: WorkerRequest, match: (r: WorkerResponse) => boolean): Promise<WorkerResponse[]> {
    return Promise.all(this.workers.map((w) => this.direct(w, msg, [], match)))
  }

  /** 只发给某一个 Worker，等待匹配的回复 */
  direct(w: Worker, msg: WorkerRequest, transfer: Transferable[], match: (r: WorkerResponse) => boolean): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const prev = w.onmessage
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.type === 'error' && e.data.id === undefined) {
          w.onmessage = prev
          reject(new Error(e.data.message))
          return
        }
        if (match(e.data)) {
          w.onmessage = prev
          resolve(e.data)
        }
      }
      w.postMessage(msg, transfer)
    })
  }

  first(): Worker {
    return this.workers[0]
  }

  at(i: number): Worker {
    return this.workers[i]
  }

  /** 全部初始化完毕后开始接任务 */
  activate(): void {
    this.idle.push(...this.workers)
    this.pump()
  }

  submit<T extends WorkerResponse>(make: (id: number) => WorkerRequest, priority: () => number, transfer: Transferable[] = []): { id: number; promise: Promise<T>; cancel: () => void } {
    const id = this.nextId++
    let job!: Job
    const promise = new Promise<T>((resolve, reject) => {
      job = { id, msg: make(id), transfer, priority, resolve: resolve as (r: WorkerResponse) => void, reject, cancelled: false, p: 0 }
    })
    job.p = priority()
    /* 二分插入（有序队列） */
    let lo = 0
    let hi = this.queue.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.queue[mid].p <= job.p) lo = mid + 1
      else hi = mid
    }
    this.queue.splice(lo, 0, job)
    if (this.idle.length) this.pump()
    return {
      id,
      promise,
      cancel: () => {
        job.cancelled = true
      },
    }
  }

  /** 丢掉已取消的、重算全部优先级并排序 */
  resort(): void {
    this.lastSort = performance.now()
    let n = 0
    for (const j of this.queue) {
      if (j.cancelled) {
        j.reject(new Error('cancelled'))
        continue
      }
      j.p = j.priority()
      this.queue[n++] = j
    }
    this.queue.length = n
    this.queue.sort((a, b) => a.p - b.p)
  }

  private pump(): void {
    if (!this.idle.length || !this.queue.length) return
    if (performance.now() - this.lastSort > this.resortMs) this.resort()
    while (this.idle.length && this.queue.length) {
      const job = this.queue.shift()!
      if (job.cancelled) {
        job.reject(new Error('cancelled'))
        continue
      }
      const w = this.idle.pop()!
      this.inflight.set(job.id, job)
      this.byWorker.set(w, job.id)
      w.postMessage(job.msg, job.transfer)
    }
  }

  private receive(w: Worker, r: WorkerResponse): void {
    const id = 'id' in r ? r.id : undefined
    if (id === undefined) return
    const job = this.inflight.get(id)
    if (!job) return
    this.inflight.delete(id)
    this.byWorker.delete(w)
    this.idle.push(w)
    this.done++
    if (r.type === 'error') job.reject(new Error(r.message))
    else job.resolve(r)
    this.pump()
  }

  stats(): PoolStats {
    return { workers: this.workers.length, busy: this.inflight.size, queued: this.queue.length, done: this.done }
  }

  dispose(): void {
    for (const w of this.workers) w.terminate()
    this.queue.length = 0
    this.inflight.clear()
  }
}
