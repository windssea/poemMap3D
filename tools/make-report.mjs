/**
 * 把验收截图排成一页对照报告（相对路径引用，直接用浏览器打开）。
 *
 *   node tools/make-report.mjs
 *
 * 读取 shots/lighting-ground/{before,after} 与 shots/lod-edge/{before,after}，写出 shots/report.html。
 * before = 改动前的代码（0df6227），after = 当前工作区；机位、季节、天气、画质、分辨率、随机数种子完全一致。
 */
import fs from 'node:fs'

const has = (p) => fs.existsSync(p)
const img = (p) => (has(`shots/${p}`) ? `<a href="${p}"><img loading="lazy" src="${p}"></a>` : '<div class="missing">无</div>')
const pair = (dir, name, label) => `<figure><figcaption>${label}</figcaption><div class="pair"><div><span>修改前</span>${img(`${dir}/before/${name}.png`)}</div><div><span>修改后</span>${img(`${dir}/after/${name}.png`)}</div></div></figure>`
const single = (dir, name, label) => `<figure><figcaption>${label}</figcaption>${img(`${dir}/after/${name}.png`)}</figure>`

const T = { dawn: '晨', day: '昼', dusk: '暮', night: '夜' }
const parts = []
parts.push('<h2>问题 2 · 地面人视机位 A（Ground Sky Test）：修改前后</h2>')
for (const t of ['dawn', 'day', 'dusk']) parts.push(pair('lighting-ground', `camA-${t}`, `机位 A · ${T[t]}`))
parts.push('<h2>问题 2 · 地面人视机位 B（Ground Lighting Test）：修改前后</h2>')
for (const t of ['dawn', 'day', 'dusk']) parts.push(pair('lighting-ground', `camB-${t}`, `机位 B · ${T[t]}`))
parts.push('<h2>问题 2 · 仅天空 与 完整场景（机位 A）</h2>')
for (const t of ['dawn', 'day', 'dusk']) parts.push(`<figure><figcaption>${T[t]}</figcaption><div class="pair"><div><span>Sky Only</span>${img(`lighting-ground/after/sky-only-${t}.png`)}</div><div><span>完整场景</span>${img(`lighting-ground/after/sky-full-${t}.png`)}</div></div></figure>`)
parts.push('<h2>问题 2 · 太阳 / 月亮方向一致性（朝向天体 · 背向天体，眼点抬高越过树冠）</h2>')
for (const t of ['dawn', 'day', 'dusk', 'night']) parts.push(`<figure><figcaption>${T[t]}（${t === 'night' ? '月' : '日'}）</figcaption><div class="pair"><div><span>朝向${t === 'night' ? '月亮' : '太阳'}</span>${img(`lighting-ground/after/body-toward-${t}.png`)}</div><div><span>背向（看影子与受光面）</span>${img(`lighting-ground/after/body-away-${t}.png`)}</div></div></figure>`)
parts.push('<h2>问题 1 · 镜头由全国高空推进到近景（半俯视，杭州）：修改前后</h2>')
for (const d of ['4200', '3000', '2000', '1400', '1000', '0700', '0450', '0260', '0120']) parts.push(pair('lod-edge', `zoom-${d}`, `镜头距离 ${Number(d)}`))
parts.push('<h2>问题 3 · 世界边界：修改前后</h2>')
for (const [n, l] of [['edge-top', '全国俯视（最高缩放）'], ['edge-north', '朝北边斜看'], ['edge-west', '朝西边斜看'], ['edge-east', '朝东边斜看'], ['edge-south', '朝南边斜看'], ['edge-corner-ne', '东北角斜看']]) parts.push(pair('lod-edge', n, l))

const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>光照与边界验收对照</title>
<style>
body{font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif;margin:24px auto;max-width:1500px;padding:0 16px;background:#f4f1ea;color:#2b2b2b}
h2{margin:40px 0 12px;border-left:6px solid #8a6d3b;padding-left:10px}
figure{margin:0 0 24px}figcaption{font-weight:600;margin-bottom:6px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pair span{display:block;font-size:12px;color:#777;margin-bottom:2px}
img{width:100%;display:block;border:1px solid #cfc8b8}
.missing{padding:40px;text-align:center;color:#aaa;border:1px dashed #ccc}
</style>${parts.join('\n')}</html>`
fs.writeFileSync('shots/report.html', html)
console.log('-> shots/report.html')
