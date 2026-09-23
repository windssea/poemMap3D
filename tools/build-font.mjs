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

/* —— 诗卷用全量子集：所有诗的题目、作者、正文与地名（约 2400 字，~1MB）——
   单独成一个脚本，页面在空闲时或首次展卷时再加载；没有它诗卷就退回楷体 */
{
  const all = new Set(), addA = (t) => [...String(t)].forEach((c) => all.add(c));
  addA("山河诗卷〔〕《》·，。？！、；：「」—…");
  for (const p of poems) { addA(p.t); addA(p.a); addA(p.d); p.l.forEach(addA); addA(p.pn); }
  const full = await subsetFont(fs.readFileSync("fonts/MaShanZheng-Regular.ttf"), [...all].join(""), { targetFormat: "woff2" });
  fs.writeFileSync("fonts/brush-poems.js", `/* 马善政毛笔楷书 · 诗卷用子集（SIL OFL 1.1），由 tools/build-font.mjs 生成 */\n(function(){try{var s=atob("${full.toString("base64")}"),u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);var f=new FontFace("ShanheBrushFull",u.buffer,{display:"swap"});document.fonts.add(f);f.load().then(function(){document.documentElement.classList.add("brush-full")})}catch(e){}})();\n`);
  console.log(`诗卷字体子集：${all.size} 字 → ${(full.length / 1024).toFixed(0)} KB（按需加载）`);
}
