import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { SkyTokens } from '../config/palette'
import { MaterialLibrary } from '../engine/rendering/MaterialLibrary'
import { createSharedUniforms } from '../engine/rendering/SharedUniforms'
import { B } from '../world/block/Blocks'
import { S } from '../world/block/BlockState'
import { zoneIndex } from '../world/biome/TintZone'
import { createChunkMeshes } from '../world/chunk/ChunkMeshFactory'
import { analyzeConnectivity } from '../world/structure/StructureAnalysis'
import { PlaceMode, placeStructure, preparePlacement } from '../world/structure/StructurePlacer'
import type { VoxelStructure } from '../world/structure/VoxelStructure'
import { TREE_SCALE_HEIGHT, TREE_TYPES, TREES, TreeCache, crownRadius } from '../world/vegetation/TreeRegistry'
import type { TreeType } from '../world/vegetation/TreeDefinition'
import { meshVolume } from '../world/voxel/VoxelMesher'
import { VoxelVolume } from '../world/voxel/VoxelVolume'

const SPACING = 24
const cache = new TreeCache()

interface Cell {
  type: TreeType
  variant: number
  s: VoxelStructure
  x: number
  z: number
  height: number
}

/**
 * TreeLab：五类植物全部变体一字排开，可旋转缩放、切换正面 / 侧面 / 俯视 / 斜上；
 * 显示树种、变体、种子、方块数、包围盒、冠幅、连通块数与漂浮方块数。
 */
