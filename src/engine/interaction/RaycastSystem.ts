import * as THREE from 'three'
import { Blocks } from '../../world/block/Blocks'
import { WORLD_HEIGHT } from '../../world/coordinate/constants'
import { blockToChunk } from '../../world/coordinate/coords'
import type { World } from '../../world/World'
import type { WorldSampler } from '../../world/WorldSampler'

export interface RayHit {
  point: THREE.Vector3
  /** 命中的方块（近景区块内才有） */
  block: { x: number; y: number; z: number; state: number } | null
  /** 命中面法线 */
  normal: THREE.Vector3
  distance: number
}

/**
 * 射线检测：近景区块内按体素 DDA 逐格走，精确到方块；
 * 走出已加载区块后改为沿射线步进取样地形高度（覆盖图区域），再二分细化。
 * 不依赖网格包围盒。
 */
export class RaycastSystem {
  private readonly ray = new THREE.Raycaster()

  constructor(
    private readonly world: World,
    private readonly sampler: WorldSampler,
  ) {}

  fromScreen(camera: THREE.Camera, ndcX: number, ndcY: number, maxDist = 14000): RayHit | null {
    this.ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
    return this.cast(this.ray.ray.origin, this.ray.ray.direction, maxDist)
  }

  cast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number): RayHit | null {
    const d = dir.clone().normalize()
    /* 1. 体素 DDA */
    let x = Math.floor(origin.x)
    let y = Math.floor(origin.y)
    let z = Math.floor(origin.z)
    const sx = Math.sign(d.x)
    const sy = Math.sign(d.y)
    const sz = Math.sign(d.z)
    const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity
    const tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity
    const tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity
    let tmx = d.x !== 0 ? (sx > 0 ? x + 1 - origin.x : origin.x - x) * tdx : Infinity
    let tmy = d.y !== 0 ? (sy > 0 ? y + 1 - origin.y : origin.y - y) * tdy : Infinity
    let tmz = d.z !== 0 ? (sz > 0 ? z + 1 - origin.z : origin.z - z) * tdz : Infinity
    let t = 0
    const normal = new THREE.Vector3()
    let inLoaded = false
    const dda = Math.min(maxDist, 900)
    while (t < dda) {
      if (y >= 0 && y < WORLD_HEIGHT) {
        const loaded = !!this.world.getChunk(blockToChunk(x), blockToChunk(z))
        if (loaded) {
          inLoaded = true
          const s = this.world.getBlock(x, y, z)
          const id = s & 255
          if (id && (Blocks.solid[id] || Blocks.liquid[id])) {
            return { point: origin.clone().addScaledVector(d, t), block: { x, y, z, state: s }, normal, distance: t }
          }
        } else if (inLoaded || t > 64) break
      } else if (y < 0) break
      if (tmx < tmy && tmx < tmz) {
        x += sx
        t = tmx
        tmx += tdx
        normal.set(-sx, 0, 0)
      } else if (tmy < tmz) {
        y += sy
        t = tmy
        tmy += tdy
        normal.set(0, -sy, 0)
      } else {
        z += sz
        t = tmz
        tmz += tdz
        normal.set(0, 0, -sz)
      }
    }
    /* 2. 地形步进（从 DDA 停下处继续） */
    const p = new THREE.Vector3()
    let prev = t
    let step = Math.max(1.5, t * 0.01)
    while (t < maxDist) {
      p.copy(origin).addScaledVector(d, t)
      if (p.y < this.sampler.surfaceHeightAt(p.x, p.z)) {
        let lo = prev
        let hi = t
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2
          p.copy(origin).addScaledVector(d, mid)
          if (p.y < this.sampler.surfaceHeightAt(p.x, p.z)) hi = mid
          else lo = mid
        }
        p.copy(origin).addScaledVector(d, hi)
        return { point: p.clone(), block: null, normal: new THREE.Vector3(0, 1, 0), distance: hi }
      }
      prev = t
      step = Math.max(1.5, t * 0.008)
      t += step
      if (p.y < -50 || (d.y > 0 && p.y > 400)) break
    }
    return null
  }
}
