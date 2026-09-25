import type * as THREE from 'three'

/** 渲染流水线：目前为单次前向渲染；截图时临时保留绘制缓冲 */
export class RenderPipeline {
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /** 截图（PNG data URL） */
  capture(): string {
    this.render()
    return this.renderer.domElement.toDataURL('image/png')
  }
}
