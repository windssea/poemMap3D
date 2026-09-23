/* 书法字体子集：马善政毛笔楷书（SIL OFL 1.1，见 fonts/OFL.txt）
 * 只收录巡游题诗、标题等用到的字 → fonts/brush.woff2
 * 用法：node tools/build-font.mjs（npm run build 会自动调用）
 */
import fs from "node:fs";
import subsetFont from "subset-font";

globalThis.window = {};
await import("../data/poems.js");
await import("../data/tour.js");
const { poems } = window.POEM_DATA, PLAN = window.TOUR_PLAN;
const set = new Set(), add = (t) => [...String(t)].forEach((c) => set.add(c));
add("山河诗卷巡游关中中原齐鲁江南荆楚巴蜀塞上长城先秦至宋首处〔〕《》·，。？！、；：「」—…");
for (const r of PLAN) {
  add(r.region);
  for (const id of r.stops.flatMap((st) => st.poems).concat(r.wall ? [r.wall] : [])) {
    const q = poems.find((p) => p.id === id);
    if (!q) { console.warn("找不到诗：", id); continue; }
    add(q.t); add(q.a); add(q.d); q.l.slice(-2).forEach(add);
  }
}
const buf = await subsetFont(fs.readFileSync("fonts/MaShanZheng-Regular.ttf"), [...set].join(""), { targetFormat: "woff2" });
fs.writeFileSync("fonts/brush.woff2", buf);
console.log(`书法字体子集：${set.size} 字 → ${(buf.length / 1024).toFixed(1)} KB`);
/* file:// 下 Chrome 会拦截字体文件的跨源加载，所以另出一份内嵌 data URI 的样式表 */
fs.writeFileSync("fonts/brush.css", `/* 马善政毛笔楷书子集（SIL OFL 1.1），由 tools/build-font.mjs 生成 */\n@font-face{font-family:"ShanheBrush";font-display:swap;src:url(data:font/woff2;base64,${buf.toString("base64")}) format("woff2")}\n`);
