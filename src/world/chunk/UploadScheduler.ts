/**
 * GPU 上传排程：按层级分队列（近景优先），时间优先——
 *  - 每帧至少传一个（不饿死）；之后预算用完就停（单个不可中断的上传仍可能超一点）；
 *  - 条数另有上限，免得一帧里涌进一大批远景小块；
 *  - 低层级连续 starveFrames 帧没轮到时保底传一个，不被近景一直压着。
 * 过期的（区块已卸载、换了新记录）直接丢掉，不计数。
 */
export interface UploadQueues<T> {
  /** 按优先级从高到低排好的队列 */
  readonly queues: T[][]
  starve: number
}

export function drainUploads<T>(
  s: UploadQueues<T>,
  opts: { budgetMs: number; cap: number; starveFrames: number; now: () => number; valid: (u: T) => boolean; install: (u: T) => void },
): number {
  const t0 = opts.now()
  let done = 0
  let lowDone = false
  s.queues.forEach((q, level) => {
    let k = 0
    while (k < q.length && done < opts.cap && (done === 0 || opts.now() - t0 < opts.budgetMs)) {
      const u = q[k++]
      if (!opts.valid(u)) continue
      opts.install(u)
      done++
      if (level > 0) lowDone = true
    }
    if (k) q.splice(0, k)
  })
  const lowWaiting = s.queues.slice(1).some((q) => q.length)
  if (lowDone || !lowWaiting) {
    s.starve = 0
    return done
  }
  if (++s.starve < opts.starveFrames) return done
  s.starve = 0
  for (const q of s.queues.slice(1)) {
    let u = q.shift()
    while (u !== undefined && !opts.valid(u)) u = q.shift()
    if (u !== undefined) {
      opts.install(u)
      return done + 1
    }
  }
  return done
}
