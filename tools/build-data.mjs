/* 从旧项目 poemMap 导出运行期数据：
 *   data/poems.js  诗词 + 作者 + 标签（window.POEM_DATA）
 *   data/land.js   中国陆地轮廓（精简多边形，用于在浏览器里栅格化海岸线，window.LAND_RINGS）
 * 用法：node tools/build-data.mjs [旧项目路径]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(process.argv[2] || "../poemMap/src/data");
const OUT = path.resolve("data");
fs.mkdirSync(OUT, { recursive: true });

const imp = (f) => import(pathToFileURL(path.join(SRC, f)).href);
const { PRE_POEMS } = await imp("poems.pre.js");
const { TANG_POEMS } = await imp("poems.tang.js");
const { SONG_POEMS } = await imp("poems.song.js");
const AUTHORS = (await imp("authors.js")).default;
const TAGS = (await imp("tags.js")).default;
const GEO = (await imp("china.geo.js")).default;

const poems = PRE_POEMS.concat(TANG_POEMS, SONG_POEMS).map((p) => {
  const o = {
    id: p.id, t: p.title, d: p.dynasty, a: p.author, f: p.form,
    pn: p.place.name, rg: p.place.region, lat: p.place.lat, lng: p.place.lng,
    o: p.place.origin || "", l: p.lines, tr: p.tr || "", ap: p.appr || "",
  };
  if (p.prologue) o.pr = p.prologue;
  if (p.story) o.st = p.story;
  if (p.notes && p.notes.length) o.n = p.notes;
  if (TAGS[p.id]) o.g = TAGS[p.id];
  return o;
});
const authors = {};
poems.forEach((p) => { if (AUTHORS[p.a]) authors[p.a] = AUTHORS[p.a]; });

fs.writeFileSync(path.join(OUT, "poems.js"),
  "/* 诗词数据（由 tools/build-data.mjs 生成，勿手改） */\nwindow.POEM_DATA=" +
  JSON.stringify({ poems, authors }) + ";\n");

/* —— 陆地轮廓：取各省外环，道格拉斯-普克抽稀到 ~0.04° —— */
function dp(pts, eps) {
  if (pts.length < 3) return pts;
  let idx = 0, dmax = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-9;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [pts[0], pts[pts.length - 1]];
  return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
}
const rings = [];
GEO.features.forEach((f) => {
  const g = f.geometry;
  if (!g) return;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  polys.forEach((poly) => {
    const ring = poly[0].slice(0, -1); let far = 0, fd = 0;
    ring.forEach((p, i) => { const d = Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]); if (d > fd) { fd = d; far = i; } });
    const r = dp(ring.slice(0, far + 1), 0.04).slice(0, -1).concat(dp(ring.slice(far).concat([ring[0]]), 0.04));
    if (r.length >= 4) rings.push(r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]));
  });
});
if (process.env.KEEP_RINGS) fs.writeFileSync(path.join(OUT, "land.js"),
  "/* 中国陆地轮廓（精简自 DataV 行政区划，由 tools/build-data.mjs 生成） */\nwindow.LAND_RINGS=" +
  JSON.stringify(rings) + ";\n");

console.log("poems", poems.length, "authors", Object.keys(authors).length, "rings", rings.length,
  "sizes", fs.statSync(path.join(OUT, "poems.js")).size, fs.statSync(path.join(OUT, "land.js")).size);

/* —— 陆地掩膜：0.04° 栅格，逐行扫描线填充 → 行程编码 → gzip → base64（取代 88KB 的多边形） —— */
{
  const zlib = await import("node:zlib");
  const R = 0.04, L0 = 72, L1 = 135.5, B0 = 16.5, B1 = 54;
  const cols = Math.round((L1 - L0) / R), rows = Math.round((B1 - B0) / R);
  const mask = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const lat = B1 - (r + 0.5) * R;              // 第 0 行在北
    for (const ring of rings) {
      const xs = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i], [xj, yj] = ring[j];
        if ((yi > lat) !== (yj > lat)) xs.push(xi + (lat - yi) / (yj - yi) * (xj - xi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - L0) / R - 0.5)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - L0) / R - 0.5));
        for (let c = c0; c <= c1; c++) mask[r * cols + c] = 1;
      }
    }
  }
  const bytes = [];
  const varint = (n) => { while (n >= 128) { bytes.push((n & 127) | 128); n >>>= 7; } bytes.push(n); };
  for (let r = 0; r < rows; r++) { let cur = 0, run = 0; for (let c = 0; c < cols; c++) { const v = mask[r * cols + c]; if (v === cur) run++; else { varint(run); cur = v; run = 1; } } varint(run); }
  const gz = zlib.gzipSync(Buffer.from(bytes), { level: 9 }).toString("base64");
  fs.writeFileSync(path.join(OUT, "landmask.js"),
    `/* 中国陆地掩膜（${R}° 栅格，经 ${L0}–${L1}、纬 ${B0}–${B1}；行程编码 + gzip，由 tools/build-data.mjs 生成） */\nwindow.LAND_MASK={r:${R},l0:${L0},b1:${B1},cols:${cols},rows:${rows},gz:"${gz}"};\n`);
  console.log("landmask", cols, "x", rows, "runs bytes", bytes.length, "file", fs.statSync(path.join(OUT, "landmask.js")).size);
}
