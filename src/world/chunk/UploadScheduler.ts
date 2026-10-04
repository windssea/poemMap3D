/**
 * GPU 上传排程：按层级分队列（近景优先），时间优先——
 *  - 每帧至少传一个（不饿死）；之后预算用完就停（单个不可中断的上传仍可能超一点）；
 *  - 条数另有上限，免得一帧里涌进一大批远景小块；
 *  - 每一级各记等待帧数：哪一级有任务却连续 starveFrames 帧一个都没传，就给它保底传一个；
 *    几级同时到期时先给等得最久的（此前低优先级共用一个计数、保底又总先给第二级，第三级在两级都繁忙时会一直等）。
 *    保底这一个不受时间预算和条数上限约束（是显式策略，返回值里可以统计）。
 * 过期的（区块已卸载、换了新记录）直接丢掉，不计数。
 */
export interface UploadQueues<T> {
  /** 按优先级从高到低排好的队列 */
  readonly queues: T[][]
  /** 每一级连续多少帧没轮到（缺省按 0） */
  ages?: number[]
}

export interface DrainResult {
  /** 本帧上传条数（含保底） */
  done: number
  /** 保底上传了哪一级（没有为 -1） */
  rescued: number
}

export function drainUploads<T>(
  s: UploadQueues<T>,
  opts: { budgetMs: number; cap: number; starveFrames: number; now: () => number; valid: (u: T) => boolean; install: (u: T) => void },
): DrainResult {
  const ages = (s.ages ??= s.queues.map(() => 0))
  const t0 = opts.now()
  let done = 0
  const served = s.queues.map(() => false)
  s.queues.forEach((q, level) => {
    let k = 0
    while (k < q.length && done < opts.cap && (done === 0 || opts.now() - t0 < opts.budgetMs)) {
      const u = q[k++]
      if (!opts.valid(u)) continue
      opts.install(u)
      done++
      served[level] = true
    }
    if (k) q.splice(0, k)
  })
  // 等待帧数：传过、或队列空了归零，否则加一
  s.queues.forEach((q, level) => {
    ages[level] = served[level] || !q.length ? 0 : ages[level] + 1
  })
  // 保底：到期的各级里挑等得最久的一级传一个
  let pick = -1
  s.queues.forEach((_q, level) => {
    if (ages[level] >= opts.starveFrames && (pick < 0 || ages[level] > ages[pick])) pick = level
  })
  if (pick < 0) return { done, rescued: -1 }
  const q = s.queues[pick]
  let u = q.shift()
  while (u !== undefined && !opts.valid(u)) u = q.shift()
  ages[pick] = 0
  if (u === undefined) return { done, rescued: -1 }
  opts.install(u)
  return { done: done + 1, rescued: pick }
}
