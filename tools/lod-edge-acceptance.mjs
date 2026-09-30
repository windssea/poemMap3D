/**
 * 问题 1（镜头推进时的亮度环带）与问题 3（高空世界边界）的验收场景。
 *
 *   node tools/lod-edge-acceptance.mjs <输出场景 json>
 *   node tools/shoot.mjs <json> <输出目录> --base http://localhost:<端口>
 *
 * 1. 亮度连续：以杭州为中心，从全国高空一路推进到地面，半俯视，每一档距离一张；夏 · 晴 · 昼。
 *    另有一组「只留某一层」的对照（近景 / 远景 / 远景片 / 全国覆盖图），看各层同一片地表的颜色是否对得上。
 * 2. 世界边界：全国俯视、最高允许缩放的机位、朝西 / 北 / 东 / 南四条边斜向看过去。
 */
import fs from 'node:fs'

const out = process.argv[2]
if (!out) {
  console.error('用法: node tools/lod-edge-acceptance.mjs <输出场景 json>')
  process.exit(1)
}
const QUERY = 'shs=summer&shw=clear&shm=day&q=mid'

const FOCUS = (place, dist, pitch, yaw) =>
  `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('${place}');const c=e.camera;c.clearFixed();c.pose.target.copy(v.target);c.goal.target.copy(v.target);c.pose.distance=c.goal.distance=${dist};c.pose.pitch=c.goal.pitch=${pitch};c.pose.yaw=c.goal.yaw=${yaw}})()`

/** 目标点放在世界矩形（雾图范围）上：fx、fz 是相对矩形的比例 0–1；镜头压到最高允许缩放 */
const RECT = (fx, fz, dist, pitch, yaw) =>
  `(()=>{const e=window.__shanhe.engine;const r=e.shared.uFogRect.value;const c=e.camera;c.clearFixed();
    const x=r.x+r.z*${fx},z=r.y+r.w*${fz};c.pose.target.set(x,60,z);c.goal.target.set(x,60,z);
    c.pose.distance=c.goal.distance=${dist};c.pose.pitch=c.goal.pitch=${pitch};c.pose.yaw=c.goal.yaw=${yaw}})()`

const scenes = []

/* 1. 连续推进 */
for (const d of [4200, 3000, 2000, 1400, 1000, 700, 450, 260, 120]) scenes.push({ name: `zoom-${String(d).padStart(4, '0')}`, query: QUERY, setup: [FOCUS('hangzhou', d, 0.75, 0.5)], wait: 1500 })

/* 3. 边界（镜头朝哪条边看：yaw 0 朝北、π/2 朝西、−π/2 朝东、π 朝南） */
const D = 4200
scenes.push({ name: 'edge-top', query: QUERY, setup: [RECT(0.5, 0.5, D, 1.5, 0)], wait: 1500 })
scenes.push({ name: 'edge-north', query: QUERY, setup: [RECT(0.5, 0.35, D, 0.55, 0)], wait: 1500 })
scenes.push({ name: 'edge-west', query: QUERY, setup: [RECT(0.35, 0.5, D, 0.55, Math.PI / 2)], wait: 1500 })
scenes.push({ name: 'edge-east', query: QUERY, setup: [RECT(0.65, 0.5, D, 0.55, -Math.PI / 2)], wait: 1500 })
scenes.push({ name: 'edge-south', query: QUERY, setup: [RECT(0.5, 0.65, D, 0.55, Math.PI)], wait: 1500 })
scenes.push({ name: 'edge-corner-ne', query: QUERY, setup: [RECT(0.7, 0.3, D, 0.45, -Math.PI / 4)], wait: 1500 })

fs.writeFileSync(out, JSON.stringify(scenes, null, 1))
console.log(`${scenes.length} 个场景 -> ${out}`)
