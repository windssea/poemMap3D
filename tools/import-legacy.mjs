/**
 * 旧项目数据清洗导入（只读 legacy/，输出到 public/）。
 *
 * 旧项目只作为数据来源：诗词、诗人、名句打标、巡游路线、陆地掩膜、书法字体。
 * 这里把旧的 window.* 全局脚本一次性解析、改名、校验，写成新项目自己的 JSON / 二进制资产；
 * 运行时代码不再引用 legacy/ 下的任何文件。
 *
 *   node tools/import-legacy.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const LEGACY = path.join(ROOT, 'legacy')
const OUT = path.join(ROOT, 'public')

/** 在沙箱里执行旧的全局脚本，取回 window 上的数据 */
function loadLegacyGlobal(file) {
  const window = {}
  vm.runInNewContext(fs.readFileSync(path.join(LEGACY, file), 'utf8'), { window, atob: (s) => Buffer.from(s, 'base64').toString('binary') })
  return window
}

function assert(cond, msg) {
  if (!cond) throw new Error(`[import-legacy] ${msg}`)
}

fs.mkdirSync(path.join(OUT, 'data'), { recursive: true })
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true })

/* —— 诗词 —— */
const { POEM_DATA } = loadLegacyGlobal('data/poems.js')
const { POEM_FAME } = loadLegacyGlobal('data/fame.js')
const ids = new Set()
const poems = POEM_DATA.poems.map((p) => {
  assert(p.id && !ids.has(p.id), `诗词 id 重复或缺失：${p.id}`)
  ids.add(p.id)
  assert(Array.isArray(p.l) && p.l.length > 0, `诗词缺少正文：${p.id}`)
  assert(Number.isFinite(p.lat) && Number.isFinite(p.lng), `诗词缺少坐标：${p.id}`)
  const fame = POEM_FAME[p.id]
  return {
    id: p.id,
    title: p.t,
    dynasty: p.d,
    author: p.a,
    form: p.f,
    placeName: p.pn,
    region: p.rg,
    lat: p.lat,
    lng: p.lng,
    lines: p.l,
    origin: p.o || undefined,
    preface: p.pr || undefined,
    translation: p.tr || undefined,
    appreciation: p.ap || undefined,
    story: p.st || undefined,
    notes: Array.isArray(p.n) ? p.n.map(([term, gloss]) => ({ term, gloss })) : undefined,
    tags: p.g || [],
    fame: fame ? { line: fame[0], score: fame[1], count: fame[2] || 2 } : undefined,
  }
})
const authors = Object.entries(POEM_DATA.authors).map(([name, a]) => ({ name, years: a.years || '', bio: a.bio || '' }))

/* —— 地点：邻近坐标聚成一处；一处多名时取最为人熟知的名字；主要地点给出稳定的英文 id —— */
const PREF_NAMES = ['长安', '洛阳', '汴京', '扬州', '杭州', '苏州', '黄州', '黄鹤楼', '白帝城', '庐山', '成都', '终南山', '洞庭湖', '襄阳', '渭城', '滁州', '永州', '轮台', '山阴', '吴兴', '乌江', '密州', '钟山', '上饶', '彭城', '惠州', '福州', '多景楼', '荆门山']
const CITY_ALIAS = { 南京: '金陵', 镇江: '润州', 绍兴: '越州' }
const SLUG = {
  长安: 'changan', 杭州: 'hangzhou', 庐山: 'lushan', 洛阳: 'luoyang', 汴京: 'bianjing', 金陵: 'jinling', 苏州: 'suzhou', 扬州: 'yangzhou',
  成都: 'chengdu', 黄鹤楼: 'huanghelou', 岳阳楼: 'yueyanglou', 白帝城: 'baidicheng', 终南山: 'zhongnanshan', 洞庭湖: 'dongtinghu',
  黄州: 'huangzhou', 彭城: 'pengcheng', 山阴: 'shanyin', 襄阳: 'xiangyang', 渭城: 'weicheng', 滁州: 'chuzhou', 永州: 'yongzhou', 枫桥: 'fengqiao', 滕王阁: 'tengwangge',
}
const fameOf = (p) => (p.fame ? p.fame.score : 2)
const nodes = []
for (const p of poems) {
  let h = nodes.find((c) => Math.abs(c.lat0 - p.lat) < 0.15 && Math.abs(c.lng0 - p.lng) < 0.2)
  if (!h) nodes.push((h = { lat0: p.lat, lng0: p.lng, poems: [] }))
  h.poems.push(p)
}
const usedIds = new Set()
const places = nodes.map((n, i) => {
  const lat = +(n.poems.reduce((s, p) => s + p.lat, 0) / n.poems.length).toFixed(4)
  const lng = +(n.poems.reduce((s, p) => s + p.lng, 0) / n.poems.length).toFixed(4)
  const cnt = {}
  n.poems.forEach((p) => (cnt[p.placeName] = (cnt[p.placeName] || 0) + 1))
  const names = Object.keys(cnt)
  const pref = names.length > 1 && PREF_NAMES.find((k) => names.some((x) => x.includes(k)))
  let name = pref || names.sort((a, b) => cnt[b] - cnt[a] || a.length - b.length)[0]
  if (!pref && names.length > 3 && cnt[name] === 1) {
    const city = (n.poems[0].region.split('·')[1] || '').trim()
    name = CITY_ALIAS[city] || city || name
  }
  const rc = {}
  n.poems.forEach((p) => (rc[p.region] = (rc[p.region] || 0) + 1))
  let id = SLUG[name] || `p${String(i + 1).padStart(3, '0')}`
  if (usedIds.has(id)) id = `${id}-${i + 1}`
  usedIds.add(id)
  const sorted = [...n.poems].sort((a, b) => fameOf(b) - fameOf(a))
  for (const p of n.poems) p.placeId = id
  return { id, name, lat, lng, region: Object.keys(rc).sort((a, b) => rc[b] - rc[a])[0] || '', poemIds: sorted.map((p) => p.id) }
})
fs.writeFileSync(path.join(OUT, 'data/poems.json'), JSON.stringify({ version: 1, poems, authors, places }))
console.log(`poems.json：${poems.length} 首，${authors.length} 位作者，${places.length} 处地点`)

