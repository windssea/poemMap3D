import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]))

/**
 * 曝光只由晨 / 昼 / 暮 / 夜的时段设定决定，不随镜头高度、距离、画面亮度自适应。
 * 镜头拉远拉近时若曝光跟着变，全国图、半俯视图、中景图就会出现一圈一圈的亮度环带。
 */
describe('曝光锁定在时段上', () => {
  const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('devtools'))
  const uses = files.filter((f) => fs.readFileSync(f, 'utf8').includes('toneMappingExposure'))

  it('toneMappingExposure 只在渲染器初始化与环境管理器里写', () => {
    expect(uses.map((f) => path.basename(f)).sort()).toEqual(['EnvironmentManager.ts', 'RendererManager.ts'])
  })

  it('环境管理器里的曝光只来自时段（L.exposure）与调试倍数，不含镜头距离 / 高度 / 俯仰', () => {
    const line = fs
      .readFileSync('src/engine/environment/EnvironmentManager.ts', 'utf8')
      .split('\n')
      .find((l) => l.includes('toneMappingExposure'))!
    expect(line).toMatch(/L\.exposure/)
    expect(line).not.toMatch(/distance|height|pitch|viewDir|camera|focus/i)
  })
})
