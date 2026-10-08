/**
 * 验收截图：无头 Edge/Chrome 逐场景固定机位出图。
 *
 *   node tools/shoot.mjs <scenes.json> <输出目录> [--base http://localhost:5188] [--port 9333] [--profile <目录>]
 *
 * scenes.json 是场景数组，每项：
 *   name   文件名
 *   query  地址参数（?shs=季节 shw=天气 shm=时段 q=画质 shp=地点id 等），默认 夏 · 晴 · 昼 · 衡
 *   setup  页面就绪、区块载完后执行的表达式（可 await），如调机位；也可以是表达式数组，逐项执行、每项后等区块载完
 *   wait   setup 之后再等的毫秒数（默认 1500）
 *   probe  截图前在页面里求值并打印结果（可 await）；shot: false 则只求值不截图
 *   size   [宽, 高]，默认 1440×900
 *   dpr    设备像素比，默认 1（高分屏上摩尔纹、窗格等与像素比有关的问题要用 2 复现）
 * 页面里可用 window.__shanhe = { engine, facade, store }。
 *
 * 每个场景都新开页面，注入固定的随机数种子，界面整个隐藏（含开发用的光照调试面板）。
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const args = process.argv.slice(2)
const flag = (k, d) => {
  const i = args.indexOf(k)
  return i >= 0 ? args.splice(i, 2)[1] : d
}
const base = flag('--base', 'http://localhost:5188')
const port = Number(flag('--port', '9333'))
/* 固定的浏览器配置目录：区块缓存（IndexedDB）留在里面，同一份代码第二次起不必重新生成世界 */
const fixedProfile = flag('--profile', '')
/** 每次等区块载完的上限（毫秒）；冷缓存时全国远景片生成很慢，可调小后先跑一遍预热（配合 --profile 复用缓存） */
const settleMs = Number(flag('--settle', '60000'))
const [scenesFile, outDir] = args
if (!scenesFile || !outDir) {
  console.error('用法: node tools/shoot.mjs <scenes.json> <输出目录>')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })
const scenes = JSON.parse(fs.readFileSync(scenesFile, 'utf8'))

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
]
const exe = BROWSERS.find((p) => fs.existsSync(p))
if (!exe) throw new Error('找不到 Edge / Chrome')

const profile = fixedProfile || fs.mkdtempSync(path.join(os.tmpdir(), 'shoot-'))
const proc = spawn(exe, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--use-angle=d3d11',
  '--ignore-gpu-blocklist',
  '--enable-webgl',
  '--hide-scrollbars',
  '--mute-audio',
  /* 允许不经点击就起声（仍静音），探测背景音时 AudioContext 才会真正运行 */
  '--autoplay-policy=no-user-gesture-required',
  /* 验收浏览器与本机的 Edge 账号隔离：不登录、不同步、不装扩展。否则 Edge 会隐式登录系统账号，
     把书签、扩展同步进来并弹出同步确认页（扩展开的标签页与弹窗会让页面卡住、截图挂起） */
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-sync',
  '--disable-extensions',
  '--disable-component-extensions-with-background-pages',
  '--disable-default-apps',
  '--disable-features=msImplicitSignin,msEdgeSyncConsent,msWebAssist,EdgeCollections',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function json(url) {
  for (let i = 0; i < 60; i++) {
    try {
      return await (await fetch(url)).json()
    } catch {
      await sleep(250)
    }
  }
  throw new Error('连不上浏览器调试端口')
}

class Page {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? rej(new Error(m.error.message)) : res(m.result)
      }
    })
  }
  send(method, params = {}, timeoutMs = 180000) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    /* 页面卡死（GPU 挂起、弹窗）时不无限等下去 */
    return new Promise((res, rej) => {
      const t = setTimeout(() => {
        this.pending.delete(id)
        rej(new Error(`${method} 超过 ${timeoutMs / 1000}s 无响应`))
      }, timeoutMs)
      this.pending.set(id, { res: (v) => (clearTimeout(t), res(v)), rej: (e) => (clearTimeout(t), rej(e)) })
    })
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
}

const SEED = `(() => { let s = 20260929; Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) })();`
const HIDE_UI = `
  (() => {
    const st = document.createElement('style')
    st.textContent = '.light-debug, .chrome, .labels, .panel, .vignette, .restore, .peek { display: none !important }'
    document.head.appendChild(st)
    const { store } = window.__shanhe
    store.set((s) => ({ ui: { ...s.ui, hidden: true, sheet: null } }))
  })()`

try {
  const targets = await json(`http://127.0.0.1:${port}/json/list`)
  const target = targets.find((t) => t.type === 'page')
  const page = new Page(new WebSocket(target.webSocketDebuggerUrl))
  await new Promise((r) => page.ws.addEventListener('open', r))
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: SEED })

  let loaded = ''
  for (const sc of scenes) {
    try {
    const [w, h] = sc.size ?? [1440, 900]
    await page.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: sc.dpr ?? 1, mobile: false })
    const query = sc.query ?? 'shs=summer&shw=clear&shm=day&q=mid'
    const key = `${query}|${w}x${h}|${sc.dpr ?? 1}`
    /* 连续几个场景地址参数相同就复用同一个页面（场景之间靠 setup 调机位），省掉重新载入 */
    if (key !== loaded || sc.fresh) {
      await page.send('Page.navigate', { url: 'about:blank' })
      await sleep(300)
      await page.send('Page.navigate', { url: `${base}/?${query}` })
      const t0 = Date.now()
      while (!(await page.eval(`!!(window.__shanhe && window.__shanhe.store.get().loading.ready)`).catch(() => false))) {
        if (Date.now() - t0 > 240000) throw new Error(`${sc.name}: 加载超时`)
        await sleep(500)
      }
      await page.eval(HIDE_UI)
      loaded = key
    }
    const settle = async (label) => {
      const t1 = Date.now()
      let stable = 0
      while (stable < 6) {
        const ok = await page.eval(`window.__shanhe.engine.world.chunks.settled`)
        stable = ok ? stable + 1 : 0
        if (Date.now() - t1 > settleMs) {
          console.warn(`${sc.name}: ${label} 区块未在时限内载完，照当前画面出图`)
          break
        }
        await sleep(400)
      }
    }
    await settle('初始')
    /* setup 可以是数组：逐项执行，每项之后等区块载完（先调机位、载完，再套显隐 / 光照之类的开关） */
    for (const step of [sc.setup ?? []].flat()) {
      await page.eval(step)
      await sleep(600)
      await settle('机位')
    }
    await sleep(sc.wait ?? 1500)
    /* probe：在页面里求值并把结果打印出来（查询世界数据、搜机位用）；shot 为 false 则不截图 */
    if (sc.probe) console.log(sc.name, 'probe =>', JSON.stringify(await page.eval(sc.probe)))
    if (sc.shot === false) continue
    const shot = await page.send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, `${sc.name}.png`)
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
    console.log('->', file)
    } catch (err) {
      /* 单个场景失败（超时、页面卡死）：记下来，下一个场景重新载入页面 */
      console.warn(`${sc.name}: 失败，跳过 —— ${err.message}`)
      loaded = ''
    }
  }
} finally {
  proc.kill()
  await sleep(300)
  if (!fixedProfile)
    try {
      fs.rmSync(profile, { recursive: true, force: true })
    } catch {}
}
process.exit(0)
