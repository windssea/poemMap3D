import * as THREE from 'three'

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

/**
 * 诗人足迹光带：各站之间拱起的弧（远程弧高、近程弧低，越往后的行程整体抬高一层），
 * 串成一条按弧长参数化的曲线；内芯 + 外晕两层管，按进度逐段「画」出来，沿线有流光。
 */
export class TrailRenderer {
  readonly group = new THREE.Group()
  private curve: THREE.CatmullRomCurve3 | null = null
  private mats: THREE.ShaderMaterial[] = []

  build(stops: TrailPoint[], color: string, groundAt: (x: number, z: number) => number): BuiltTrail {
    this.clear()
    const P = stops.map((s) => new THREE.Vector3(s.x, s.y, s.z))
    const pts: THREE.Vector3[] = []
    const stopAt = [0]
    for (let i = 1; i < P.length; i++) {
      const A = P[i - 1]
      const B = P[i]
      const d = Math.hypot(B.x - A.x, B.z - A.z)
      const n = Math.max(10, Math.ceil(d / 14))
      const hh = 16 + d * 0.13 + i * 3
      const lift = 8 + i * 0.7
      for (let q = i === 1 ? 0 : 1; q <= n; q++) {
        const t = q / n
        const x = A.x + (B.x - A.x) * t
        const z = A.z + (B.z - A.z) * t
        const y = A.y + (B.y - A.y) * t + lift + Math.sin(t * Math.PI) * hh
        pts.push(new THREE.Vector3(x, Math.max(y, groundAt(x, z) + 10), z))
      }
      stopAt.push(pts.length - 1)
    }
    if (pts.length < 2) return { stopFrac: P.map(() => 0), stops: P }
    const cum = [0]
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
    const total = cum[cum.length - 1] || 1
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    curve.arcLengthDivisions = pts.length * 6
    this.curve = curve
    const segs = Math.min(3000, pts.length * 5)
    const c = new THREE.Color(color)
    const make = (radius: number, glow: boolean) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uProg: { value: 0 }, uColor: { value: c.clone() }, uGlow: { value: glow ? 1 : 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          uniform float uProg;
          uniform vec3 uColor;
          uniform float uGlow;
          varying vec2 vUv;
          void main() {
            if (vUv.x > uProg) discard;
            float flow = fract(vUv.x * 18.0 - uTime * 0.5);
            float band = smoothstep(0.0, 0.12, flow) * smoothstep(0.32, 0.12, flow);
            float tip = smoothstep(uProg - 0.004, uProg, vUv.x);
            vec3 col = uColor * (0.8 + band * 0.9 + tip * 1.4);
            float a = uGlow > 0.5 ? 0.22 + band * 0.15 : 0.95;
            gl_FragColor = vec4(col, a);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: !glow,
        blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: false,
      })
      this.mats.push(mat)
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, glow ? 10 : 8, false), mat)
      m.frustumCulled = false
      m.renderOrder = glow ? 21 : 20
      this.group.add(m)
    }
    make(1.5, false)
    make(5.5, true)
    return { stopFrac: stopAt.map((k) => cum[k] / total), stops: P }
  }

  setProgress(frac: number): void {
    for (const m of this.mats) m.uniforms.uProg.value = frac
  }

  headAt(frac: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.curve ? out.copy(this.curve.getPointAt(Math.min(1, Math.max(0, frac)))) : out.set(0, 0, 0)
  }

  update(time: number): void {
    for (const m of this.mats) m.uniforms.uTime.value = time
  }

  clear(): void {
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    this.group.clear()
    for (const m of this.mats) m.dispose()
    this.mats = []
    this.curve = null
  }

  get visible(): boolean {
    return this.group.children.length > 0
  }
}
