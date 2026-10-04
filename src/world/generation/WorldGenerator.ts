import { SILT_BIT } from '../biome/TintZone'
import { B, Blocks } from '../block/Blocks'
import { S } from '../block/BlockState'
import type { Chunk } from '../chunk/Chunk'
import type { GreatWallSystem } from '../landmark/GreatWallSystem'
import type { LandmarkRegistry } from '../landmark/LandmarkRegistry'
import { BLOCK_LIGHT_REACH, emissionLevel, skyBlocking } from '../light/VolumeSkyLight'
import { type PreparedPlacement, placeStructure, PlaceMode, preparePlacement } from '../structure/StructurePlacer'
import type { TerrainManager } from '../terrain/TerrainManager'
import { decorateGround } from '../vegetation/GroundDecoration'
import type { TreeInstance, TreePlacementSystem } from '../vegetation/TreePlacementSystem'
import { MAX_TREE_RADIUS } from '../vegetation/TreeRegistry'
import { type LightHalo, VoxelVolume } from '../voxel/VoxelVolume'
import { World } from '../World'
import { WorldConfig } from '../WorldConfig'

export interface ChunkGenerationResult {
  chunk: Chunk
  volume: VoxelVolume
  trees: number
  structures: number
  ms: number
}

/**
 * 区块生成流水线（纯函数，世界坐标决定一切）：
 *   Terrain Block Fill → Water Fill → Landmark Reservation / Structure Placement
 *   → Vegetation Decoration → Ground Decoration
 * 直接生成「区块 + 外边一圈」，外边与相邻区块内部完全一致，mesher 不必等待邻居。
 */
/** 每处建筑里的发光方块（相对坐标与光级），按摆放缓存 */
const emitterCache = new WeakMap<PreparedPlacement, number[]>()
function emittersOf(p: PreparedPlacement): number[] {
  let e = emitterCache.get(p)
  if (!e) {
    e = []
    for (const b of p.blocks) {
      const lv = emissionLevel(b.state & 255)
      if (lv > 0) e.push(b.x, b.y, b.z, lv)
    }
    emitterCache.set(p, e)
  }
  return e
}

/** 每处建筑里挡光方块的相对坐标（x, y, z 三个一组），按摆放缓存：体外遮挡只看这些 */
const blockerCache = new WeakMap<PreparedPlacement, Int16Array>()
function blockersOf(p: PreparedPlacement, blocks: Uint8Array): Int16Array {
  let e = blockerCache.get(p)
  if (!e) {
    const out: number[] = []
    for (const b of p.blocks) if (blocks[b.state & 255]) out.push(b.x, b.y, b.z)
    e = Int16Array.from(out)
    blockerCache.set(p, e)
  }
  return e
}

export class ChunkGenerator {
  /** 体外遮挡用的地面高度：相邻区块的外扩圈大片重叠，按列缓存（满了整个清空） */
  private readonly ground = new Map<number, number>()

  private groundAt(x: number, z: number): number {
    const k = ((x + 32768) << 16) | (z + 32768)
    let h = this.ground.get(k)
    if (h === undefined) {
      if (this.ground.size > 200000) this.ground.clear()
      h = Math.floor(this.terrain.column(x, z).height)
      this.ground.set(k, h)
    }
    return h
  }

  constructor(
    private readonly terrain: TerrainManager,
    private readonly landmarks: LandmarkRegistry,
    private readonly greatWall: GreatWallSystem,
    private readonly trees: TreePlacementSystem,
    private readonly seed: number = WorldConfig.seed,
  ) {}

  generateVolume(cx: number, cz: number, pad = 1, decorate = true): { volume: VoxelVolume; trees: number; structures: number } {
    return this.generateArea(VoxelVolume.forChunk(cx, cz, pad), decorate)
  }

