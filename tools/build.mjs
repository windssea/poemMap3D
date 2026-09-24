/* 构建：
 *   1. vendor/three-bundle.js —— 只打包页面实际用到的 three 类（按 index.html 中的 THREE.xxx 自动收集）
 *   2. dist/index.html —— 单文件发行版：CSS/JS 压缩内联，three 与诗词数据 gzip 后以 base64 内嵌，
 *      浏览器端用 DecompressionStream 解压。双击即可离线打开。
 * 用法：npm run build
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as esbuild from "esbuild";

const ROOT = path.resolve(".");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const kb = (n) => (n / 1024).toFixed(1) + " KB";

/* —— 1. three：按需打包 —— */
const names = [...new Set([...src.matchAll(/THREE\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))].sort();
const entry = `
import { ${names.join(", ")} } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
window.THREE = { ${names.join(", ")} };
window.THREE_ADDONS = { OrbitControls, Reflector, EffectComposer, RenderPass, UnrealBloomPass, OutputPass, ShaderPass, Line2, LineMaterial, LineGeometry };
`;
const three = (await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: "js" }, bundle: true, minify: true, format: "iife",
  write: false, legalComments: "none", target: "es2020",
})).outputFiles[0].text;
const threeFile = "/* three.js r160（MIT，© 2010-2023 three.js authors）按需打包 */\n" + three;
fs.writeFileSync(path.join(ROOT, "vendor/three-bundle.js"), threeFile);

/* —— 2. 拆出页面各部分 —— */
const style = src.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = src.match(/<body>([\s\S]*?)<script>/)[1];
const early = src.match(/<script>\s*(\/\* 早期错误兜底[\s\S]*?)<\/script>/)[1];
const app = src.match(/<script>\s*("use strict";[\s\S]*?)<\/script>\s*<\/body>/)[1];
const head = src.match(/<head>([\s\S]*?)<style>/)[1].replace(/<link rel="stylesheet" href="fonts\/brush\.css">/, "").replace(/\n\s*/g, "");
/* 书法字体（data URI）与巡游路线一并内联 */
const css = (await esbuild.transform(style, { loader: "css", minify: true })).code;
const appMin = (await esbuild.transform(`function APP(){${app}}`, { loader: "js", minify: true, target: "es2020", legalComments: "none" })).code;
const earlyMin = (await esbuild.transform(early, { loader: "js", minify: true })).code;

/* —— 数据拆分：启动必需（题目、作者、诗句、地点）与按需细节（译文、赏析、注释、诗话、小传） —— */
globalThis.window = {};
new Function(fs.readFileSync(path.join(ROOT, "data/poems.js"), "utf8"))();
const FULL = window.POEM_DATA, CORE_KEYS = ["id", "t", "d", "a", "f", "pn", "rg", "lat", "lng", "l", "pr", "g"];
const core = FULL.poems.map((q) => Object.fromEntries(CORE_KEYS.filter((k2) => q[k2] !== undefined).map((k2) => [k2, q[k2]])));
const det = {}; for (const q of FULL.poems) { const o = {}; for (const k2 of Object.keys(q)) if (!CORE_KEYS.includes(k2)) o[k2] = q[k2]; det[q.id] = o; }
const strip = (f2) => fs.readFileSync(path.join(ROOT, f2), "utf8").replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();
const OUT = path.join(ROOT, "dist");
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, "js"), { recursive: true }); fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
fs.writeFileSync(path.join(OUT, "js/core.js"), "window.POEM_DATA=" + JSON.stringify({ poems: core, authors: {}, detail: "js/detail.js" }) + ";\n" + strip("data/landmask.js") + "\n" + strip("data/tour.js") + "\n");
fs.writeFileSync(path.join(OUT, "js/detail.js"), "window.POEM_DETAIL=" + JSON.stringify({ p: det, authors: FULL.authors }) + ";\n");
fs.writeFileSync(path.join(OUT, "js/three.js"), threeFile);
for (const f2 of ["brush-tour.js", "brush-poems.js"]) fs.copyFileSync(path.join(ROOT, "fonts", f2), path.join(OUT, "fonts", f2));
const html = `<!doctype html>
<html lang="zh-CN">
<head>${head}<style>${css}</style></head>
<body>${body.replace(/\n\s+/g, "\n")}<script>${earlyMin}</script>
<script src="js/core.js"></script>
<script src="js/three.js"></script>
<script>${appMin}APP();</script>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, "index.html"), html);
const sz = (f2) => fs.statSync(path.join(OUT, f2)).size, gzs = (f2) => zlib.gzipSync(fs.readFileSync(path.join(OUT, f2)), { level: 9 }).length;
console.log("发行版 dist/（首屏加载 → 按需加载）：");
for (const f2 of ["index.html", "js/core.js", "js/three.js", "js/detail.js", "fonts/brush-tour.js", "fonts/brush-poems.js"]) console.log(`  ${f2.padEnd(22)} ${kb(sz(f2)).padStart(10)}（gzip ${kb(gzs(f2))}）`);
console.log("  首屏合计", kb(sz("index.html") + sz("js/core.js") + sz("js/three.js")));
