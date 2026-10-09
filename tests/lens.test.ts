import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BASE_FOV, CameraController, LENSES } from '../src/engine/camera/CameraController'
import type { WorldSampler } from '../src/world/WorldSampler'

/** 平地：避山不介入，只看焦段换算 */
function setup() {
  const sampler = { groundHeightAt: () => 0 } as unknown as WorldSampler
  const bounds = { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 }
  const ctl = new CameraController(sampler, bounds, { target: new THREE.Vector3(0, 0, 0), yaw: 0.4, pitch: 0.7, distance: 200 })
  ctl.setAspect(16 / 9)
  return ctl
}

const tanHalf = (deg: number) => Math.tan((deg * Math.PI) / 360)

describe('焦段：换焦段时镜头前后移，注视点处画面大小不变', () => {
  it('标准镜头：真实距离就是取景距离', () => {
    const c = setup()
    c.update(0.016)
    expect(c.lensScale).toBeCloseTo(1, 6)
    expect(c.eyeDistance).toBeCloseTo(200, 3)
    expect(c.camera.position.distanceTo(c.effective.target)).toBeCloseTo(200, 3)
  })

  for (const lens of ['wide', 'human', 'tele'] as const) {
    it(`${lens}：真实距离 = 取景距离 × tan(21°)/tan(半视场)，其余系统看到的仍是取景距离`, () => {
      const c = setup()
      c.setLens(LENSES[lens], true)
      c.update(0.016)
      const k = tanHalf(BASE_FOV) / tanHalf(LENSES[lens])
      expect(c.lensScale).toBeCloseTo(k, 6)
      expect(c.camera.fov).toBeCloseTo(LENSES[lens], 6)
      expect(c.eyeDistance).toBeCloseTo(200 * k, 2)
      expect(c.camera.position.distanceTo(c.effective.target)).toBeCloseTo(200 * k, 2)
      expect(c.effective.distance).toBeCloseTo(200, 2)
      // 注视点处一屏的高度（世界单位）与标准镜头相同
      expect(2 * c.eyeDistance * tanHalf(c.camera.fov)).toBeCloseTo(2 * 200 * tanHalf(BASE_FOV), 2)
    })
  }

  it('换焦段是一段推拉变焦：视场角约半秒到位，不是一跳', () => {
    const c = setup()
    c.update(0.016)
    c.setLens(LENSES.tele)
    c.update(0.016)
    expect(c.camera.fov).toBeGreaterThan(LENSES.tele + 5)
    for (let i = 0; i < 90; i++) c.update(0.016)
    expect(c.camera.fov).toBeCloseTo(LENSES.tele, 1)
  })
})
