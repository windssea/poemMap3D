import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'

export interface TrailPoint {
  x: number
  y: number
  z: number
}

export interface BuiltTrail {
  /** 每站在整条线上的弧长位置（0–1） */
  stopFrac: number[]
  /** 每站的地面位置 */
  stops: THREE.Vector3[]
}

/** 屏幕上的线宽（像素）：芯、晕 */
const CORE_PX = 3.2
const GLOW_PX = 11

/**
 * 诗人足迹：各站之间拱起的弧（远程弧高、近程弧低，越往后的行程整体抬高一层），串成一条平滑曲线。
 *  - 用屏幕空间的粗线（Line2）：远近都是一样粗细、边缘抗锯齿，不会远看细如发丝、近看粗如水管；
 *  - 芯线由暗到亮（起点淡、越往后越亮），下面衬一条半透明的光晕；
 *  - 弧线按 3 格一点密采样，离地净空的抬升先做平滑（翻山时缓缓拱起，不再一段段折角）；
 *  - 进度：按弧长把线段逐段显示出来，笔头处有一颗亮点。
 */
export class TrailRenderer {
  readonly group = new THREE.Group()
  private curve: THREE.CatmullRomCurve3 | null = null
  private lines: { line: Line2; mat: LineMaterial; segs: number }[] = []
  private head: THREE.Mesh | null = null
  private headMat: THREE.MeshBasicMaterial | null = null
  private readonly resolution = new THREE.Vector2(1280, 800)
  private prog = 0

  setResolution(w: number, h: number): void {
    this.resolution.set(w, h)
    for (const l of this.lines) l.mat.resolution.set(w, h)
  }

  build(stops: TrailPoint[], color: string, groundAt: (x: number, z: number) => number): BuiltTrail {
    this.clear()
    const P = stops.map((s) => new THREE.Vector3(s.x, s.y, s.z))
    const raw: THREE.Vector3[] = []
    const stopAt = [0]
    for (let i = 1; i < P.length; i++) {
      const A = P[i - 1]
      const B = P[i]
      const d = Math.hypot(B.x - A.x, B.z - A.z)
      const n = Math.max(12, Math.ceil(d / 3))
      const hh = 16 + d * 0.13 + i * 3
      const lift = 8 + i * 0.7
      for (let q = i === 1 ? 0 : 1; q <= n; q++) {
        const t = q / n
        raw.push(new THREE.Vector3(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t + lift + Math.sin(t * Math.PI) * hh, A.z + (B.z - A.z) * t))
      }
      stopAt.push(raw.length - 1)
    }
    if (raw.length < 2) return { stopFrac: P.map(() => 0), stops: P }
    /* 离地净空：每点需要的抬升，先做滑动取大（覆盖山体宽度）再高斯平滑，翻山时是一道缓拱 */
    const need = raw.map((p) => Math.max(0, groundAt(p.x, p.z) + 10 - p.y))
    const W = 8
    const maxed = need.map((_, i) => {
      let m = 0
      for (let k = -W; k <= W; k++) m = Math.max(m, need[Math.min(need.length - 1, Math.max(0, i + k))])
      return m
    })
    const smooth = maxed.map((_, i) => {
      let s = 0
      let w = 0
      for (let k = -W; k <= W; k++) {
        const g = Math.exp(-(k * k) / (2 * (W / 2) ** 2))
        s += maxed[Math.min(maxed.length - 1, Math.max(0, i + k))] * g
        w += g
      }
      return s / w
    })
    raw.forEach((p, i) => (p.y += Math.max(smooth[i], need[i])))

    const curve = new THREE.CatmullRomCurve3(raw, false, 'centripetal')
    curve.arcLengthDivisions = raw.length * 4
    this.curve = curve
    const lengths = curve.getLengths(curve.arcLengthDivisions)
    const total = lengths[lengths.length - 1] || 1
    /* 站点的弧长位置：用控制点在曲线上的参数换算（与显示进度一致） */
    const stopFrac = stopAt.map((k) => {
      const u = k / (raw.length - 1)
      const idx = Math.round(u * curve.arcLengthDivisions)
      return lengths[Math.min(lengths.length - 1, idx)] / total
    })

    /* 线：按弧长均匀取点 */
    const N = Math.min(6000, Math.max(200, Math.round(total / 1.2)))
    const pts = curve.getSpacedPoints(N)
    const pos = new Float32Array(pts.length * 3)
    const col = new Float32Array(pts.length * 3)
    const base = new THREE.Color(color)
    const dark = base.clone().multiplyScalar(0.55)
    const bright = base.clone().lerp(new THREE.Color(1, 0.95, 0.85), 0.25)
    const c = new THREE.Color()
    pts.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3)
      c.copy(dark).lerp(bright, i / (pts.length - 1))
      col.set([c.r, c.g, c.b], i * 3)
    })
    const make = (px: number, glow: boolean) => {
      const g = new LineGeometry()
      g.setPositions(pos)
      g.setColors(col)
      const mat = new LineMaterial({
        linewidth: px,
        vertexColors: true,
        worldUnits: false,
        transparent: true,
        opacity: glow ? 0.26 : 1,
        depthWrite: !glow,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
      })
      mat.fog = false
      mat.resolution.copy(this.resolution)
      const line = new Line2(g, mat)
      line.frustumCulled = false
      line.renderOrder = glow ? 21 : 20
      this.group.add(line)
      this.lines.push({ line, mat, segs: pts.length - 1 })
    }
    make(GLOW_PX, true)
    make(CORE_PX, false)
    /* 笔头亮点 */
    this.headMat = new THREE.MeshBasicMaterial({ color: bright.clone().lerp(new THREE.Color(1, 1, 1), 0.4), transparent: true, opacity: 0.95, depthWrite: false, fog: false })
    this.head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 8), this.headMat)
    this.head.renderOrder = 22
    this.group.add(this.head)
    this.setProgress(0)
    return { stopFrac, stops: P }
  }

  setProgress(frac: number): void {
    this.prog = Math.min(1, Math.max(0, frac))
    for (const l of this.lines) (l.line.geometry as LineGeometry).instanceCount = Math.max(0, Math.round(l.segs * this.prog))
    if (this.head && this.curve) {
      this.head.visible = this.prog > 0.001 && this.prog < 0.999
      this.head.position.copy(this.curve.getPointAt(this.prog))
    }
  }

  headAt(frac: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.curve ? out.copy(this.curve.getPointAt(Math.min(1, Math.max(0, frac)))) : out.set(0, 0, 0)
  }

  update(time: number): void {
    // 笔头轻轻呼吸，远看也找得到
    if (this.head && this.head.visible) {
      const k = 1 + 0.25 * Math.sin(time * 4)
      this.head.scale.setScalar(k)
    }
  }

  clear(): void {
    for (const l of this.lines) {
      l.line.geometry.dispose()
      l.mat.dispose()
    }
    this.lines = []
    this.head?.geometry.dispose()
    this.headMat?.dispose()
    this.head = null
    this.headMat = null
    this.group.clear()
    this.curve = null
  }

  get visible(): boolean {
    return this.group.children.length > 0
  }
}
