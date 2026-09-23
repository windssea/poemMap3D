/* 无头 Chrome 验收截图（CDP，零依赖）
 * node tools/shot.mjs <url> <out.png> [--w 1440 --h 900 --dpr 1 --mobile --wait 9000 --eval "js" --reduced]
 * --eval 可多次：每段在截图前依次执行（可返回 Promise），结果打印到控制台
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const url = args[0], out = args[1];
const opt = (k, d) => { const i = args.indexOf("--" + k); return i < 0 ? d : args[i + 1]; };
const flag = (k) => args.includes("--" + k);
const evals = []; args.forEach((a, i) => { if (a === "--eval") evals.push(args[i + 1]); });
const W = +opt("w", 1440), H = +opt("h", 900), DPR = +opt("dpr", 1), WAIT = +opt("wait", 9000);
const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9400 + Math.floor(Math.random() * 400);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shot-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=d3d11", "--enable-unsafe-swiftshader",
  `--window-size=${W},${H}`, "about:blank"], { stdio: "ignore" });

async function main() {
  let ws;
  for (let i = 0; i < 60; i++) {
    try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === "page"); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch (e) {}
    await sleep(200);
  }
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map(); const logs = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { r, j } = pend.get(m.id); pend.delete(m.id); m.error ? j(new Error(JSON.stringify(m.error))) : r(m.result); }
    else if (m.method === "Runtime.consoleAPICalled") logs.push(m.params.type + ": " + m.params.args.map((a) => a.value ?? a.description).join(" "));
    else if (m.method === "Runtime.exceptionThrown") logs.push("EXCEPTION: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    else if (m.method === "Log.entryAdded") logs.push("LOG " + m.params.entry.level + ": " + m.params.entry.text + " " + (m.params.entry.url || ""));
  };
  const send = (method, params = {}) => new Promise((r, j) => { const i = ++id; pend.set(i, { r, j }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => pend.has(i) && (pend.delete(i), j(new Error("timeout " + method))), 90000); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: DPR, mobile: flag("mobile") });
  if (flag("mobile")) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  if (flag("reduced")) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  if (flag("offline")) { await send("Network.enable"); await send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }); }
  await send("Page.navigate", { url });
  const t0 = Date.now();
  while (Date.now() - t0 < WAIT * 4) {
    const r = await send("Runtime.evaluate", { expression: "!!window.__ready || document.querySelector('#loader.fail') != null", returnByValue: true });
    if (r.result.value) break; await sleep(300);
  }
  console.log("ready after", Date.now() - t0, "ms");
  await sleep(WAIT);
  for (const e of evals) {
    const r = await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true });
    console.log("EVAL>", JSON.stringify(r.result.value ?? r.exceptionDetails?.exception?.description ?? r.result.description));
    await sleep(+opt("step", 2500));
  }
  if (out) { const s = await send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(out, Buffer.from(s.data, "base64")); console.log("saved", out); }
  logs.forEach((l) => console.log(l));
}
main().catch((e) => console.error("ERR", e.message)).finally(() => { try { chrome.kill(); } catch (e) {} setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(0); }, 500); });
