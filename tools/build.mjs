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
const head = src.match(/<head>([\s\S]*?)<style>/)[1].replace(/\n\s*/g, "");

const css = (await esbuild.transform(style, { loader: "css", minify: true })).code;
const appMin = (await esbuild.transform(`function APP(){${app}}`, { loader: "js", minify: true, target: "es2020", legalComments: "none" })).code;
const earlyMin = (await esbuild.transform(early, { loader: "js", minify: true })).code;

const poems = fs.readFileSync(path.join(ROOT, "data/poems.js"), "utf8").match(/window\.POEM_DATA=(.*);\s*$/s)[1];
const mask = fs.readFileSync(path.join(ROOT, "data/landmask.js"), "utf8").replace(/^\/\*[\s\S]*?\*\/\s*/, "").trim();
const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 9 }).toString("base64");
const T = gz(three), D = gz(poems);

const boot = `(async()=>{try{
const gun=async b=>{if(!window.DecompressionStream)throw new Error("浏览器过旧，不支持解压（需 Chrome 80+ / Safari 16.4+ / Firefox 113+）");
const u=Uint8Array.from(atob(b),c=>c.charCodeAt(0));return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream("gzip"))).text()};
const[t,d]=await Promise.all([gun(T3),gun(PD)]);(0,eval)(t);window.POEM_DATA=JSON.parse(d);APP()}catch(e){window.__fail("载入失败："+(e.message||e))}})();`;

const html = `<!doctype html>
<html lang="zh-CN">
<head>${head}<style>${css}</style></head>
<body>${body.replace(/\n\s+/g, "\n")}<script>${earlyMin}</script>
<script>${mask}</script>
<script>const T3="${T}";
const PD="${D}";
${boot}
${appMin}</script>
</body>
</html>
`;
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist/index.html"), html);

const devTotal = ["index.html", "vendor/three-bundle.js", "data/poems.js", "data/landmask.js"].reduce((s, f) => s + fs.statSync(path.join(ROOT, f)).size, 0);
console.log(`three 按需打包：${names.length} 个类 → ${kb(three.length)}（gzip ${kb(Buffer.from(T, "base64").length)}）`);
console.log(`诗词数据：${kb(Buffer.byteLength(poems))} → gzip ${kb(Buffer.from(D, "base64").length)}`);
console.log(`源码版合计：${kb(devTotal)}　单文件发行版 dist/index.html：${kb(Buffer.byteLength(html))}`);
