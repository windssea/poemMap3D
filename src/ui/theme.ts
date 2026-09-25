import { Palette, TrailTokens } from '../config/palette'

const rgb = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/**
 * 把调色板写成 CSS 变量（界面样式只引用变量，不写色值）。
 * --c-xxx 为颜色，--rgb-xxx 为「r g b」三元组，供 rgb(var(--rgb-xxx) / α) 使用。
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
  }
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--c-${k}`, v)
    root.style.setProperty(`--rgb-${k}`, rgb(v))
  }
  TrailTokens.forEach((c, i) => root.style.setProperty(`--c-trail-${i}`, c))
}
