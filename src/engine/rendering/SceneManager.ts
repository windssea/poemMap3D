import * as THREE from 'three'

export type SceneLayer = 'world' | 'overview' | 'environment' | 'effects' | 'debug'

/**
 * 场景管理：唯一可以往 Three.js 场景里挂对象的地方。
 * 业务模块不直接 scene.add()，而是通过 attach(层, 对象)。
 */
export class SceneManager {
  readonly scene = new THREE.Scene()
  private readonly layers: Record<SceneLayer, THREE.Group>

  constructor() {
    this.layers = {
      world: new THREE.Group(),
      overview: new THREE.Group(),
      environment: new THREE.Group(),
      effects: new THREE.Group(),
      debug: new THREE.Group(),
    }
    for (const [name, g] of Object.entries(this.layers)) {
      g.name = name
      this.scene.add(g)
    }
  }

  attach(layer: SceneLayer, obj: THREE.Object3D): THREE.Object3D {
    this.layers[layer].add(obj)
    return obj
  }

  detach(obj: THREE.Object3D): void {
    obj.parent?.remove(obj)
  }

  setLayerVisible(layer: SceneLayer, v: boolean): void {
    this.layers[layer].visible = v
  }

  layer(layer: SceneLayer): THREE.Group {
    return this.layers[layer]
  }

  /** 统计三角形与绘制对象（调试面板） */
  stats(layer: SceneLayer): { meshes: number; triangles: number } {
    let meshes = 0
    let triangles = 0
    this.layers[layer].traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || !m.visible) return
      meshes++
      const g = m.geometry
      triangles += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
    })
    return { meshes, triangles }
  }
}
