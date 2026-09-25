import * as THREE from 'three'
import type { MaterialLibrary } from '../../engine/rendering/MaterialLibrary'
import { BlockRenderLayer } from '../block/BlockDefinition'
import { CHUNK_SIZE } from '../coordinate/constants'
import { POSITION_SCALE, type MeshLayerData } from '../voxel/MeshBuffer'

/** 网格化结果 → BufferGeometry（主线程唯一的 GPU 上传点） */
export function createLayerGeometry(d: MeshLayerData): THREE.BufferGeometry | null {
  if (!d.indexCount) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(d.normals, 3, true))
  g.setAttribute('aUv', new THREE.BufferAttribute(d.uvs, 2))
  g.setAttribute('aTile', new THREE.BufferAttribute(d.tiles, 1))
  g.setAttribute('aAo', new THREE.BufferAttribute(d.ao, 1))
  g.setAttribute('aTint', new THREE.BufferAttribute(d.colors, 3, true))
  g.setAttribute('aFlags', new THREE.BufferAttribute(d.flags, 1))
  g.setIndex(new THREE.BufferAttribute(d.vertexCount < 65536 ? Uint16Array.from(d.indices) : d.indices, 1))
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}

/** 一个区块的四层网格 */
export function createChunkMeshes(cx: number, cz: number, layers: MeshLayerData[], materials: MaterialLibrary, lod = 1): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  layers.forEach((d, layer) => {
    const g = createLayerGeometry(d)
    if (!g) return
    const mat = layer === BlockRenderLayer.Translucent ? materials.water : materials.block[layer]
    const m = new THREE.Mesh(g, mat)
    m.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE)
    m.scale.setScalar(lod / POSITION_SCALE)
    m.matrixAutoUpdate = false
    m.updateMatrix()
    m.castShadow = lod === 1 && (layer === BlockRenderLayer.Solid || layer === BlockRenderLayer.Cutout)
    m.receiveShadow = layer !== BlockRenderLayer.Effect
    m.userData.layer = layer
    m.name = `chunk ${cx},${cz} L${layer}`
    out.push(m)
  })
  return out
}
