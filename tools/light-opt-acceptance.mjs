/**
 * 光照表现优化（doc/参考页对比_体素宝塔_光照山体镜头远景.md §2A / §2B）的前后对照场景。
 *
 *   node tools/light-opt-acceptance.mjs <输出场景 json>
 *   node tools/shoot.mjs <json> <输出目录> --base http://localhost:<端口>
 *   node tools/lum.mjs zoom <目录>          缩放扫描的逐级亮度与相邻两级变化
 *
 * 1. 缩放扫描：杭州，半俯视，距离从全国一路推到地面；阴影在 900 处整体关闭，所以 1000–800 之间加密。
 * 2. 地面机位 A / B × 晨昼暮夜（夜景看月光照到的是哪一面）。
 * 3. 竖屏（390×844）聚焦一处地标：视场角是否够宽。
 * 固定：夏 · 晴 · 画质「衡」· 随机数种子（shoot.mjs 注入）· 界面全隐藏 · 行人船鸟与飘落物不入镜。
 */
import fs from 'node:fs'
import { EYE_HEIGHT_BLOCKS, GROUND_CAMERAS, compassDir } from '../src/engine/camera/GroundTestCameras.ts'

const out = process.argv[2]
if (!out) {
  console.error('用法: node tools/light-opt-acceptance.mjs <输出场景 json>')
  process.exit(1)
}
const QUERY = 'shs=summer&shw=clear&shm=day&q=mid'

const QUIET = `(()=>{const e=window.__shanhe.engine;e.life.update=()=>{};e.life.group.visible=false;e.env.particles.group.visible=false})()`
const SET_TIME = (t) => `window.__shanhe.engine.env.setTime('${t}', true)`
const FOCUS = (place, dist, pitch, yaw) =>
  `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('${place}');const c=e.camera;c.clearFixed();c.pose.target.copy(v.target);c.goal.target.copy(v.target);c.pose.distance=c.goal.distance=${dist};c.pose.pitch=c.goal.pitch=${pitch};c.pose.yaw=c.goal.yaw=${yaw}})()`
const CAM = (spec) => {
  const d = compassDir(spec.heading, spec.pitch)
  return `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('${spec.place}');const V=v.target.constructor;
    const x=v.target.x+${spec.dx},z=v.target.z+${spec.dz};const g=e.world.sampler.groundHeightAt(x,z);
    const eye=new V(x,g+${EYE_HEIGHT_BLOCKS},z);const look=new V(eye.x+${d.x}*48,eye.y+${d.y}*48,eye.z+${d.z}*48);
    e.camera.setFixed(eye,look,${spec.fov})})()`
}

const scenes = []

/* 1. 缩放扫描 */
const ZOOM = [3000, 1400, 1000, 920, 860, 700, 450, 260, 140, 60]
ZOOM.forEach((d, i) => scenes.push({ name: `zoom-${String(d).padStart(4, '0')}`, query: QUERY, setup: i === 0 ? [QUIET, FOCUS('hangzhou', d, 0.75, 0.5)] : [FOCUS('hangzhou', d, 0.75, 0.5)], wait: 2500 }))

/* 2. 地面机位 × 时段 */
for (const cam of [GROUND_CAMERAS.A, GROUND_CAMERAS.B])
  for (const t of ['dawn', 'day', 'dusk', 'night']) scenes.push({ name: `cam${cam.id}-${t}`, query: QUERY, setup: [FOCUS(cam.place, 120, 0.9, 0), CAM(cam), SET_TIME(t)], wait: 1800 })

/* 3. 夜 · 地标半俯视（月光打在朝镜头的面上没有） */
scenes.push({ name: 'night-huanghelou', query: QUERY, setup: [SET_TIME('night'), FOCUS('huanghelou', 160, 0.55, 0)], wait: 2500 })
scenes.push({ name: 'dusk-huanghelou', query: QUERY, setup: [SET_TIME('dusk'), FOCUS('huanghelou', 160, 0.55, 0)], wait: 2500 })
scenes.push({ name: 'dawn-huanghelou', query: QUERY, setup: [SET_TIME('dawn'), FOCUS('huanghelou', 160, 0.55, 0)], wait: 2500 })

/* 4. 竖屏 */
scenes.push({ name: 'portrait-huanghelou', query: QUERY, size: [390, 844], fresh: true, setup: [QUIET, SET_TIME('day'), `window.__shanhe.engine.focusPlace('huanghelou',{duration:0.2})`], wait: 3500 })

fs.writeFileSync(out, JSON.stringify(scenes, null, 1))
console.log(`${scenes.length} 个场景 -> ${out}`)
