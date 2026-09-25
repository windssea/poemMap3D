import { BlockRenderLayer, BlockShape, RENDER_LAYER_COUNT, TintClass, type VoxelBox } from '../block/BlockDefinition'
import type { BlockRegistry } from '../block/BlockRegistry'
import { B, Blocks } from '../block/Blocks'
import { stateAxis, stateFacing, stateHalf, stateVariant } from '../block/BlockState'
import { textureIndex } from '../block/BlockTextures'
import { Axis, DIRECTION_VECTORS, rotateXZ } from '../block/Direction'
import { ZONE_COUNT } from '../biome/TintZone'
import { buildTintTable } from '../biome/BiomeTints'
import { hash3i } from '../../utils/math'
import { MeshBuffer, type MeshLayerData, VertexFlag } from './MeshBuffer'
import type { VoxelVolume } from './VoxelVolume'

export interface MeshResult {
  /** 下标为 BlockRenderLayer：solid / cutout / translucent / effect */
  layers: MeshLayerData[]
  quads: number
  ms: number
}

export interface MesherOptions {
  registry?: BlockRegistry
  tintTable?: Uint32Array
  /** 外边宽度（体素里只为 mesher 提供邻居信息的那一圈） */
  pad?: number
}

/** 水面比整格低 2/16，像 Minecraft 那样与岸边留一道小台阶 */
const WATER_TOP = 14 / 16
const AO_NONE = [3, 3, 3, 3] as const

interface Tables {
  reg: BlockRegistry
  tint: Uint32Array
  top: Uint8Array
  bottom: Uint8Array
  side: Uint8Array
  tintClass: Uint8Array
  emissive: Uint8Array
  warm: Uint8Array
  isWood: Uint8Array
  isPlant: Uint8Array
}

const tableCache = new WeakMap<BlockRegistry, Tables>()
let defaultTint: Uint32Array | null = null

function tablesFor(reg: BlockRegistry, tint?: Uint32Array): Tables {
  let t = tableCache.get(reg)
  if (!t) {
    const n = 256
    t = {
      reg,
      tint: tint ?? (defaultTint ??= buildTintTable()),
      top: new Uint8Array(n),
      bottom: new Uint8Array(n),
      side: new Uint8Array(n),
      tintClass: new Uint8Array(n),
      emissive: new Uint8Array(n),
      warm: new Uint8Array(n),
      isWood: new Uint8Array(n),
      isPlant: new Uint8Array(n),
    }
    for (const d of reg.all()) {
      t.top[d.id] = textureIndex(d.faces.top)
      t.bottom[d.id] = textureIndex(d.faces.bottom)
      t.side[d.id] = textureIndex(d.faces.side)
      t.tintClass[d.id] = d.tint
      t.emissive[d.id] = d.emissive ? 1 : 0
      t.warm[d.id] = d.emissive && d.emissive < 1 ? 1 : 0
      t.isWood[d.id] = d.tags.includes('wood') ? 1 : 0
      t.isPlant[d.id] = d.tags.includes('plant') ? 1 : 0
    }
    tableCache.set(reg, t)
  }
  return t
}

/**
 * 体素网格化：六面剔除 + 贪心合并 + Minecraft 式顶点 AO，按渲染层分开输出。
 * 输入是带 1 格外边的体素，输出坐标相对于内部区域原点（x、z 为区块局部坐标，y 为世界高度）。
 */
