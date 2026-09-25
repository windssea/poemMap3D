/* 巡游路线：江南 → 洛阳 → 长安 → 三峡 → 川蜀 → 边塞
 * 每个片区按「唐宋八大家诗作、唐诗、诗作总数」挑选地点；每站配一首唐诗、一首宋诗词（各自八大家优先），
 * 唐诗在前（首轮先展示），整体唐诗略多。
 * 生成 data/tour.js（window.TOUR_PLAN），页面与书法字体子集共用。
 * 用法：node tools/build-tour.mjs
 */
import fs from "node:fs";

globalThis.window = {};
await import("../data/poems.js");
await import("../data/fame.js");
const { poems } = window.POEM_DATA;
const BAJIA = new Set(["韩愈", "柳宗元", "欧阳修", "苏洵", "苏轼", "苏辙", "王安石", "曾巩"]);

/* 与页面相同的地标聚合规则（0.15° 纬 / 0.2° 经，按首次出现顺序） */
const nodes = [];
for (const p of poems) {
  let h = nodes.find((c) => Math.abs(c.lat0 - p.lat) < 0.15 && Math.abs(c.lng0 - p.lng) < 0.2);
  if (!h) { h = { lat0: p.lat, lng0: p.lng, poems: [] }; nodes.push(h); }
  h.poems.push(p);
}
nodes.forEach((n) => { n.lat = n.poems.reduce((s, p) => s + p.lat, 0) / n.poems.length; n.lng = n.poems.reduce((s, p) => s + p.lng, 0) / n.poems.length; });

const REGIONS = [
  { name: "江南", box: [118, 29.3, 122.5, 33], n: 3, season: "spring", mood: "day", weather: "wet" },
  { name: "洛阳", box: [111.5, 33.8, 116, 35.6], n: 2, season: "summer", mood: "dusk", weather: "clear" },
  { name: "长安", box: [106.5, 33.6, 111.2, 35.6], n: 2, season: "autumn", mood: "day", weather: "clear" },
  { name: "三峡", box: [108.3, 30.3, 111.9, 31.7], n: 2, season: "summer", mood: "dawn", weather: "clear" },
  { name: "川蜀", box: [102.5, 28.2, 108.3, 33.2], n: 2, season: "spring", mood: "night", weather: "wet" },
  { name: "边塞", box: [80, 36.5, 113.5, 44], n: 2, season: "winter", mood: "dusk", weather: "wet", wall: "chu-sai" },
];
const bj = (n) => n.poems.filter((p) => BAJIA.has(p.a)).length;
const tang = (n) => n.poems.filter((p) => p.d === "唐").length;
/* 名气优先（data/fame.js），同名气时唐宋八大家在前 */
const fame = (p) => (window.POEM_FAME[p.id] ? window.POEM_FAME[p.id][1] : 2);
const pick = (list) => [...list].sort((a, b) => fame(b) - fame(a) || BAJIA.has(b.a) - BAJIA.has(a.a));
const plan = REGIONS.map((R) => {
  const [x0, y0, x1, y1] = R.box;
  const picks = nodes.filter((n) => n.lng >= x0 && n.lng <= x1 && n.lat >= y0 && n.lat <= y1)
    .sort((a, b) => bj(b) * 3 + tang(b) * 2 + b.poems.length - (bj(a) * 3 + tang(a) * 2 + a.poems.length)).slice(0, R.n + 2);   // 多出的两处标为 extra：巡游「数量」选「多 / 无尽」时才去
  const stops = picks.map((n, pi) => {
    const T = pick(n.poems.filter((p) => p.d === "唐")), S = pick(n.poems.filter((p) => p.d === "宋")), O = pick(n.poems.filter((p) => p.d !== "唐" && p.d !== "宋"));
    /* 唐诗在前；缺哪一朝就用另一朝或前代补足 */
    let two = [T[0] || S[0] || O[0], (T[0] ? S[0] : S[1]) || T[1] || O[0]].filter(Boolean);
    /* 宋诗词在此地名气太低、而另有唐代名篇时，第二首也用唐诗 */
    if (T[0] && S[0] && fame(S[0]) <= 2 && T[1] && fame(T[1]) >= 4) two = [T[0], T[1]];
    /* 该地最有名的一首先行（第一轮巡游展示它的名句） */
    if (two.length === 2 && fame(two[1]) > fame(two[0])) two.reverse();
    const st = { poems: [...new Set(two)].map((p) => p.id), note: n.poems[0].pn };
    if (pi >= R.n) st.extra = 1;
    return st;
  });
  const out = { region: R.name, season: R.season, mood: R.mood, weather: R.weather, stops };
  if (R.wall) out.wall = R.wall;
  return out;
});

fs.writeFileSync("data/tour.js",
  "/* 巡游路线（由 tools/build-tour.mjs 生成）：片区顺序固定，站点与诗按唐宋八大家优先挑选 */\nwindow.TOUR_PLAN = " + JSON.stringify(plan, null, 1) + ";\n");
{ const all = plan.flatMap((r) => r.stops.filter((s) => !s.extra).flatMap((s) => s.poems)).map((id) => poems.find((p) => p.id === id)); const tc = all.filter((p) => p.d === "唐").length, sc = all.filter((p) => p.d === "宋").length; console.log(`唐 ${tc} 首 · 宋 ${sc} 首 · 其他 ${all.length - tc - sc} 首`); const first = plan.flatMap((r) => r.stops.filter((s) => !s.extra).map((s) => poems.find((p) => p.id === s.poems[0]).d)); console.log(`首轮展示：唐 ${first.filter((d) => d === "唐").length} · 宋 ${first.filter((d) => d === "宋").length}`); }
for (const r of plan) console.log(r.region, r.stops.map((s) => s.note + "〔" + s.poems.map((id) => { const q = poems.find((p) => p.id === id); return q.a + "《" + q.t + "》"; }).join("，") + "〕").join("  "));
