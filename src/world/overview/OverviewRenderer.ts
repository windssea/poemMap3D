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
  private readonly tiles = new Map<number, { fine: THREE.Mesh[]; coarse: THREE.Mesh[]; cx: number; cz: number; lod: number; covered: boolean }>()
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
    const fine = this.buildTile(t, 1)
    const coarse = this.buildTile(t, 2)
    for (const m of [...fine, ...coarse]) this.group.add(m)
    for (const m of coarse) m.visible = false
    const span = t.n * t.cell
    this.tiles.set(t.tz * this.grid.tilesX + t.tx, { fine, coarse, cx: t.x0 + span / 2, cz: t.z0 + span / 2, lod: 0, covered: false })
  }

  /**
   * 一块覆盖图的网格。step = 1 为原分辨率（8 方块一格），2 为远处用的粗网格（16 方块一格，三角形约为四分之一）。
   * 水面沿行合并成长条。
   */
  private buildTile(t: OverviewTileData, step: number): THREE.Mesh[] {
    const { n } = t
    const cell = t.cell * step
    const m = n / step
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
    const quad = (q: number[], normal: [number, number, number], c: [number, number, number], k: number) => {
      const v = pos.length / 3
      pos.push(...q)
      for (let i = 0; i < 4; i++) {
        nrm.push(...normal)
        col.push(c[0], c[1], c[2])
        kind.push(k)
      }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3)
    }
    const raw = (i: number, j: number) => {
      const k = (Math.min(n, Math.max(-1, j)) + 1) * W + (Math.min(n, Math.max(-1, i)) + 1)
      return Math.max(t.surface[k], t.water[k])
    }
    const top = (ci: number, cj: number) => {
      let h = -Infinity
      for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) h = Math.max(h, raw(ci * step + di, cj * step + dj))
      return h
    }
    for (let cj = 0; cj < m; cj++) {
      let run: { x0: number; y: number; depth: number; z0: number; z1: number } | null = null
      const flush = (x1: number) => {
        if (!run) return
        const v = wpos.length / 3
        wpos.push(run.x0, run.y, run.z0, run.x0, run.y, run.z1, x1, run.y, run.z1, x1, run.y, run.z0)
        for (let q = 0; q < 4; q++) {
          wnrm.push(0, 1, 0)
          wtint.push(run.depth * 36, 0, 0)
        }
        widx.push(v, v + 1, v + 2, v, v + 2, v + 3)
        run = null
      }
      for (let ci = 0; ci < m; ci++) {
        const i = ci * step
        const j = cj * step
        const k = (j + 1) * W + (i + 1)
        const x0 = t.x0 + ci * cell
        const z0 = t.z0 + cj * cell
        const x1 = x0 + cell
        const z1 = z0 + cell
        const o = (j * n + i) * 3
        const c: [number, number, number] = [t.color[o], t.color[o + 1], t.color[o + 2]]
        const sc: [number, number, number] = [t.side[o], t.side[o + 1], t.side[o + 2]]
        const wet = t.water[k] > t.surface[k]
        if (wet) {
          const y = t.water[k] + 14 / 16
          const depth = Math.min(7, Math.round((t.water[k] - t.surface[k]) / 4))
          if (run && (run.y !== y || run.depth !== depth)) flush(x0)
          if (!run) run = { x0, y, depth, z0, z1 }
          continue
        }
        flush(x0)
        const h = top(ci, cj) + 1
        quad([x0, h, z0, x0, h, z1, x1, h, z1, x1, h, z0], [0, 1, 0], c, t.kind[j * n + i])
        const sides: [number, number, [number, number, number], number[]][] = [
          [ci + 1, cj, [1, 0, 0], [x1, 0, z1, x1, 0, z0]],
          [ci - 1, cj, [-1, 0, 0], [x0, 0, z0, x0, 0, z1]],
          [ci, cj + 1, [0, 0, 1], [x0, 0, z1, x1, 0, z1]],
          [ci, cj - 1, [0, 0, -1], [x1, 0, z0, x0, 0, z0]],
        ]
        for (const [ni, nj, normal, e] of sides) {
          const nh = top(ni, nj) + 1
          if (nh >= h) continue
          const shade = normal[0] ? 0.82 : 0.7
          const lip = Math.max(nh, h - 1)
          quad([e[0], nh, e[2], e[3], nh, e[5], e[3], lip, e[5], e[0], lip, e[2]], normal, [sc[0] * shade, sc[1] * shade, sc[2] * shade], 0)
          quad([e[0], lip, e[2], e[3], lip, e[5], e[3], h, e[5], e[0], h, e[2]], normal, [c[0] * shade, c[1] * shade, c[2] * shade], t.kind[j * n + i])
        }
      }
      flush(t.x0 + m * cell)
    }
    const meshes: THREE.Mesh[] = []
    if (idx.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(Int8Array.from(nrm.map((v) => v * 127)), 3, true))
      g.setAttribute('aColor', new THREE.BufferAttribute(Uint8Array.from(col), 3, true))
      g.setAttribute('aKind', new THREE.BufferAttribute(Uint8Array.from(kind), 1))
      g.setIndex(pos.length / 3 < 65536 ? new THREE.Uint16BufferAttribute(idx, 1) : new THREE.Uint32BufferAttribute(idx, 1))
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, this.materials.overview)
      mesh.receiveShadow = true
      mesh.matrixAutoUpdate = false
      meshes.push(mesh)
    }
    if (widx.length) {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(wnrm, 3))
      g.setAttribute('aTint', new THREE.BufferAttribute(Uint8Array.from(wtint), 3, true))
      g.setAttribute('aFlags', new THREE.BufferAttribute(new Uint8Array(wpos.length / 3), 1))
      g.setIndex(widx)
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, this.materials.overviewWater)
      mesh.matrixAutoUpdate = false
      meshes.push(mesh)
    }
    return meshes
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
  private tick = 0

  /** 被近景 / 远景区块完全盖住的覆盖图块直接不画（顶点也省下） */
  private cull(mask: Uint8Array, maskW: number): void {
    const per = (this.grid.n * this.grid.cell) / 16
    for (const [k, t] of this.tiles) {
      const tx = k % this.grid.tilesX
      const tz = Math.floor(k / this.grid.tilesX)
      let covered = true
      for (let j = 0; j < per && covered; j++) for (let i = 0; i < per; i++) if (!mask[(tz * per + j) * maskW + tx * per + i]) { covered = false; break }
      t.covered = covered
      for (const m of t.fine) m.visible = !covered && !t.lod
      for (const m of t.coarse) m.visible = !covered && !!t.lod
    }
  }

  update(distance: number, camera?: THREE.Vector3, mask?: { data: Uint8Array; width: number }): void {
    if (mask && this.tick++ % 20 === 0) this.cull(mask.data, mask.width)
    /* 远处的图块换粗网格（带回差） */
    if (camera)
      for (const t of this.tiles.values()) {
        const d = Math.hypot(t.cx - camera.x, t.cz - camera.z)
        const lod = d > (t.lod ? 1400 : 1700) ? 1 : 0
        if (lod !== t.lod) {
          t.lod = lod
          for (const m of t.fine) m.visible = !t.covered && !lod
          for (const m of t.coarse) m.visible = !t.covered && !!lod
        }
      }
    const a = Math.min(1, Math.max(0, (distance - 900) / 900)) * 0.85
    for (const m of this.inkMaterials) m.opacity = a
    this.ink.visible = a > 0.01
  }

  get progress(): number {
    return this.total ? this.loaded / this.total : 0
  }

  dispose(): void {
    for (const t of this.tiles.values()) for (const m of [...t.fine, ...t.coarse]) m.geometry.dispose()
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.ink.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    for (const m of this.inkMaterials) m.dispose()
  }
}

