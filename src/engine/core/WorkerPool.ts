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
}

export interface PoolStats {
  workers: number
  busy: number
  queued: number
  done: number
}

/**
 * Worker 池：带优先级的任务队列，空闲 Worker 取当前最高优先级的任务。
 */
export class WorkerPool {
  private readonly workers: Worker[] = []
  private readonly idle: Worker[] = []
  private readonly queue: Job[] = []
  private readonly inflight = new Map<number, Job>()
  private readonly byWorker = new Map<Worker, number>()
  private nextId = 1
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
      job = { id, msg: make(id), transfer, priority, resolve: resolve as (r: WorkerResponse) => void, reject, cancelled: false }
    })
    this.queue.push(job)
    this.pump()
    return {
      id,
      promise,
      cancel: () => {
        job.cancelled = true
      },
    }
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) {
      let best = -1
      let bp = Infinity
      for (let i = 0; i < this.queue.length; i++) {
        const j = this.queue[i]
        if (j.cancelled) {
          this.queue.splice(i--, 1)
          j.reject(new Error('cancelled'))
          continue
        }
        const p = j.priority()
        if (p < bp) {
          bp = p
          best = i
        }
      }
      if (best < 0) return
      const job = this.queue.splice(best, 1)[0]
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