  /** 任意矩形范围（远景 2×2 区块一片时用）：同一条流水线填进给定的体素体 */
  generateArea(vol: VoxelVolume, decorate = true): { volume: VoxelVolume; trees: number; structures: number } {
    const region = this.terrain.region(vol.ox, vol.oz, vol.sx, vol.sz)

    /* 地形方块：岩层 → 土层 → 地表；其上注水 */
    for (let lz = 0; lz < vol.sz; lz++)
      for (let lx = 0; lx < vol.sx; lx++) {
        const s = region.samples[lz * vol.sx + lx]
        vol.tint[lz * vol.sx + lx] = s.tintZone | (s.silt ? SILT_BIT : 0)
        vol.biome[lz * vol.sx + lx] = s.biome
        const base = lx + lz * vol.sx
        const stride = vol.sx * vol.sz
        const top = S(s.topBlock)
        const soil = S(s.soilBlock)
        const rock = S(s.rockBlock)
        for (let y = 0; y <= s.surfaceY; y++) {
          const depth = s.surfaceY - y
          vol.data[y * stride + base] = depth === 0 ? top : depth <= s.soilDepth ? soil : y < 3 ? S(B.STONE) : rock
        }
        if (s.waterY > s.surfaceY) for (let y = s.surfaceY + 1; y <= s.waterY; y++) vol.data[y * stride + base] = S(B.WATER)
        /* 田：麦田为耕地上一行行麦子；水田把表层换成水（与田埂齐平），稻秧隔格插在水上 */
        if (s.field) {
          const y = s.surfaceY
          const wx = vol.ox + lx
          const wz = vol.oz + lz
          if (s.field === 2) {
            vol.data[y * stride + base] = S(B.WATER)
            if (y > 0) vol.data[(y - 1) * stride + base] = S(B.MUD)
            if (!(wx & 1) && !(wz & 1)) vol.data[(y + 1) * stride + base] = S(B.RICE)
          } else {
            vol.data[y * stride + base] = S(B.FARMLAND)
            if (s.field === 1 && ((wx % 3) + 3) % 3 !== 0) vol.data[(y + 1) * stride + base] = S(B.WHEAT)
          }
        }
      }

    /* 地标建筑 */
    const x0 = vol.ox
    const z0 = vol.oz
    const x1 = vol.ox + vol.sx - 1
    const z1 = vol.oz + vol.sz - 1
    const placements = this.landmarks.placementsNear(x0, z0, x1, z1)
    for (const p of placements) placeStructure(vol, p)
    /* 体外附近的灯笼、格窗：算方块光时从体块边上照进来（近景才用；与邻区块看到的是同一份摆放表，边界两侧接得上） */
    if (decorate) {
      const R = BLOCK_LIGHT_REACH
      const ext: number[] = []
      for (const p of this.landmarks.placementsNear(x0 - R, z0 - R, x1 + R, z1 + R)) {
        const e = emittersOf(p)
        for (let k = 0; k < e.length; k += 4) {
          const x = p.x + e[k]
          const z = p.z + e[k + 2]
          if (x >= x0 && x <= x1 && z >= z0 && z <= z1) continue
          if (x < x0 - R || x > x1 + R || z < z0 - R || z > z1 + R) continue
          ext.push(x, p.y + e[k + 1], z, e[k + 3])
        }
      }
      vol.emitters = ext.length ? Int32Array.from(ext) : null
      if (ext.length) vol.lightHalo = this.lightHalo(vol, ext)
    }

    /* 树：树根在外扩范围内的都要考虑（树冠可能伸进来） */
    const R = MAX_TREE_RADIUS
    const list: TreeInstance[] = [...this.trees.collect(x0 - R, z0 - R, x1 + R, z1 + R), ...this.landmarks.treesNear(x0 - R, z0 - R, x1 + R, z1 + R)]
    list.sort((a, b) => a.order - b.order || a.x - b.x || a.z - b.z)
    let treeCount = 0
    for (const t of list) {
      const s = this.trees.cache.get(t.type, t.variant, t.height, t.slot, t.rotation)
      const p = preparePlacement({ id: 'tree', structure: s, x: t.x, y: t.y, z: t.z, mode: PlaceMode.Soft, order: t.order })
      if (p.world.maxX < x0 || p.world.minX > x1 || p.world.maxZ < z0 || p.world.minZ > z1) continue
      if (placeStructure(vol, p)) treeCount++
    }
    /* 长城在树之后砌：树冠伸进马道、敌台门洞的枝叶由墙清掉 */
    this.greatWall.apply(vol)

    /* 地被 */
    if (decorate) decorateGround(vol, region, this.landmarks.occupancy, this.seed)
    return { volume: vol, trees: treeCount, structures: placements.length }
  }

  /**
   * 体外遮挡：体块外扩 BLOCK_LIGHT_REACH 一圈、灯的高度上下各一个光程里，地形（地表以下）与附近建筑的挡光方块。
   * 只在体外有灯时算（城镇、园林的区块），树、长城等不计（灯光照不到那么远）
   */
  private lightHalo(vol: VoxelVolume, ext: number[]): LightHalo {
    const R = BLOCK_LIGHT_REACH
    let yMin = Infinity
    let yMax = -Infinity
    for (let k = 0; k < ext.length; k += 4) {
      yMin = Math.min(yMin, ext[k + 1] - ext[k + 3])
      yMax = Math.max(yMax, ext[k + 1] + ext[k + 3])
    }
    const x0 = vol.ox - R
    const z0 = vol.oz - R
    const sx = vol.sx + 2 * R
    const sz = vol.sz + 2 * R
    const y0 = Math.max(vol.oy, yMin)
    const sy = Math.max(1, Math.min(vol.oy + vol.sy - 1, yMax) - y0 + 1)
    const solid = new Uint8Array(sx * sy * sz)
    const blocks = skyBlocking(Blocks)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const lx = x0 + x - vol.ox
        const lz = z0 + z - vol.oz
        if (lx >= 0 && lz >= 0 && lx < vol.sx && lz < vol.sz) continue // 体内用体块自己的数据
        const top = Math.min(y0 + sy - 1, this.groundAt(x0 + x, z0 + z))
        for (let y = y0; y <= top; y++) solid[((y - y0) * sz + z) * sx + x] = 1
      }
    for (const p of this.landmarks.placementsNear(x0, z0, x0 + sx - 1, z0 + sz - 1)) {
      const occ = blockersOf(p, blocks)
      for (let k = 0; k < occ.length; k += 3) {
        const x = p.x + occ[k] - x0
        const y = p.y + occ[k + 1] - y0
        const z = p.z + occ[k + 2] - z0
        if (x < 0 || z < 0 || y < 0 || x >= sx || z >= sz || y >= sy) continue
        solid[(y * sz + z) * sx + x] = 1
      }
    }
    return { x0, y0, z0, sx, sy, sz, solid }
  }

  generate(cx: number, cz: number): ChunkGenerationResult {
    const t0 = performance.now()
    const g = this.generateVolume(cx, cz, 1)
    const chunk = World.chunkFromVolume(g.volume, cx, cz, 1)
    return { chunk, volume: g.volume, trees: g.trees, structures: g.structures, ms: performance.now() - t0 }
  }
}
