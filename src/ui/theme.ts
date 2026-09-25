import { MountTokens, Palette, TrailTokens } from '../config/palette'

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}
const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`

/**
 * 把调色板写成 CSS 变量（界面样式只引用变量，不写色值）。
 * --c-xxx 为颜色，--rgb-xxx 为「r g b」三元组，供 rgb(var(--rgb-xxx) / α) 使用；
 * 另生成装裱纹理：宣纸纤维、云纹锦、木纹、远山。
 */
export function applyTheme(root: HTMLElement = document.documentElement): void {
  const tokens: Record<string, string> = {
    shiqing: Palette.shiqing,
    shilv: Palette.shilv,
    daiqing: Palette.daiqing,
    xuanzhi: Palette.xuanzhi,
    gujin: Palette.gujin,
    zhusha: Palette.zhusha,
    mo: Palette.mo,
    'mo-dan': Palette.moDan,
    'mo-qing': Palette.moQing,
    zhe: Palette.zhe,
    paper: MountTokens.paper,
    'paper-light': MountTokens.paperLight,
    'paper-warm': MountTokens.paperWarm,
    'paper-edge': MountTokens.paperEdge,
    'paper-old': MountTokens.paperOld,
    'paper-old-edge': MountTokens.paperOldEdge,
    'paper-gold': MountTokens.paperGold,
    'gold-fleck': MountTokens.goldFleck,
    'gold-seam': MountTokens.goldSeam,
    'gold-seam-light': MountTokens.goldSeamLight,
    'seal-deep': MountTokens.sealDeep,
    famous: MountTokens.famous,
    'ink-deep': MountTokens.inkDeep,
    'ink-text': MountTokens.inkText,
    'jade-0': MountTokens.jade[0],
    'jade-1': MountTokens.jade[1],
    'jade-2': MountTokens.jade[2],
    'wood-cap-0': MountTokens.woodCap[0],
    'wood-cap-1': MountTokens.woodCap[1],
  }
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--c-${k}`, v)
    root.style.setProperty(`--rgb-${k}`, rgb(v))
  }
  TrailTokens.forEach((c, i) => root.style.setProperty(`--c-trail-${i}`, c))

  const [b0, b1, b2] = MountTokens.brocade
  const W = MountTokens.wood
  const xuan = svg(
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='.85 .05' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .42 0 0 0 0 .33 0 0 0 0 .2 0 0 0 .11 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`,
  )
  const grain = svg(
    `<svg xmlns='http://www.w3.org/2000/svg' width='60' height='240'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='.9 .012' numOctaves='3' seed='7'/><feColorMatrix values='0 0 0 0 .2 0 0 0 0 .1 0 0 0 0 .04 0 0 0 1.9 -.62'/></filter><rect width='100%' height='100%' filter='url(#w)'/></svg>`,
  )
  const cloud = svg(
    `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><path d='M5 17c0-3.2 3.4-5.2 6-3.6.6-3.6 5.8-3.9 7-.4 2.7-1 5 .9 4.4 3.6M20 27c-1.6-1.8-.2-4.4 2-4' fill='none' stroke='${MountTokens.brocadeInk}' stroke-opacity='.26' stroke-width='1.15' stroke-linecap='round'/><circle cx='9' cy='24' r='1.2' fill='${MountTokens.paperLight}' fill-opacity='.3'/></svg>`,
  )
  const hills = svg(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 120' preserveAspectRatio='none'><defs><linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${MountTokens.hills}'/><stop offset='1' stop-color='${MountTokens.hills}' stop-opacity='0'/></linearGradient></defs><path d='M0 92C30 70 52 54 76 60s40 26 64 16 34-50 62-48 38 36 64 38 36-22 58-20 40 24 76 30V120H0Z' fill='url(#a)' opacity='.55'/><path d='M0 104c26-10 48-24 80-18s44 18 76 12 50-34 84-30 46 26 76 26 52-10 84-4V120H0Z' fill='url(#a)'/></svg>`,
  )
  const light = rgb(MountTokens.paperLight)
  const ink = rgb(MountTokens.brocadeInk)
  root.style.setProperty('--xuan', xuan)
  root.style.setProperty('--grain', grain)
  root.style.setProperty('--hills', hills)
  root.style.setProperty(
    '--wood',
    `${grain} 0 0/60px 240px, linear-gradient(90deg, rgb(0 0 0 / .34), rgb(0 0 0 / 0) 32%, rgb(${light} / .1) 48%, rgb(0 0 0 / 0) 62%, rgb(0 0 0 / .38)), linear-gradient(180deg, ${W[0]}, ${W[1]} 30%, ${W[2]} 55%, ${W[3]} 80%, ${W[4]})`,
  )
  root.style.setProperty(
    '--brocade',
    `${cloud} 0 0/30px 30px, repeating-linear-gradient(45deg, rgb(${light} / .09) 0 1.5px, transparent 1.5px 7px), repeating-linear-gradient(-45deg, rgb(${ink} / .08) 0 1.5px, transparent 1.5px 7px), radial-gradient(circle, rgb(${light} / .16) 0 1.6px, transparent 2.4px) 0 0/14px 14px, linear-gradient(180deg, ${b0}, ${b1} 50%, ${b2})`,
  )
}