/* —— 诗人足迹：从旧页面脚本中取出 TRAILS 数据字面量 —— */
{
  const html = fs.readFileSync(path.join(LEGACY, 'index.html'), 'utf8')
  const i = html.indexOf('const TRAILS = {')
  const j = html.indexOf('\n};', i)
  assert(i > 0 && j > i, '找不到诗人足迹数据')
  const TRAILS = vm.runInNewContext(`(${html.slice(i + 'const TRAILS = '.length, j + 2)})`)
  const trails = Object.entries(TRAILS).map(([poet, t]) => ({
    poet,
    years: t.years,
    color: t.css,
    stops: t.stops.map(([year, place, lng, lat, note]) => ({ year, place, lng, lat, note })),
  }))
  fs.writeFileSync(path.join(OUT, 'data/trails.json'), JSON.stringify({ version: 1, trails }, null, 1))
  console.log(`trails.json：${trails.length} 位诗人`)
}

/* —— 巡游路线 —— */
const { TOUR_PLAN } = loadLegacyGlobal('data/tour.js')
const tour = TOUR_PLAN.map((seg) => ({
  region: seg.region,
  season: seg.season,
  time: seg.mood,
  weather: seg.weather === 'wet' ? 'rain' : 'clear',
  stops: seg.stops.map((s) => {
    s.poems.forEach((id) => assert(ids.has(id), `巡游引用了不存在的诗：${id}`))
    return { poemIds: s.poems, note: s.note, extra: !!s.extra }
  }),
}))
fs.writeFileSync(path.join(OUT, 'data/tour.json'), JSON.stringify({ version: 1, segments: tour }, null, 1))
console.log(`tour.json：${tour.length} 个片区`)

/* —— 陆地掩膜：gzip(base64) → 行程编码字节；写成带头部的二进制 —— */
{
  const src = fs.readFileSync(path.join(LEGACY, 'data/landmask.js'), 'utf8')
  const window = {}
  vm.runInNewContext(src, { window })
  const L = window.LAND_MASK
  const rle = zlib.gunzipSync(Buffer.from(L.gz, 'base64'))
  // 头部：magic 'LMSK' + f32 分辨率 + f32 西经界 + f32 北纬界 + u32 列 + u32 行
  const head = Buffer.alloc(24)
  head.write('LMSK', 0, 'ascii')
  head.writeFloatLE(L.r, 4)
  head.writeFloatLE(L.l0, 8)
  head.writeFloatLE(L.b1, 12)
  head.writeUInt32LE(L.cols, 16)
  head.writeUInt32LE(L.rows, 20)
  fs.writeFileSync(path.join(OUT, 'data/landmask.bin'), Buffer.concat([head, rle]))
  console.log(`landmask.bin：${L.cols}×${L.rows}，行程编码 ${rle.length} 字节`)
}

/* —— 书法字体：从旧的 base64 脚本里取出 woff2 —— */
for (const [file, out] of [['fonts/brush-tour.js', 'brush-ui.woff2'], ['fonts/brush-poems.js', 'brush-poems.woff2']]) {
  const m = fs.readFileSync(path.join(LEGACY, file), 'utf8').match(/atob\("([A-Za-z0-9+/=]+)"\)/)
  assert(m, `找不到字体数据：${file}`)
  fs.writeFileSync(path.join(OUT, 'fonts', out), Buffer.from(m[1], 'base64'))
  console.log(`${out}：${(Buffer.from(m[1], 'base64').length / 1024).toFixed(0)} KB`)
}
fs.copyFileSync(path.join(LEGACY, 'fonts/OFL.txt'), path.join(OUT, 'fonts/OFL.txt'))
