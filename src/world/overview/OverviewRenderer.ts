import * as THREE from 'three'
import { MaterialTokens, OverviewTokens } from '../../config/palette'
import type { WorkerPool } from '../../engine/core/WorkerPool'
import type { MaterialLibrary } from '../../engine/rendering/MaterialLibrary'
import type { SceneManager } from '../../engine/rendering/SceneManager'
import type { OverviewResult } from '../../workers/protocol'
import type { Vec2 } from '../../utils/geometry2d'
import type { WorldContext } from '../generation/WorldContext'
import type { OverviewGrid, OverviewTileData } from './OverviewBuilder'

const hexRgb = (h: string): [number, number, number] => {
  const v = parseInt(h.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * 全国覆盖图：Chunk Surface Data → Overview Tile → 全国 Overview Mesh。
 * 同一套世界数据的低成本表示：只有顶面、宏观地形、水面、林色与名胜体量代理。
 * 近景区块显示的地方按掩膜让位（覆盖图淡出、区块淡入）。
 */
export class OverviewRenderer {
  readonly group = new THREE.Group()
  private readonly tiles = new Map<number, THREE.Mesh[]>()
  private readonly ink = new THREE.Group()
  private readonly inkMaterials: THREE.MeshBasicMaterial[] = []
  loaded = 0
  total = 0

  constructor(
    private readonly ctx: WorldContext,
    private readonly grid: OverviewGrid,
    private readonly materials: MaterialLibrary,
    scene: SceneManager,
  ) {
    this.group.name = 'overview'
    scene.attach('overview', this.group)
    scene.attach('effects', this.ink)
    this.buildLandmarkProxies()
    this.buildInkLines()
  }

  /** 请求全部覆盖图块（离 focus 近的先做） */
  requestAll(pool: WorkerPool, focus: () => { x: number; z: number }): Promise<void> {
    const { tilesX, tilesZ, n, cell } = this.grid
    const span = n * cell
    const jobs: Promise<void>[] = []
    this.total = tilesX * tilesZ
    for (let tz = 0; tz < tilesZ; tz++)
      for (let tx = 0; tx < tilesX; tx++) {
        const cx = this.grid.x0 + (tx + 0.5) * span
        const cz = this.grid.z0 + (tz + 0.5) * span
        const job = pool.submit<OverviewResult>(
          (id) => ({ type: 'overview', id, tx, tz }),
          () => {
            const f = focus()
            return 1e6 + Math.hypot(cx - f.x, cz - f.z)
          },
        )
        jobs.push(
          job.promise.then((r) => {
            this.addTile(r.tile)
            this.loaded++
          }),
        )
      }
    return Promise.all(jobs).then(() => undefined)
  }

  private addTile(t: OverviewTileData): void {
    const { n, cell } = t
    const W = n + 2
    const pos: number[] = []
    const nrm: number[] = []
    const col: number[] = []
    const kind: number[] = []
    const idx: number[] = []
    const wpos: number[] = []
    const wnrm: number[] = []
    const wtint: number[] = []
    const widx: number[] = []
    const quad = (p: number[], normal: [number, number, number], c: [number, number, number], k: number) => {
      const v = pos.length / 3
      pos.push(...p)
      for (let i = 0; i < 4; i++) {
        nrm.push(...normal)
        col.push(c[0], c[1], c[2])
        kind.push(k)
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    const top = (i: number, j: number) => {
      const k = (j + 1) * W + (i + 1)
      return Math.max(t.surface[k], t.water[k])
    }
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const k = (j + 1) * W + (i + 1)
        const x0 = t.x0 + i * cell
        const z0 = t.z0 + j * cell
        const x1 = x0 + cell
        const z1 = z0 + cell
        const o = (j * n + i) * 3
        const c: [number, number, number] = [t.color[o], t.color[o + 1], t.color[o + 2]]
        const sc: [number, number, number] = [t.side[o], t.side[o + 1], t.side[o + 2]]
        const wet = t.water[k] > t.surface[k]
        const h = top(i, j) + 1
        if (wet) {
          const y = t.water[k] + 14 / 16
          const v = wpos.length / 3
          wpos.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0)
          const depth = Math.min(7, Math.round((t.water[k] - t.surface[k]) / 4))
          for (let q = 0; q < 4; q++) {
            wnrm.push(0, 1, 0)
            wtint.push(depth * 36, 0, 0)
          }
          widx.push(v, v + 1, v + 2, v, v + 2, v + 3)
        } else quad([x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0], [0, 1, 0], c, t.kind[j * n + i])
        if (wet) continue
        /* 侧面：邻格更低时出面 */
        const sides: [number, number, [number, number, number], number[]][] = [
          [i + 1, j, [1, 0, 0], [x1, 0, z1, x1, 0, z0]],
          [i - 1, j, [-1, 0, 0], [x0, 0, z0, x0, 0, z1]],
          [i, j + 1, [0, 0, 1], [x0, 0, z1, x1, 0, z1]],
          [i, j - 1, [0, 0, -1], [x1, 0, z0, x0, 0, z0]],
        ]
        for (const [ni, nj, normal, e] of sides) {
          const nh = top(ni, nj) + 1
          if (nh >= h) continue
          const shade = normal[0] ? 0.82 : 0.7
          const scol: [number, number, number] = [sc[0] * shade, sc[1] * shade, sc[2] * shade]
          // 侧面顶沿一圈沿用顶面色（草皮口）
          const lip = Math.max(nh, h - 1)
          quad([e[0], nh, e[2], e[3], nh, e[5], e[3], lip, e[5], e[0], lip, e[2]], normal, scol, 0)
          quad([e[0], lip, e[2], e[3], lip, e[5], e[3], h, e[5], e[0], h, e[2]], normal, [c[0] * shade, c[1] * shade, c[2] * shade], t.kind[j * n + i])
        }
      }
    const meshes: THREE.Mesh[] = []
    if (idx.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
      g.setAttribute('aColor', new THREE.BufferAttribute(Uint8Array.from(col), 3, true))
      g.setAttribute('aKind', new THREE.BufferAttribute(Uint8Array.from(kind), 1))
      g.setIndex(idx)
      g.computeBoundingSphere()
      const m = new THREE.Mesh(g, this.materials.overview)
      m.receiveShadow = true
      m.matrixAutoUpdate = false
      meshes.push(m)
    }
    if (widx.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(wnrm, 3))
      g.setAttribute('aTint', new THREE.BufferAttribute(Uint8Array.from(wtint), 3, true))
      g.setAttribute('aFlags', new THREE.BufferAttribute(new Uint8Array(wpos.length / 3), 1))
      g.setIndex(widx)
      g.computeBoundingSphere()
      const m = new THREE.Mesh(g, this.materials.overviewWater)
      m.matrixAutoUpdate = false
      meshes.push(m)
    }
    for (const m of meshes) this.group.add(m)
    this.tiles.set(t.tz * this.grid.tilesX + t.tx, meshes)
  }

  /** 名胜体量代理：每座建筑一个「墙身 + 屋顶」的盒子，远看有城有塔 */
  private buildLandmarkProxies(): void {
    const pos: number[] = []
    const nrm: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const roof = hexRgb(OverviewTokens.landmarkRoof)
    const wall = hexRgb(OverviewTokens.landmarkWall)
    const brick = hexRgb(MaterialTokens.cityBrick[0])
    const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, topC: [number, number, number], sideC: [number, number, number]) => {
      const faces: [number[], [number, number, number], [number, number, number]][] = [
        [[x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0], [0, 1, 0], topC],
        [[x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1], [1, 0, 0], sideC],
        [[x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], [-1, 0, 0], sideC],
        [[x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], [0, 0, 1], sideC],
        [[x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0], [0, 0, -1], sideC],
      ]
      for (const [p, n, c] of faces) {
        const v = pos.length / 3
        pos.push(...p)
        for (let i = 0; i < 4; i++) {
          nrm.push(...n)
          col.push(...c)
        }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
      }
    }
    for (const lm of this.ctx.landmarks.landmarks)
      for (const p of lm.placements) {
        const w = p.world
        const isWall = p.id.startsWith('wall') || p.id.startsWith('gate')
        const top = isWall ? brick : roof
        box(w.minX, w.minY, w.minZ, w.maxX + 1, w.maxY + 1, w.maxZ + 1, top, isWall ? brick : wall)
      }
    const wallSegs = this.ctx.greatWall.points
    for (let i = 0; i < wallSegs.length; i += 3) {
      const p = wallSegs[i]
      box(p.x - 1, p.top - 6, p.z - 1, p.x + 2, p.top + 1, p.z + 2, brick, brick)
    }
    if (!idx.length) return
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(Uint8Array.from(col), 3, true))
    g.setAttribute('aKind', new THREE.BufferAttribute(new Uint8Array(pos.length / 3), 1))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, this.materials.overview)
    m.castShadow = true
    m.name = 'landmark-proxies'
    this.group.add(m)
  }

  /** 长江（石青）、黄河（赭黄）、长城（赭红）：拉远时显出一道墨线 */
  private buildInkLines(): void {
    const lines: [Vec2[] | null, string, number][] = [
      [this.ctx.rivers.line('yangtze'), OverviewTokens.inkRiver, 7],
      [this.ctx.rivers.line('yellow'), OverviewTokens.inkYellowRiver, 7],
      [this.ctx.greatWall.points.map((p) => [p.x, p.z] as const), OverviewTokens.greatWall, 6],
    ]
    for (const [pts, color, width] of lines) {
      if (!pts || pts.length < 2) continue
      const step = Math.max(1, Math.floor(pts.length / 600))
      const sparse = pts.filter((_, i) => i % step === 0)
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i < sparse.length; i++) {
        const [x, z] = sparse[i]
        const [ax, az] = sparse[Math.max(0, i - 1)]
        const [bx, bz] = sparse[Math.min(sparse.length - 1, i + 1)]
        let nx = -(bz - az)
        let nz = bx - ax
        const l = Math.hypot(nx, nz) || 1
        nx = (nx / l) * width
        nz = (nz / l) * width
        const y = this.ctx.terrain.surfaceHeightAt(x, z, true) + 14
        pos.push(x + nx, y, z + nz, x - nx, y, z - nz)
        if (i > 0) {
          const v = i * 2
          idx.push(v - 2, v - 1, v, v - 1, v + 1, v)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false })
      this.inkMaterials.push(mat)
      const m = new THREE.Mesh(g, mat)
      m.renderOrder = 5
      this.ink.add(m)
    }
  }

  /** 镜头拉远时显出墨线 */
  update(distance: number): void {
    const a = Math.min(1, Math.max(0, (distance - 900) / 900)) * 0.85
    for (const m of this.inkMaterials) m.opacity = a
    this.ink.visible = a > 0.01
  }

  get progress(): number {
    return this.total ? this.loaded / this.total : 0
  }

  dispose(): void {
    for (const ms of this.tiles.values()) for (const m of ms) m.geometry.dispose()
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.ink.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    for (const m of this.inkMaterials) m.dispose()
  }
}

