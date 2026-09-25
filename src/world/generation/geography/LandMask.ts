/**
 * 中国陆地掩膜：0.04° 栅格，行程编码（LEB128 变长整数，按行交替 0/1 段长）。
 * 二进制头：'LMSK' + f32 分辨率 + f32 西界经度 + f32 北界纬度 + u32 列数 + u32 行数。
 */
export class LandMask {
  readonly res: number
  readonly lng0: number
  readonly lat1: number
  readonly cols: number
  readonly rows: number
  private readonly bits: Uint8Array

  constructor(res: number, lng0: number, lat1: number, cols: number, rows: number, bits: Uint8Array) {
    this.res = res
    this.lng0 = lng0
    this.lat1 = lat1
    this.cols = cols
    this.rows = rows
    this.bits = bits
  }

  static decode(buf: ArrayBuffer): LandMask {
    const dv = new DataView(buf)
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))
    if (magic !== 'LMSK') throw new Error('陆地掩膜格式错误')
    const res = dv.getFloat32(4, true)
    const lng0 = dv.getFloat32(8, true)
    const lat1 = dv.getFloat32(12, true)
    const cols = dv.getUint32(16, true)
    const rows = dv.getUint32(20, true)
    const b = new Uint8Array(buf, 24)
    const bits = new Uint8Array(cols * rows)
    let p = 0
    let o = 0
    for (let r = 0; r < rows; r++) {
      let v = 0
      let c = 0
      while (c < cols) {
        let n = 0
        let sh = 0
        let x: number
        do {
          x = b[p++]
          n |= (x & 127) << sh
          sh += 7
        } while (x & 128)
        if (v) bits.fill(1, o + c, o + c + n)
        c += n
        v ^= 1
      }
      o += cols
    }
    return new LandMask(res, lng0, lat1, cols, rows, bits)
  }

  /** 是否为中国陆地；掩膜范围外返回 -1（未知） */
  sample(lng: number, lat: number): number {
    const r = Math.floor((this.lat1 - lat) / this.res)
    const c = Math.floor((lng - this.lng0) / this.res)
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return -1
    return this.bits[r * this.cols + c]
  }
}