export function meshVolume(vol: VoxelVolume, opts: MesherOptions = {}): MeshResult {
  const t0 = performance.now()
  const T = tablesFor(opts.registry ?? Blocks, opts.tintTable)
  const reg = T.reg
  const pad = opts.pad ?? 1
  const { sx, sy, sz, data } = vol
  const oy = vol.oy
  const buffers = Array.from({ length: RENDER_LAYER_COUNT }, () => new MeshBuffer())

  const at = (x: number, y: number, z: number): number => {
    if (x < 0 || z < 0 || x >= sx || z >= sz) return 0
    if (y < 0) return y + oy < 0 ? 1 : 0
    if (y >= sy) return 0
    return data[(y * sz + z) * sx + x]
  }

  /* 只扫描有内容的高度区间 */
  let yLo = sy
  let yHi = -1
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      let y = 0
      while (y < sy && reg.occludes[data[(y * sz + z) * sx + x] & 255]) y++
      if (y - 1 < yLo) yLo = Math.max(0, y - 1)
      let top = sy - 1
      while (top >= 0 && data[(top * sz + z) * sx + x] === 0) top--
      if (top > yHi) yHi = top
    }
  if (yHi < 0) return { layers: buffers.map((b) => b.toData()), quads: 0, ms: performance.now() - t0 }
  yHi = Math.min(sy - 1, yHi + 1)

  const lo = [pad, yLo, pad]
  const hi = [sx - pad, yHi + 1, sz - pad]
  const outOff = [-pad, oy, -pad]

  /** 这一面是否需要画：邻居为不透明整块则不画；同为树叶、同为冰也互相剔除 */
  const faceVisible = (id: number, nb: number): boolean => {
    if (reg.occludes[nb]) return false
    if (reg.shape[nb] === BlockShape.FULL_CUBE) {
      const ls = reg.layer[id]
      if (ls === BlockRenderLayer.Cutout && reg.layer[nb] === BlockRenderLayer.Cutout) return false
      if (ls === BlockRenderLayer.Translucent && id === nb) return false
    }
    return true
  }

  const aoAt = (x: number, y: number, z: number): number => reg.aoSolid[at(x, y, z) & 255]

  /** 以 plane 格为中心，按 u/v 两轴取四个角的 AO（顺序：--、+-、++、-+） */
  const s = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]
  const aoCorners = (px: number, py: number, pz: number, du: number[], dv: number[], out: number[]): void => {
    for (let k = 0; k < 4; k++) {
      const su = s[k][0]
      const sv = s[k][1]
      const s1 = aoAt(px + du[0] * su, py + du[1] * su, pz + du[2] * su)
      const s2 = aoAt(px + dv[0] * sv, py + dv[1] * sv, pz + dv[2] * sv)
      const c = aoAt(px + du[0] * su + dv[0] * sv, py + du[1] * su + dv[1] * sv, pz + du[2] * su + dv[2] * sv)
      out[k] = s1 && s2 ? 0 : 3 - (s1 + s2 + c)
    }
  }

  const flagsFor = (id: number): number => (T.tintClass[id] & VertexFlag.TintMask) | (T.emissive[id] ? VertexFlag.Emissive : 0) | (T.warm[id] ? VertexFlag.Warm : 0)
  const tintFor = (tile: number, biome: number): number => T.tint[tile * ZONE_COUNT + biome]

  /** 按面轴取贴图（原木等横放时，端面换到侧面） */
  const tileFor = (id: number, state: number, axis: number, sign: number): number => {
    const ax = reg.shape[id] === BlockShape.FULL_CUBE && T.isWood[id] ? stateAxis(state) : Axis.Y
    const endAxis = ax === Axis.X ? 0 : ax === Axis.Z ? 2 : 1
    if (axis === endAxis) {
      if (endAxis === 1) return sign > 0 ? T.top[id] : T.bottom[id]
      return T.top[id]
    }
    return T.side[id]
  }

  /** 贴图坐标：侧面 v 轴恒为世界 Y，保证草皮口在上 */
  const uvOf = (axis: number, x: number, y: number, z: number, out: number[], o: number): void => {
    if (axis === 0) {
      out[o] = z
      out[o + 1] = y
    } else if (axis === 1) {
      out[o] = x
      out[o + 1] = z
    } else {
      out[o] = x
      out[o + 1] = y
    }
  }

  const corners = new Array<number>(12)
  const uvs = new Array<number>(8)
  const aoTmp = [3, 3, 3, 3]
  const aoOut = [3, 3, 3, 3]
  let quads = 0

  /* ============ 1. 整块：逐轴逐向切片，贪心合并 ============ */
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3
    const v = (axis + 2) % 3
    const du = [0, 0, 0]
    const dv = [0, 0, 0]
    du[u] = 1
    dv[v] = 1
    const W = hi[u] - lo[u]
    const H = hi[v] - lo[v]
    const mask = new Uint32Array(W * H)
    const pos = [0, 0, 0]
    for (const sign of [1, -1]) {
      const nrm = [0, 0, 0]
      nrm[axis] = sign
      for (let d = lo[axis]; d < hi[axis]; d++) {
        let n = 0
        pos[axis] = d
        for (let j = lo[v]; j < hi[v]; j++) {
          pos[v] = j
          for (let i = lo[u]; i < hi[u]; i++, n++) {
            pos[u] = i
            const st = at(pos[0], pos[1], pos[2])
            const id = st & 255
            mask[n] = 0
            if (!id) continue
            const shape = reg.shape[id]
            const nb = at(pos[0] + nrm[0], pos[1] + nrm[1], pos[2] + nrm[2])
            if (shape === BlockShape.LIQUID) {
              // 静水顶面参与合并；侧面与瀑布另行处理
              if (axis !== 1 || sign !== 1 || reg.liquid[nb & 255] || stateVariant(st) === 1 || id !== B.WATER) continue
              if (reg.occludes[nb & 255]) continue
              let depth = 0
              while (depth < 7 && reg.liquid[at(pos[0], pos[1] - depth - 1, pos[2]) & 255]) depth++
              const key = (BlockRenderLayer.Translucent << 29) | (TintClass.Water << 21) | (depth << 16) | (255 << 8) | T.top[id]
              mask[n] = key + 1
              continue
            }
            if (shape !== BlockShape.FULL_CUBE) continue
            if (!faceVisible(id, nb & 255)) continue
            const tile = tileFor(id, st, axis, sign)
            let aoKey = 255
            if (reg.receivesAO[id]) {
              aoCorners(pos[0] + nrm[0], pos[1] + nrm[1], pos[2] + nrm[2], du, dv, aoTmp)
              aoKey = aoTmp[0] | (aoTmp[1] << 2) | (aoTmp[2] << 4) | (aoTmp[3] << 6)
            }
            const tinted = T.tint[tile * ZONE_COUNT] !== 0xffffff
            const biome = tinted ? vol.tint[pos[2] * sx + pos[0]] : 0
            const key = (reg.layer[id] << 29) | (flagsFor(id) << 21) | (biome << 16) | (aoKey << 8) | tile
            mask[n] = key + 1
          }
        }
        /* 贪心合并 */
        for (let j = 0; j < H; j++)
          for (let i = 0; i < W; ) {
            const k = mask[j * W + i]
            if (!k) {
              i++
              continue
            }
            let w = 1
            while (i + w < W && mask[j * W + i + w] === k) w++
            let h = 1
            grow: while (j + h < H) {
              for (let q = 0; q < w; q++) if (mask[(j + h) * W + i + q] !== k) break grow
              h++
            }
            for (let hh = 0; hh < h; hh++) mask.fill(0, (j + hh) * W + i, (j + hh) * W + i + w)

            const key = k - 1
            const tile = key & 255
            const aoKey = (key >>> 8) & 255
            const biome = (key >>> 16) & 31
            const flags = (key >>> 21) & 255
            const layer = (key >>> 29) & 3
            const water = (flags & VertexFlag.TintMask) === TintClass.Water
            const plane = sign > 0 ? d + 1 : d
            const u0 = lo[u] + i
            const v0 = lo[v] + j
            const cu = [u0, u0 + w, u0 + w, u0]
            const cv = [v0, v0, v0 + h, v0 + h]
            const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1]
            for (let c = 0; c < 4; c++) {
              const src = order[c]
              const p = [0, 0, 0]
              p[axis] = water ? plane - 1 + WATER_TOP : plane
              p[u] = cu[src]
              p[v] = cv[src]
              const x = p[0] + outOff[0]
              const y = p[1] + outOff[1]
              const z = p[2] + outOff[2]
              corners[c * 3] = x
              corners[c * 3 + 1] = y
              corners[c * 3 + 2] = z
              uvOf(axis, x, y, z, uvs, c * 2)
              aoOut[c] = (aoKey >> (src * 2)) & 3
            }
            const rgb = water ? biome * 36 * 65536 : tintFor(tile, biome)
            buffers[layer].quad(corners, nrm[0], nrm[1], nrm[2], uvs, tile, aoOut, rgb, flags)
            quads++
            i += w
          }
      }
    }
  }

  /* ============ 2. 非整块：半砖、楼梯、柱、栏、窗、草、液体侧面、自定义体素 ============ */
  const boxFaces = [
    { axis: 0, sign: 1 },
    { axis: 0, sign: -1 },
    { axis: 1, sign: 1 },
    { axis: 1, sign: -1 },
    { axis: 2, sign: 1 },
    { axis: 2, sign: -1 },
  ]

  const emitBox = (
    x: number,
    y: number,
    z: number,
    b: ArrayLike<number>,
    id: number,
    st: number,
    buf: MeshBuffer,
    skipMask = 0,
    flagsExtra = 0,
    rgbOverride = -1,
  ): void => {
    const biome = vol.tint[z * sx + x]
    for (let f = 0; f < 6; f++) {
      if (skipMask & (1 << f)) continue
      const { axis, sign } = boxFaces[f]
      const u = (axis + 1) % 3
      const v = (axis + 2) % 3
      const onBoundary = sign > 0 ? b[axis + 3] === 16 : b[axis] === 0
      const nrm = [0, 0, 0]
      nrm[axis] = sign
      const nb = at(x + nrm[0], y + nrm[1], z + nrm[2]) & 255
      if (onBoundary && reg.occludes[nb]) continue
      const du = [0, 0, 0]
      const dv = [0, 0, 0]
      du[u] = 1
      dv[v] = 1
      if (onBoundary && reg.receivesAO[id]) aoCorners(x + nrm[0], y + nrm[1], z + nrm[2], du, dv, aoTmp)
      else for (let k = 0; k < 4; k++) aoTmp[k] = AO_NONE[k]
      const cell = [x, y, z]
      const plane = cell[axis] + (sign > 0 ? b[axis + 3] : b[axis]) / 16
      const cu = [b[u] / 16, b[u + 3] / 16, b[u + 3] / 16, b[u] / 16]
      const cv = [b[v] / 16, b[v] / 16, b[v + 3] / 16, b[v + 3] / 16]
      const order = sign > 0 ? [0, 1, 2, 3] : [0, 3, 2, 1]
      const tile = tileFor(id, st, axis, sign)
      for (let c = 0; c < 4; c++) {
        const src = order[c]
        const p = [0, 0, 0]
        p[axis] = plane
        p[u] = cell[u] + cu[src]
        p[v] = cell[v] + cv[src]
        const px = p[0] + outOff[0]
        const py = p[1] + outOff[1]
        const pz = p[2] + outOff[2]
        corners[c * 3] = px
        corners[c * 3 + 1] = py
        corners[c * 3 + 2] = pz
        uvOf(axis, px, py, pz, uvs, c * 2)
        aoOut[c] = aoTmp[src]
      }
      buf.quad(corners, nrm[0], nrm[1], nrm[2], uvs, tile, aoOut, rgbOverride >= 0 ? rgbOverride : tintFor(tile, biome), flagsFor(id) | flagsExtra)
      quads++
    }
  }

  const rotBox = (b: VoxelBox, facing: number): number[] => {
    if (!facing) return b as unknown as number[]
    const [ax, az] = rotateXZ(b[0] - 8, b[2] - 8, facing)
    const [bx, bz] = rotateXZ(b[3] - 8, b[5] - 8, facing)
    return [Math.min(ax, bx) + 8, b[1], Math.min(az, bz) + 8, Math.max(ax, bx) + 8, b[4], Math.max(az, bz) + 8]
  }

  const isStairs = (s: number) => reg.shape[s & 255] === BlockShape.STAIRS
  const connects = (s: number) => {
    const id = s & 255
    const sh = reg.shape[id]
    return reg.occludes[id] === 1 || sh === BlockShape.FENCE || sh === BlockShape.PANE || sh === BlockShape.POST
  }

  for (let y = lo[1]; y < hi[1]; y++)
    for (let z = lo[2]; z < hi[2]; z++)
      for (let x = lo[0]; x < hi[0]; x++) {
        const st = at(x, y, z)
        const id = st & 255
        if (!id) continue
        const shape = reg.shape[id]
        if (shape === BlockShape.FULL_CUBE || shape === BlockShape.AIR) continue
        const buf = buffers[reg.layer[id]]
        switch (shape) {
          case BlockShape.SLAB:
            emitBox(x, y, z, stateHalf(st) ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16], id, st, buf)
            break
          case BlockShape.STAIRS: {
            const top = stateHalf(st)
            const f = stateFacing(st)
            const [fx, fz] = DIRECTION_VECTORS[f]
            emitBox(x, y, z, top ? [0, 8, 0, 16, 16, 16] : [0, 0, 0, 16, 8, 16], id, st, buf)
            let mode = 0 // 0 直 1 外角 2 内角
            let ox = 0
            let oz = 0
            const back = at(x + fx, y, z + fz)
            if (isStairs(back) && stateHalf(back) === top && stateFacing(back) % 2 !== f % 2) {
              mode = 1
              ;[ox, oz] = DIRECTION_VECTORS[stateFacing(back)]
            } else {
              const front = at(x - fx, y, z - fz)
              if (isStairs(front) && stateHalf(front) === top && stateFacing(front) % 2 !== f % 2) {
                mode = 2
                ;[ox, oz] = DIRECTION_VECTORS[stateFacing(front)]
              }
            }
            const y0 = top ? 0 : 8
            const y1 = top ? 8 : 16
            const skip = top ? 1 << 2 : 1 << 3 // 贴着底板的那一面不画
            if (mode === 0) {
              const b = [fx > 0 ? 8 : 0, y0, fz > 0 ? 8 : 0, fx < 0 ? 8 : 16, y1, fz < 0 ? 8 : 16]
              emitBox(x, y, z, b, id, st, buf, skip)
            } else {
              for (let qz = 0; qz < 2; qz++)
                for (let qx = 0; qx < 2; qx++) {
                  const cx = qx ? 1 : -1
                  const cz = qz ? 1 : -1
                  const onF = cx * fx + cz * fz > 0
                  const onO = cx * ox + cz * oz > 0
                  if (mode === 1 ? onF && onO : onF || onO) emitBox(x, y, z, [qx * 8, y0, qz * 8, qx * 8 + 8, y1, qz * 8 + 8], id, st, buf, skip)
                }
            }
            break
          }
          case BlockShape.POST: {
            const w = T.isPlant[id] ? 2 : 3
            const a = stateAxis(st)
            const b =
              a === Axis.X ? [0, 8 - w, 8 - w, 16, 8 + w, 8 + w] : a === Axis.Z ? [8 - w, 8 - w, 0, 8 + w, 8 + w, 16] : [8 - w, 0, 8 - w, 8 + w, 16, 8 + w]
            emitBox(x, y, z, b, id, st, buf)
            break
          }
          case BlockShape.FENCE: {
            const ph = T.isWood[id] ? 16 : 12
            emitBox(x, y, z, [6, 0, 6, 10, ph, 10], id, st, buf)
            const r0 = ph === 16 ? [6, 9] : [3, 5]
            const r1 = ph === 16 ? [12, 15] : [9, 11]
            for (let dir = 0; dir < 4; dir++) {
              const [dx, dz] = DIRECTION_VECTORS[dir]
              if (!connects(at(x + dx, y, z + dz))) continue
              for (const [ya, yb] of [r0, r1]) {
                const b = rotBox([7, ya, 0, 9, yb, 6], dir)
                emitBox(x, y, z, b, id, st, buf)
              }
            }
            break
          }
          case BlockShape.PANE: {
            let any = false
            for (let dir = 0; dir < 4; dir++) {
              const [dx, dz] = DIRECTION_VECTORS[dir]
              if (!connects(at(x + dx, y, z + dz))) continue
              any = true
              emitBox(x, y, z, rotBox([7, 0, 0, 9, 16, 7], dir), id, st, buf)
            }
            if (any) emitBox(x, y, z, [7, 0, 7, 9, 16, 9], id, st, buf)
            else emitBox(x, y, z, stateFacing(st) % 2 === 0 ? [0, 0, 7, 16, 16, 9] : [7, 0, 0, 9, 16, 16], id, st, buf)
            break
          }
          case BlockShape.CROSS_PLANT: {
            const h = hash3i(x + vol.ox, y, z + vol.oz, 77)
            const jx = ((h & 7) - 3.5) / 16
            const jz = (((h >> 3) & 7) - 3.5) / 16
            const tall = 0.75 + ((h >> 6) & 3) * 0.08
            const px = x + outOff[0] + 0.5 + jx
            const pz = z + outOff[2] + 0.5 + jz
            const py = y + outOff[1]
            const r = 0.42
            const tile = T.side[id]
            const rgb = tintFor(tile, vol.tint[z * sx + x])
            const ao = [2, 2, 3, 3]
            for (const [ax, az, bx, bz] of [
              [-r, -r, r, r],
              [-r, r, r, -r],
            ]) {
              corners[0] = px + ax
              corners[1] = py
              corners[2] = pz + az
              corners[3] = px + bx
              corners[4] = py
              corners[5] = pz + bz
              corners[6] = px + bx
              corners[7] = py + tall
              corners[8] = pz + bz
              corners[9] = px + ax
              corners[10] = py + tall
              corners[11] = pz + az
              uvs[0] = 0
              uvs[1] = 0
              uvs[2] = 1
              uvs[3] = 0
              uvs[4] = 1
              uvs[5] = tall
              uvs[6] = 0
              uvs[7] = tall
              buf.quad(corners, 0, 1, 0, uvs, tile, ao, rgb, flagsFor(id))
              quads++
            }
            break
          }
          case BlockShape.LIQUID: {
            const falling = stateVariant(st) === 1 || id === B.WATERFALL
            const above = at(x, y + 1, z)
            const full = falling || reg.liquid[above & 255] === 1
            const topH = full ? 16 : 14
            let depth = 0
            while (depth < 7 && reg.liquid[at(x, y - depth - 1, z) & 255]) depth++
            const rgb = depth * 36 * 65536 + (falling ? 255 * 256 : 0)
            const extra = falling ? VertexFlag.Falling : 0
            let skip = 1 << 2 // 顶面：静水走贪心合并
            if (falling && !reg.liquid[above & 255] && !reg.occludes[above & 255]) skip = 0
            for (let f = 0; f < 6; f++) {
              if (f === 2) continue
              const { axis, sign } = boxFaces[f]
              const nrm = [0, 0, 0]
              nrm[axis] = sign
              const nb = at(x + nrm[0], y + nrm[1], z + nrm[2]) & 255
              if (reg.liquid[nb] || reg.occludes[nb]) skip |= 1 << f
            }
            if (skip !== 0b111111) emitBox(x, y, z, [0, 0, 0, 16, topH, 16], id, st, buf, skip, extra, rgb)
            break
          }
          case BlockShape.CUSTOM_VOXEL: {
            const def = reg.get(id)
            const f = stateFacing(st)
            for (const b of def.boxes!) emitBox(x, y, z, rotBox(b, f), id, st, buf)
            if (def.glow) {
              const g = def.glow * 16
              const c = 8
              const b = [c - g / 2, 8 - g / 2, c - g / 2, c + g / 2, 8 + g / 2, c + g / 2]
              emitBox(x, y, z, b, id, st, buffers[BlockRenderLayer.Effect], 0, VertexFlag.Emissive, 0xffc070)
            }
            break
          }
        }
      }

  return { layers: buffers.map((b) => b.toData()), quads, ms: performance.now() - t0 }
}
