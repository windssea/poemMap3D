import { describe, expect, it } from 'vitest'
import { drainUploads } from '../src/world/chunk/UploadScheduler'

/** 假时钟：每次上传耗时 cost 毫秒 */
function run(queues: number[][], costs: Record<number, number>, opts: { budgetMs?: number; cap?: number; starve?: number; valid?: (u: number) => boolean } = {}) {
  let t = 0
  const done: number[] = []
  const s: { queues: number[][]; ages?: number[] } = { queues }
  const frame = () =>
    drainUploads(s, {
      budgetMs: opts.budgetMs ?? 5,
      cap: opts.cap ?? 12,
      starveFrames: opts.starve ?? 8,
      now: () => t,
      valid: opts.valid ?? (() => true),
      install: (u) => {
        t += costs[u] ?? 1
        done.push(u)
      },
    }).done
  return { frame, done, s }
}

describe('GPU 上传排程', () => {
  it('时间优先：至少传一个，预算用完就停（第一个就超时也只传这一个）', () => {
    const r = run([[1, 2, 3], [], []], { 1: 9, 2: 1, 3: 1 })
    expect(r.frame()).toBe(1)
    expect(r.done).toEqual([1])
  })

  it('预算内尽量多传，但不超过条数上限', () => {
    const r = run([[...Array(30).keys()], [], []], {}, { budgetMs: 100, cap: 6 })
    expect(r.frame()).toBe(6)
  })

  it('近景优先：近景耗尽预算时远景这一帧不传', () => {
    const r = run([[1, 2, 3, 4, 5, 6], [100], []], { 1: 2, 2: 2, 3: 2 })
    r.frame()
    expect(r.done).toEqual([1, 2, 3])
    expect(r.s.queues[1]).toEqual([100])
  })

  it('远景不被饿死：连续若干帧没轮到就保底传一个', () => {
    const near = [...Array(100).keys()]
    const r = run([near, [500], [900]], Object.fromEntries(near.map((n) => [n, 6])), { starve: 4 })
    for (let f = 0; f < 3; f++) r.frame()
    expect(r.done).not.toContain(500)
    r.frame()
    expect(r.done).toContain(500)
    expect(r.done).not.toContain(900)
  })

  it('过期的直接丢掉、不计数', () => {
    const r = run([[1, 2, 3], [], []], {}, { valid: (u) => u !== 2 })
    r.frame()
    expect(r.done).toEqual([1, 3])
    expect(r.s.queues[0]).toEqual([])
  })

  it('最末一级也不饿死：近景、远景每帧都在补充，远景片仍在规定帧数内得到服务', () => {
    const near: number[] = []
    const far: number[] = []
    const region = [9000]
    let id = 0
    const r = run([near, far, region], {}, { starve: 8 })
    // 每次上传 6ms、预算 5ms：每帧只够传一个近景
    const costs = new Proxy({}, { get: () => 6 }) as Record<number, number>
    const r2 = run(r.s.queues, costs, { starve: 8 })
    for (let f = 0; f < 30; f++) {
      near.push(++id, ++id)
      far.push(1000 + ++id)
      r2.frame()
    }
    expect(r2.done).toContain(9000)
    expect(r2.done.indexOf(9000)).toBeLessThan(30)
  })
})
