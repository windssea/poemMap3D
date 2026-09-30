/**
 * 晨 · 昼 · 暮 天空与光照的验收场景（配合 tools/shoot.mjs 出图）。
 *
 *   node tools/lighting-acceptance.mjs <输出场景 json>
 *   node tools/shoot.mjs <json> <输出目录> --base http://localhost:<端口>
 *
 * 机位来自 src/engine/camera/GroundTestCameras.ts（Node 直接读 .ts，只用到其中的常量与纯函数）。
 * 场景里用的是「眼点 + 注视点」的写法（camera.setFixed），所以「修改前」的代码副本只要有 setFixed 也能拍同样的画面，
 * 前后对比的机位、朝向、视场角、季节、天气、画质完全一致。
 *
 * 每个时段用 env.setTime(t, true) 瞬时切换，相机一动不动，不因时段重新构图。
 * 固定：夏 · 晴 · 画质「衡」· 1440×900 · 随机数种子（shoot.mjs 注入）· 界面全隐藏。
 */
import fs from 'node:fs'
import { EYE_HEIGHT_BLOCKS, GROUND_CAMERAS, compassDir } from '../src/engine/camera/GroundTestCameras.ts'

const out = process.argv[2]
if (!out) {
  console.error('用法: node tools/lighting-acceptance.mjs <输出场景 json>')
  process.exit(1)
}
const QUERY = 'shs=summer&shw=clear&shm=day&q=mid'
const TIMES = ['dawn', 'day', 'dusk']

const FOCUS = (place) =>
  `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('${place}');const c=e.camera;c.clearFixed();c.pose.target.copy(v.target);c.goal.target.copy(v.target);c.pose.distance=c.goal.distance=120;c.pose.pitch=c.goal.pitch=0.9})()`

/** 与光照无关的动态物（行人、船、鸟、飘落的花叶）不入镜：它们每次拍的位置都不同，会干扰前后对比 */
const QUIET = `(()=>{const e=window.__shanhe.engine;e.life.update=()=>{};e.life.group.visible=false;e.env.particles.group.visible=false})()`

const SET_TIME = (t) => `window.__shanhe.engine.env.setTime('${t}', true)`

/** 固定到某个地面机位（用眼点 + 注视点，新旧代码副本都认） */
const CAM = (spec, extra = {}) => {
  const heading = extra.heading ?? spec.heading
  const pitch = extra.pitch ?? spec.pitch
  const d = compassDir(heading, pitch)
  return `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('${spec.place}');const V=v.target.constructor;
    const x=v.target.x+${spec.dx},z=v.target.z+${spec.dz};const g=e.world.sampler.groundHeightAt(x,z);
    const eye=new V(x,g+${EYE_HEIGHT_BLOCKS},z);const look=new V(eye.x+${d.x}*48,eye.y+${d.y}*48,eye.z+${d.z}*48);
    e.camera.setFixed(eye,look,${extra.fov ?? spec.fov})})()`
}

/**
 * 朝向 / 背向天体（太阳或月亮）的机位：方位与仰角取当前时段的真实光线方向。
 * 眼点比人视抬高 LIFT 格（站在楼顶 / 坡上，视线越过树冠）：朝向天体时看日轮 / 月亮落在光线来的那个方位，
 * 背向天体时看地面上影子倒向哪边、受光面朝哪边——天体位置、影子、受光面三者应当互相一致。
 */
const LIFT = 14
const CAM_TO_BODY = (spec, away) =>
  `(()=>{const e=window.__shanhe.engine;const L=e.env.time.cur;const night=L.night>0.5;const d=night?L.moonDir:L.sunDir;
    let h=Math.atan2(d.x,-d.z)*180/Math.PI;let p=Math.min(40,Math.asin(d.y)*180/Math.PI);if(${away}){h+=180;p=-8}
    const v=e.world.landmarkView('${spec.place}');const V=v.target.constructor;
    const x=v.target.x+${spec.dx},z=v.target.z+${spec.dz};const g=e.world.sampler.groundHeightAt(x,z);
    const eye=new V(x,g+${EYE_HEIGHT_BLOCKS + LIFT},z);const a=h*Math.PI/180,q=p*Math.PI/180;
    const look=new V(eye.x+Math.sin(a)*Math.cos(q)*48,eye.y+Math.sin(q)*48,eye.z-Math.cos(a)*Math.cos(q)*48);
    e.camera.setFixed(eye,look,70)})()`

const SKY_ONLY = `(()=>{const e=window.__shanhe.engine;e.setLighting({world:'none',fog:false})})()`
const FULL = `(()=>{const e=window.__shanhe.engine;e.setLighting({world:'all',fog:true})})()`

const scenes = []
const A = GROUND_CAMERAS.A
const B = GROUND_CAMERAS.B

/* 1、2：机位 A / B × 晨昼暮 */
for (const cam of [A, B]) {
  let first = true
  for (const t of TIMES) {
    const setup = first ? [FOCUS(cam.place), QUIET, CAM(cam), SET_TIME(t)] : [CAM(cam), SET_TIME(t)]
    first = false
    scenes.push({ name: `cam${cam.id}-${t}`, query: QUERY, setup, wait: 1800 })
  }
}

/* 5、6：Sky Only 与完整场景对照（机位 A） */
for (const t of TIMES) {
  scenes.push({ name: `sky-only-${t}`, query: QUERY, setup: [CAM(A), SET_TIME(t), SKY_ONLY], wait: 1800 })
  scenes.push({ name: `sky-full-${t}`, query: QUERY, setup: [FULL, CAM(A), SET_TIME(t)], wait: 1800 })
}
scenes.push({ name: 'reset', query: QUERY, setup: [FULL], wait: 100, shot: false })

/* 7：太阳 / 月亮方向一致性——朝向天体（看日轮、光晕）与背向天体（看地面影子、受光面） */
for (const t of [...TIMES, 'night']) {
  scenes.push({ name: `body-toward-${t}`, query: QUERY, setup: [SET_TIME(t), CAM_TO_BODY(A, false)], wait: 1800 })
  scenes.push({ name: `body-away-${t}`, query: QUERY, setup: [SET_TIME(t), CAM_TO_BODY(A, true)], wait: 1800 })
}

fs.writeFileSync(out, JSON.stringify(scenes, null, 1))
console.log(`${scenes.length} 个场景 -> ${out}`)
