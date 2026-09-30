/**
 * 截图亮度分析：node tools/lum.mjs <png> [ring|grid]
 *   ring  以画面中心为圆心，每 60 像素一环，输出平均 RGB 与亮度（找同心亮度环带）
 *   grid  8×5 网格平均亮度
 * 只认 8 位 RGB/RGBA、非隔行的 PNG（Chrome DevTools 截图即是）。
 */
import fs from 'node:fs'
import zlib from 'node:zlib'

export function decode(file) {
  const b = fs.readFileSync(file)
  let p = 8
  let w = 0
  let h = 0
  let ct = 2
  const idat = []
  while (p < b.length) {
    const len = b.readUInt32BE(p)
    const type = b.toString('ascii', p + 4, p + 8)
    const data = b.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      ct = data[9]
    } else if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const bpp = ct === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const px = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const src = y * (stride + 1) + 1
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const up = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? px[(y - 1) * stride + x - bpp] : 0
      let v = raw[src + x]
      if (f === 1) v += a
      else if (f === 2) v += up
      else if (f === 3) v += (a + up) >> 1
      else if (f === 4) {
        const pa = Math.abs(up - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + up - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c
      }
      px[y * stride + x] = v & 255
    }
  }
  return { w, h, bpp, px }
}

export const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function rings(img, step = 60) {
  const { w, h, bpp, px } = img
  const cx = w / 2
  const cy = h / 2
  const n = Math.ceil(Math.hypot(cx, cy) / step)
  const acc = Array.from({ length: n }, () => [0, 0, 0, 0])
  for (let y = 0; y < h; y += 2)
    for (let x = 0; x < w; x += 2) {
      const i = Math.min(n - 1, Math.floor(Math.hypot(x - cx, y - cy) / step))
      const o = (y * w + x) * bpp
      const a = acc[i]
      a[0] += px[o]
      a[1] += px[o + 1]
      a[2] += px[o + 2]
      a[3]++
    }
  return acc.map((a, i) => ({ r0: i * step, rgb: a.slice(0, 3).map((v) => Math.round(v / a[3])), y: Math.round(luma(a[0] / a[3], a[1] / a[3], a[2] / a[3])) }))
}

/** 整幅画面（隔 3 像素取样）的平均亮度 */
export function meanLuma(img) {
  const { w, h, bpp, px } = img
  let s = 0
  let c = 0
  for (let y = 0; y < h; y += 3)
    for (let x = 0; x < w; x += 3) {
      const o = (y * w + x) * bpp
      s += luma(px[o], px[o + 1], px[o + 2])
      c++
    }
  return s / c
}

/** (x, y) 周围 (2r+1)² 像素的平均 RGB；x、y 小于 1 时按画面比例 */
export function probe(img, x, y, r = 4) {
  const { w, h, bpp, px } = img
  const cx = Math.round(x <= 1 ? x * (w - 1) : x)
  const cy = Math.round(y <= 1 ? y * (h - 1) : y)
  const a = [0, 0, 0]
  let c = 0
  for (let j = Math.max(0, cy - r); j <= Math.min(h - 1, cy + r); j++)
    for (let i = Math.max(0, cx - r); i <= Math.min(w - 1, cx + r); i++) {
      const o = (j * w + i) * bpp
      a[0] += px[o]
      a[1] += px[o + 1]
      a[2] += px[o + 2]
      c++
    }
  return a.map((v) => Math.round(v / c))
}

if (process.argv[1]?.endsWith('lum.mjs') && process.argv[2] === 'zoom') {
  /* node tools/lum.mjs zoom <目录>：zoom-*.png 按距离从远到近，逐级平均亮度与相邻两级变化（超过 6% 标 !） */
  const dir = process.argv[3]
  const files = fs.readdirSync(dir).filter((f) => /^zoom-\d+\.png$/.test(f)).sort().reverse()
  let prev = 0
  for (const f of files) {
    const y = meanLuma(decode(`${dir}/${f}`))
    const d = prev ? ((y - prev) / prev) * 100 : 0
    console.log(f.padEnd(16), y.toFixed(1).padStart(6), prev ? `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`.padStart(8) : '', Math.abs(d) > 6 ? '!' : '')
    prev = y
  }
} else if (process.argv[1]?.endsWith('lum.mjs') && process.argv[2] === 'probe') {
  /* node tools/lum.mjs probe <png> x,y [x,y ...]：各点周围 9×9 的平均 RGB（x、y ≤ 1 为画面比例） */
  const img = decode(process.argv[3])
  for (const p of process.argv.slice(4)) {
    const [x, y] = p.split(',').map(Number)
    const c = probe(img, x, y)
    console.log(p.padEnd(12), c.join(',').padEnd(12), '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''), Math.round(luma(...c)))
  }
} else if (process.argv[1]?.endsWith('lum.mjs')) {
  const [file, mode = 'ring'] = process.argv.slice(2)
  const img = decode(file)
  if (mode === 'ring') for (const r of rings(img)) console.log(String(r.r0).padStart(4), r.rgb.join(',').padEnd(12), r.y)
  else {
    const { w, h, bpp, px } = img
    for (let j = 0; j < 5; j++) {
      const row = []
      for (let i = 0; i < 8; i++) {
        let s = 0
        let c = 0
        for (let y = Math.floor((j * h) / 5); y < Math.floor(((j + 1) * h) / 5); y += 3)
          for (let x = Math.floor((i * w) / 8); x < Math.floor(((i + 1) * w) / 8); x += 3) {
            const o = (y * w + x) * bpp
            s += luma(px[o], px[o + 1], px[o + 2])
            c++
          }
        row.push(String(Math.round(s / c)).padStart(4))
      }
      console.log(row.join(' '))
    }
  }
}
