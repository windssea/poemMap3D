/* 零依赖静态服务：node tools/serve.mjs [端口] */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");
const PORT = Number(process.argv[2] || 5188);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/`));
