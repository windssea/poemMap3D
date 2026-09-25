import * as THREE from 'three'

export interface TrailPoint {
  x: number
  y: number
  z: number
}

/**
 * 诗人足迹：相邻两站之间一道拱起的光带，年岁越后弧越高，沿线有流光；每站一根细柱。
 */
export class TrailRenderer {
  readonly group = new THREE.Group()
  private mat: THREE.ShaderMaterial | null = null

  show(points: TrailPoint[], color: string): void {
    this.clear()
    if (points.length < 2) return
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uCount: { value: points.length - 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float flow = fract(vUv.x * 3.0 - uTime * 0.6);
          float glow = smoothstep(0.0, 0.15, flow) * smoothstep(0.35, 0.15, flow);
          vec3 c = uColor * (0.75 + glow * 1.2);
          gl_FragColor = vec4(c, 0.92);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    for (let i = 1; i < points.length; i++) {
      const a = new THREE.Vector3(points[i - 1].x, points[i - 1].y, points[i - 1].z)
      const b = new THREE.Vector3(points[i].x, points[i].y, points[i].z)
      const d = a.distanceTo(b)
      const lift = 30 + d * 0.22 + i * 4
      const mid = a.clone().add(b).multiplyScalar(0.5)
      mid.y = Math.max(a.y, b.y) + lift
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      const radius = Math.max(1.4, Math.min(6, d * 0.006))
      const tube = new THREE.TubeGeometry(curve, Math.max(12, Math.min(60, Math.round(d / 12))), radius, 5, false)
      const m = new THREE.Mesh(tube, this.mat)
      m.renderOrder = 7
      this.group.add(m)
    }
    const pillar = new THREE.CylinderGeometry(1.2, 1.2, 24, 6)
    pillar.translate(0, 12, 0)
    for (const p of points) {
      const m = new THREE.Mesh(pillar, this.mat)
      m.position.set(p.x, p.y, p.z)
      this.group.add(m)
    }
  }

  update(time: number, distance: number): void {
    if (!this.mat) return
    this.mat.uniforms.uTime.value = time
    const s = Math.max(1, distance / 900)
    for (const c of this.group.children) if ((c as THREE.Mesh).geometry.type === 'CylinderGeometry') c.scale.set(s, s, s)
  }

  clear(): void {
    const geos = new Set<THREE.BufferGeometry>()
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) geos.add(m.geometry)
    })
    for (const g of geos) g.dispose()
    this.group.clear()
    this.mat?.dispose()
    this.mat = null
  }

  get visible(): boolean {
    return this.group.children.length > 0
  }
}
