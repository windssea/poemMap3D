/**
 * 一层网格的顶点数据（可转移给主线程，直接做成 BufferGeometry）。
 * 位置与贴图坐标以 1/16 方块为单位存成 Int16（网格整体缩放 1/16 还原），省显存。
 */
export const POSITION_SCALE = 16

export interface MeshLayerData {
  positions: Int16Array
  normals: Int8Array
  uvs: Int16Array
  tiles: Uint8Array
  ao: Uint8Array
  colors: Uint8Array
  flags: Uint8Array
  indices: Uint32Array
  vertexCount: number
  indexCount: number
}

/** 顶点标志位 */
export const VertexFlag = {
  TintMask: 7,
  Emissive: 8,
  Falling: 16,
} as const

/** 可增长的顶点缓冲；四边形为基本单位 */
export class MeshBuffer {
  private pos = new Int16Array(4096 * 3)
  private nrm = new Int8Array(4096 * 3)
  private uv = new Int16Array(4096 * 2)
  private tile = new Uint8Array(4096)
  private ao = new Uint8Array(4096)
  private col = new Uint8Array(4096 * 3)
  private flg = new Uint8Array(4096)
  private idx = new Uint32Array(4096 * 1.5)
  vcount = 0
  icount = 0

  private grow(nv: number): void {
    if (this.vcount + nv <= this.tile.length) return
    const cap = Math.max(this.tile.length * 2, this.vcount + nv)
    const g = <T extends Int16Array | Int8Array | Uint8Array | Uint32Array>(a: T, per: number): T => {
      const b = new (a.constructor as new (n: number) => T)(cap * per)
      b.set(a)
      return b
    }
    this.pos = g(this.pos, 3)
    this.nrm = g(this.nrm, 3)
    this.uv = g(this.uv, 2)
    this.tile = g(this.tile, 1)
    this.ao = g(this.ao, 1)
    this.col = g(this.col, 3)
    this.flg = g(this.flg, 1)
    this.idx = g(this.idx, 1.5)
  }

  /**
   * 追加一个四边形。c 为 4 个角（逆时针，从法线方向看），uvs 为 4 组贴图坐标（方块单位），
   * ao 为 4 个角的遮蔽等级 0–3。flip 为真时换一条对角线切分，避免 AO 各向异性。
   */
  quad(
    c: ArrayLike<number>,
    nx: number,
    ny: number,
    nz: number,
    uvs: ArrayLike<number>,
    tile: number,
    ao: ArrayLike<number>,
    rgb: number,
    flags: number,
  ): void {
    this.grow(4)
    const v = this.vcount
    for (let i = 0; i < 4; i++) {
      const o = (v + i) * 3
      this.pos[o] = Math.round(c[i * 3] * POSITION_SCALE)
      this.pos[o + 1] = Math.round(c[i * 3 + 1] * POSITION_SCALE)
      this.pos[o + 2] = Math.round(c[i * 3 + 2] * POSITION_SCALE)
      this.nrm[o] = nx * 127
      this.nrm[o + 1] = ny * 127
      this.nrm[o + 2] = nz * 127
      this.col[o] = (rgb >> 16) & 255
      this.col[o + 1] = (rgb >> 8) & 255
      this.col[o + 2] = rgb & 255
      this.uv[(v + i) * 2] = Math.round(uvs[i * 2] * POSITION_SCALE)
      this.uv[(v + i) * 2 + 1] = Math.round(uvs[i * 2 + 1] * POSITION_SCALE)
      this.tile[v + i] = tile
      this.ao[v + i] = ao[i]
      this.flg[v + i] = flags
    }
    const k = this.icount
    if (ao[0] + ao[2] < ao[1] + ao[3]) {
      this.idx[k] = v + 1
      this.idx[k + 1] = v + 2
      this.idx[k + 2] = v + 3
      this.idx[k + 3] = v + 1
      this.idx[k + 4] = v + 3
      this.idx[k + 5] = v
    } else {
      this.idx[k] = v
      this.idx[k + 1] = v + 1
      this.idx[k + 2] = v + 2
      this.idx[k + 3] = v
      this.idx[k + 4] = v + 2
      this.idx[k + 5] = v + 3
    }
    this.vcount += 4
    this.icount += 6
  }

  toData(): MeshLayerData {
    const n = this.vcount
    return {
      positions: this.pos.slice(0, n * 3),
      normals: this.nrm.slice(0, n * 3),
      uvs: this.uv.slice(0, n * 2),
      tiles: this.tile.slice(0, n),
      ao: this.ao.slice(0, n),
      colors: this.col.slice(0, n * 3),
      flags: this.flg.slice(0, n),
      indices: this.idx.slice(0, this.icount),
      vertexCount: n,
      indexCount: this.icount,
    }
  }
}

export function meshTransferables(d: MeshLayerData): ArrayBuffer[] {
  return [d.positions, d.normals, d.uvs, d.tiles, d.ao, d.colors, d.flags, d.indices].map((a) => a.buffer as ArrayBuffer)
}
