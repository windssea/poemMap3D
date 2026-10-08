import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WaterReflection } from '../src/engine/rendering/WaterReflection'
import { createSharedUniforms } from '../src/engine/rendering/SharedUniforms'

/** 不起 WebGL：假渲染器只数 render 调了几次 */
function setup() {
  const shared = createSharedUniforms()
  const refl = new WaterReflection(shared)
  let renders = 0
  const renderer = {
    getDrawingBufferSize: (v: THREE.Vector2) => v.set(2560, 1440),
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    clear: () => {},
    render: () => renders++,
    shadowMap: { autoUpdate: true },
  } as unknown as THREE.WebGLRenderer
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
  cam.position.set(0, 40, 60)
  cam.lookAt(0, 0, 0)
  refl.setArea({ x: 0, z: 0, y: 10, r: 30 })
  let t = 0
  vi.spyOn(performance, 'now').mockImplementation(() => t)
  /** 走 n 帧（每帧 16ms）；move 为真时每帧挪一下镜头 */
  const run = (n: number, move: boolean, maxSize = 1024) => {
    const before = renders
    for (let i = 0; i < n; i++) {
      if (move) cam.position.x += 0.5
      t += 16
      refl.update(renderer, scene, cam, true, maxSize)
    }
    return renders - before
  }
  return { refl, run, renders: () => renders }
}

afterEach(() => vi.restoreAllMocks())

describe('水面倒影刷新节拍', () => {
  it('镜头停着每两帧一张，在动时每六帧一张', () => {
    const { run } = setup()
    run(30, false)
    expect(run(60, false)).toBe(30)
    expect(run(60, true)).toBeLessThanOrEqual(11)
    expect(run(60, true)).toBeGreaterThanOrEqual(9)
  })

  it('停稳 0.2 秒立刻补渲一张，之后回到每两帧', () => {
    const { run, refl } = setup()
    run(60, true)
    // 停下后 0.2 秒内仍按「在动」的节拍
    run(12, false)
    expect(refl.info.every).toBe(6)
    // 刚越过 0.2 秒的那一帧必渲
    expect(run(1, false)).toBe(1)
    expect(refl.info.every).toBe(2)
  })

  it('反射图最长边按画质封顶', () => {
    const a = setup()
    a.run(2, false, 512)
    expect(Math.max(a.refl.info.w, a.refl.info.h)).toBe(512)
    vi.restoreAllMocks()
    const b = setup()
    b.run(2, false, 1024)
    expect(b.refl.info.w).toBe(1024)
    expect(b.refl.info.h).toBe(720)
  })
})
