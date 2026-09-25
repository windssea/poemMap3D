import * as THREE from 'three'
import { DebugTokens } from '../config/palette'
import { ChunkState } from '../world/chunk/Chunk'
import type { ChunkManager } from '../world/chunk/ChunkManager'

/** 区块边界：可见为石绿、生成中为古金、待重建为朱砂 */
export class ChunkDebugOverlay {
  readonly lines: THREE.LineSegments
  private tick = 0

  constructor() {
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: false }))
    this.lines.renderOrder = 20
    this.lines.frustumCulled = false
  }

  update(chunks: ChunkManager): void {
    if (this.tick++ % 20) return
    const pos: number[] = []
    const col: number[] = []
    const ready = new THREE.Color(DebugTokens.chunkReady)
    const pending = new THREE.Color(DebugTokens.chunkPending)
    const dirty = new THREE.Color(DebugTokens.chunkDirty)
    for (const r of chunks.records.values()) {
      if (r.state === ChunkState.READY) continue
      const c = r.state === ChunkState.VISIBLE ? ready : r.state === ChunkState.REMESH || r.state === ChunkState.DIRTY ? dirty : pending
      let y = 0
      for (const m of r.meshes) y = Math.max(y, (m.geometry.boundingBox?.max.y ?? 0) / 16)
      y = Math.max(y, 60)
      const x0 = r.cx * 16
      const z0 = r.cz * 16
      const seg = [x0, z0, x0 + 16, z0, x0 + 16, z0, x0 + 16, z0 + 16, x0 + 16, z0 + 16, x0, z0 + 16, x0, z0 + 16, x0, z0]
      for (let i = 0; i < seg.length; i += 2) {
        pos.push(seg[i], y + 1, seg[i + 1])
        col.push(c.r, c.g, c.b)
      }
    }
    const g = this.lines.geometry
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeBoundingSphere()
  }

  dispose(): void {
    this.lines.geometry.dispose()
    ;(this.lines.material as THREE.Material).dispose()
  }
}
