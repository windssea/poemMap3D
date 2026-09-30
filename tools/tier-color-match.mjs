/**
 * 各层级同一片地表的颜色是否对得上（近景 / 远景 / 远景片 / 全国覆盖图）。
 *
 *   node tools/tier-color-match.mjs scenes <输出 json>       生成场景
 *   node tools/shoot.mjs <json> <目录> --base http://localhost:<端口>
 *   node tools/tier-color-match.mjs measure <目录>            打印各层平均色与比值
 *
 * 做法：先在杭州把周围区块载完，然后冻结世界更新，关掉区块与覆盖图的互相让位（掩膜），
 * 再逐层「只留这一层」、正俯视镜头飞到离杭州 320 / 700 / 1100 格外的同一处地表拍一张（关雾）。
 * 同一处地表在不同层里画出来的平均色之比，就是层与层之间的亮度 / 色偏台阶。
 * 覆盖图的逐通道增益（MaterialLibrary 里 vec3(1.11, 1.035, 1.06)）即由此量得。
 */
import fs from 'node:fs'
import { decode, luma } from './lum.mjs'

const [mode, arg] = process.argv.slice(2)

if (mode === 'scenes') {
  const QUERY = 'shs=summer&shw=clear&shm=day&q=mid'
  const FOCUS = `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('hangzhou');const c=e.camera;c.clearFixed();c.pose.target.copy(v.target);c.goal.target.copy(v.target);c.pose.distance=c.goal.distance=400;c.pose.pitch=c.goal.pitch=0.9;c.pose.yaw=c.goal.yaw=0.5})()`
  const FREEZE = `(()=>{const e=window.__shanhe.engine;e.world.update=()=>{};e.applyDebugWorld=()=>{};if(!window.__nomask){window.__nomask=1;const f=()=>{e.shared.uChunkMaskRect.value.set(1e9,1e9,1,1);requestAnimationFrame(f)};f()};e.setLighting({fog:false})})()`
  const ONLY = (tiers, ov) =>
    `(()=>{const e=window.__shanhe.engine;const o=e.world.overview;o.update=()=>{};e.world.chunks.restoreVisibility();e.world.chunks.applyTierVisibility(t=>[${tiers}].includes(t));o.group.visible=${ov};for(const t of o.tiles.values()){t.covered=false;for(const m of t.fine)m.visible=true;for(const m of t.coarse)m.visible=false}})()`
  const TOP = (dx, dz) =>
    `(()=>{const e=window.__shanhe.engine;const v=e.world.landmarkView('hangzhou');const V=v.target.constructor;const x=v.target.x+(${dx}),z=v.target.z+(${dz});const g=e.world.sampler.groundHeightAt(x,z);e.camera.setFixed(new V(x,g+300,z+0.01),new V(x,g,z),42)})()`
  const scenes = [{ name: 'prep', query: QUERY, setup: [FOCUS, FREEZE], shot: false }]
  for (const [tag, dx] of [['r320', -320], ['r700', -700]])
    for (const [n, tiers, ov] of [['t2', [2], false], ['t4', [4], false], ['ov', [], true]]) scenes.push({ name: `cmp-${tag}-${n}`, query: QUERY, setup: [ONLY(tiers, ov), TOP(dx, 0)], wait: 1200 })
  fs.writeFileSync(arg, JSON.stringify(scenes, null, 1))
  console.log(`${scenes.length} 个场景 -> ${arg}`)
} else if (mode === 'measure') {
  const mean = (file) => {
    const { w, h, bpp, px } = decode(file)
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let y = Math.floor(h * 0.2); y < h * 0.8; y += 2)
      for (let x = Math.floor(w * 0.2); x < w * 0.8; x += 2) {
        const o = (y * w + x) * bpp
        r += px[o]
        g += px[o + 1]
        b += px[o + 2]
        n++
      }
    return [r / n, g / n, b / n]
  }
  for (const tag of ['r320', 'r700']) {
    const t4 = `${arg}/cmp-${tag}-t4.png`
    const ov = `${arg}/cmp-${tag}-ov.png`
    if (!fs.existsSync(t4) || !fs.existsSync(ov)) continue
    const a = mean(t4)
    const c = mean(ov)
    console.log(tag, '远景片', a.map((v) => v.toFixed(1)).join(','), 'Y', luma(...a).toFixed(1), '| 覆盖图', c.map((v) => v.toFixed(1)).join(','), 'Y', luma(...c).toFixed(1), '| 增益(远景片/覆盖图)', a.map((v, i) => (v / c[i]).toFixed(3)).join(','))
  }
} else {
  console.error('用法: scenes <json> | measure <目录>')
  process.exit(1)
}
