import * as THREE from 'three'
import { CHUNK_SIZE } from '../../world/coordinate/constants'
import type { World } from '../../world/World'
import type { SharedUniforms } from './SharedUniforms'

/** 烘焙范围（方块）与分辨率（每格一个像素） */
const SIZE = 160
const DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i / 8) * Math.PI * 2), Math.sin((i / 8) * Math.PI * 2)] as const)

/**
 * 重点文化建筑的「光照贴图」：只烘焙天空可见度（大尺度的环境遮蔽 + 柔和间接光），
 * 不烘焙任何有方向的日光阴影——晨昼暮夜照样由实时太阳决定。
 *
 * 做法：以地标为中心 160 格见方，按每列（含建筑）的最高方块，向八个方向看 12 格内的「地平线」仰角，
 * 越被四周高物围住（院落、檐下、楼与楼之间、山坳）天空越少，环境光越暗；结果写成一张单通道贴图，
 * 着色器只拿它乘间接漫反射（reflectedLight.indirectDiffuse），直射光不受影响。
 * 只在近景区块已载入后烘焙（依赖方块数据）；换一处地标再烘一次。
 */
export class AmbientBaker {
  readonly texture: THREE.DataTexture
  private readonly data = new Uint8Array(SIZE * SIZE).fill(255)

  constructor(private readonly shared: SharedUniforms) {
    this.texture = new THREE.DataTexture(this.data, SIZE, SIZE, THREE.RedFormat, THREE.UnsignedByteType)
    this.texture.magFilter = THREE.LinearFilter
    this.texture.minFilter = THREE.LinearFilter
    this.texture.needsUpdate = true
    shared.uBakeMap.value = this.texture
    shared.uBakeRect.value.set(0, 0, 0, 0)
  }

  /** 以 (cx, cz) 为中心烘焙；返回参与的列数（区块未载入的列按「开阔」处理） */
  bake(world: World, cx: number, cz: number): number {
    const x0 = Math.round(cx - SIZE / 2)
    const z0 = Math.round(cz - SIZE / 2)
    const pad = 12
    const W = SIZE + pad * 2
    const hm = new Int16Array(W * W).fill(-1)
    let known = 0
    for (let j = 0; j < W; j++)
      for (let i = 0; i < W; i++) {
        const x = x0 - pad + i
        const z = z0 - pad + j
        const c = world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE))
        if (!c) continue
        const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
        hm[j * W + i] = c.heightmap[lz * CHUNK_SIZE + lx]
        known++
      }
    for (let j = 0; j < SIZE; j++)
      for (let i = 0; i < SIZE; i++) {
        const k = (j + pad) * W + (i + pad)
        const h0 = hm[k]
        if (h0 < 0) {
          this.data[j * SIZE + i] = 255
          continue
        }
        /* 八个方向的地平线遮挡（仰角的正切，按距离衰减），平均后映射到 0.55–1 */
        let occ = 0
        for (const [dx, dz] of DIRS) {
          let m = 0
          for (let r = 1; r <= 12; r++) {
            const h = hm[(j + pad + Math.round(dz * r)) * W + (i + pad + Math.round(dx * r))]
            if (h < 0) continue
            m = Math.max(m, (h - h0 - 0.5) / (r * 1.3))
          }
          occ += Math.min(1, Math.max(0, m))
        }
        occ /= DIRS.length
        this.data[j * SIZE + i] = Math.round(255 * (1 - 0.45 * occ))
      }
    this.texture.needsUpdate = true
    this.shared.uBakeRect.value.set(x0, z0, SIZE, SIZE)
    return known
  }

  clear(): void {
    this.shared.uBakeRect.value.set(0, 0, 0, 0)
  }

  dispose(): void {
    this.texture.dispose()
  }
}