export function TreeLab() {
  const host = useRef<HTMLDivElement>(null)
  const [slot, setSlot] = useState(0)
  const [sel, setSel] = useState<{ type: TreeType; variant: number }>({ type: 'willow', variant: 0 })
  const [all, setAll] = useState(false)
  const camRef = useRef<{ fly: (x: number, z: number, view: string) => void } | null>(null)

  const cells = useMemo<Cell[]>(() => {
    const out: Cell[] = []
    TREE_TYPES.forEach((type, row) => {
      const def = TREES[type]
      for (let v = 0; v < def.variants; v++) {
        const scale = def.variantInfo[v].scale
        const [lo, hi] = type === 'bamboo' ? [11, 11] : TREE_SCALE_HEIGHT[scale]
        const height = Math.round((lo + hi) / 2)
        if (!all && (type !== sel.type || v !== sel.variant)) continue
        out.push({ type, variant: v, s: cache.get(type, v, height, slot, 0), x: all ? 12 + v * SPACING : 12, z: all ? 12 + row * SPACING : 12, height })
      }
    })
    return out
  }, [slot, all, sel])

  useEffect(() => {
    const el = host.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(SkyTokens.day.horizon)
    const shared = createSharedUniforms()
    const materials = new MaterialLibrary(shared, 8)
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.5, 2000)
    const controls = new OrbitControls(camera, renderer.domElement)
    const hemi = new THREE.HemisphereLight(new THREE.Color(SkyTokens.day.ambientSky), new THREE.Color(SkyTokens.day.ambientGround), 1.1)
    const sun = new THREE.DirectionalLight(new THREE.Color(SkyTokens.day.sun), 2.4)
    sun.position.set(80, 140, 110)
    sun.castShadow = true
    sun.shadow.mapSize.set(4096, 4096)
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, far: 400 })
    sun.target.position.set(60, 0, 60)
    scene.add(hemi, sun, sun.target)

    /* 草地台子 + 各树，一次网格化 */
    const W = 5 * SPACING + 2
    const vol = new VoxelVolume(-1, 0, -1, W, 40, TREE_TYPES.length * SPACING + 2)
    vol.tint.fill(zoneIndex('paddy'))
    for (let z = 0; z < vol.sz; z++) for (let x = 0; x < vol.sx; x++) vol.set(vol.ox + x, 0, vol.oz + z, S(B.GRASS))
    for (const c of cells) placeStructure(vol, preparePlacement({ id: 't', structure: c.s, x: c.x, y: 1, z: c.z, mode: PlaceMode.Soft, order: 0 }))
    const mesh = meshVolume(vol)
    const meshes = createChunkMeshes(0, 0, mesh.layers, materials)
    for (const m of meshes) scene.add(m)

    const fly = (x: number, z: number, view: string) => {
      const t = new THREE.Vector3(x + 0.5, 6, z + 0.5)
      const d = 34
      const off = view === 'front' ? new THREE.Vector3(0, 2, d) : view === 'side' ? new THREE.Vector3(d, 2, 0) : view === 'top' ? new THREE.Vector3(0.01, d * 1.2, 0) : new THREE.Vector3(d * 0.7, d * 0.7, d * 0.7)
      controls.target.copy(t)
      camera.position.copy(t).add(off)
      controls.update()
    }
    camRef.current = { fly }
    const first = cells.find((c) => c.type === sel.type && c.variant === sel.variant) ?? cells[0]
    if (all) {
      controls.target.set(60, 0, 60)
      camera.position.set(150, 120, 190)
      controls.update()
    } else fly(first.x, first.z, 'oblique')

    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()
    const onResize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight)
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
    }
    addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(raf)
      removeEventListener('resize', onResize)
      for (const m of meshes) m.geometry.dispose()
      materials.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
    // 只在换种子时重建场景
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells])

  const cell = cells.find((c) => c.type === sel.type && c.variant === sel.variant) ?? cells[0]
  const b = cell.s.bounds()
  const conn = analyzeConnectivity(cell.s)
  const fly = (view: string) => camRef.current?.fly(cell.x, cell.z, view)

  return (
    <div className="lab-page">
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <div className="chrome panel lab-panel">
        <h2>TreeLab · 树木样板</h2>
        {TREE_TYPES.map((t) => (
          <div key={t} className="amb-row" style={{ flexWrap: 'wrap' }}>
            <span className="lab" style={{ width: 52 }}>
              {TREES[t].name}
            </span>
            {TREES[t].variantInfo.map((v, i) => (
              <button
                key={i}
                className={`chip ${sel.type === t && sel.variant === i ? 'on' : ''}`}
                onClick={() => setSel({ type: t, variant: i })}
              >
                {v.name}
              </button>
            ))}
          </div>
        ))}
        <div className="amb-row" style={{ margin: '8px 0' }}>
          {[
            ['front', '正面'],
            ['side', '侧面'],
            ['top', '俯视'],
            ['oblique', '斜上'],
          ].map(([k, n]) => (
            <button key={k} className="chip" onClick={() => fly(k)}>
              {n}
            </button>
          ))}
          <button className={`chip ${all ? 'on' : ''}`} onClick={() => setAll((a) => !a)}>
            全部
          </button>
          <button className="chip" onClick={() => setSlot((s) => (s + 1) % TreeCache.SEED_SLOTS)}>
            换种子
          </button>
        </div>
        <table>
          <tbody>
            <tr>
              <td>树种</td>
              <td>
                {TREES[cell.type].name}（{cell.type}）
              </td>
            </tr>
            <tr>
              <td>变体</td>
              <td>
                #{cell.variant} {TREES[cell.type].variantInfo[cell.variant].name} · {TREES[cell.type].variantInfo[cell.variant].scale}
              </td>
            </tr>
            <tr>
              <td>种子槽</td>
              <td>{slot}</td>
            </tr>
            <tr>
              <td>高度</td>
              <td>{cell.height}</td>
            </tr>
            <tr>
              <td>方块数</td>
              <td>{cell.s.count}</td>
            </tr>
            <tr>
              <td>包围盒</td>
              <td>
                x {b.minX}..{b.maxX} · y {b.minY}..{b.maxY} · z {b.minZ}..{b.maxZ}
              </td>
            </tr>
            <tr>
              <td>冠幅半径</td>
              <td>{crownRadius(cell.s).toFixed(1)}</td>
            </tr>
            <tr>
              <td>连通块</td>
              <td>
                {conn.components}（漂浮 {conn.floating}）
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: 'var(--ink3)' }}>
          <a href="./">← 返回地图</a>
        </p>
      </div>
    </div>
  )
}
