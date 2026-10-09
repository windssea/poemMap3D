import { describe, expect, it } from 'vitest'
import { outOfFocus } from '../src/ui/labelFocus'

const H = 900

describe('景深之外的地名签藏起来', () => {
  it('关景深、「轻」画质（看不到虚化）都不藏', () => {
    expect(outOfFocus('off', 'high', 'local', 900, 50, H, 200, 200)).toBe(false)
    expect(outOfFocus('deep', 'low', 'local', 900, 50, H, 200, 200)).toBe(false)
    expect(outOfFocus('mini', 'low', 'local', 900, 50, H, 200, 200)).toBe(false)
  })

  it('真实景深：对焦距离附近的显示，远远在焦外的藏；极浅比浅藏得多', () => {
    // 对焦 200：深度 220 只差一成，清楚
    expect(outOfFocus('deep', 'high', 'local', 220, 450, H, 200, 200)).toBe(false)
    // 深度 280（差约三成）：极浅已虚、浅还算清楚
    expect(outOfFocus('deep', 'high', 'local', 280, 450, H, 200, 200)).toBe(true)
    expect(outOfFocus('shallow', 'high', 'local', 280, 450, H, 200, 200)).toBe(false)
    // 远远在后、远远在前都藏
    expect(outOfFocus('shallow', 'high', 'local', 600, 450, H, 200, 200)).toBe(true)
    expect(outOfFocus('shallow', 'high', 'local', 100, 450, H, 200, 200)).toBe(true)
  })

  it('长焦虚得更厉害，门槛跟着收窄', () => {
    // 同样差一成五：标准镜头清楚，长焦（真实距离是取景距离的约 2.7 倍）已虚
    expect(outOfFocus('deep', 'high', 'local', 230, 450, H, 200, 200)).toBe(false)
    expect(outOfFocus('deep', 'high', 'local', 540 * 1.15, 450, H, 540, 200)).toBe(true)
  })

  it('全国视角不做真实景深，签照常显示；微缩按屏幕高度、各级视角都算', () => {
    expect(outOfFocus('deep', 'high', 'national', 9000, 450, H, 2700, 2700)).toBe(false)
    expect(outOfFocus('mini', 'mid', 'national', 2700, 450, H, 2700, 2700)).toBe(false)
    expect(outOfFocus('mini', 'mid', 'national', 2700, 100, H, 2700, 2700)).toBe(true)
    expect(outOfFocus('mini', 'mid', 'local', 200, 800, H, 200, 200)).toBe(true)
  })
})
