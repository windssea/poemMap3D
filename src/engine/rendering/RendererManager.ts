import * as THREE from 'three'

/** WebGL 渲染器：创建、尺寸、像素比、截图 */
export class RendererManager {
  readonly renderer: THREE.WebGLRenderer
  readonly canvas: HTMLCanvasElement
  private readonly ro: ResizeObserver
  width = 1
  height = 1
  private readonly listeners = new Set<(w: number, h: number) => void>()

  constructor(private readonly container: HTMLElement, pixelRatio: number) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.canvas = this.renderer.domElement
    this.canvas.style.display = 'block'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.touchAction = 'none'
    this.canvas.tabIndex = 0
    container.appendChild(this.canvas)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.width = w
    this.height = h
    this.renderer.setSize(w, h, false)
    for (const fn of this.listeners) fn(w, h)
  }

  setPixelRatio(r: number): void {
    this.renderer.setPixelRatio(r)
    this.resize()
  }

  dispose(): void {
    this.ro.disconnect()
    this.renderer.dispose()
    this.canvas.remove()
  }
}
