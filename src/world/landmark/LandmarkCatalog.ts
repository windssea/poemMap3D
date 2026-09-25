import { BiomeId } from '../biome/BiomeId'
import type { LandmarkDefinition, StructureSpec } from './LandmarkDefinition'

/*
 * 手工营造的样板地标。每一处都有不同的地形、建筑、植被、水面与取景。
 * 局部坐标：方块，x 向东、z 向南；rot 为俯视顺时针 90° 次数（0 = 正面朝南，1 朝西，3 朝东）。
 */

const grid = (xs: number[], zs: number[], skip: (x: number, z: number) => boolean = () => false, rot = 0): StructureSpec[] => {
  const out: StructureSpec[] = []
  for (const x of xs) for (const z of zs) if (!skip(x, z)) out.push({ b: 'house', x, z, rot, p: { width: 7, depth: 5, seed: x * 31 + z } })
  return out
}
const steps = (a: number, b: number, s: number) => Array.from({ length: Math.floor((b - a) / s) + 1 }, (_, i) => a + i * s)

/** 杭州：城在湖东，西湖居中；苏堤、白堤、三潭小岛；西、南群山环抱，南屏雷峰、北山保俶 */
const HANGZHOU: LandmarkDefinition = {
  id: 'hangzhou',
  name: '杭州',
  coordinate: { lng: 120.15, lat: 30.25 },
  radius: 66,
  major: true,
  poetryPlaceId: 'hangzhou',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 58, blend: 12 },
    { t: 'hill', x: -54, z: -8, r: 22, h: 17 },
    { t: 'hill', x: -46, z: 24, r: 17, h: 12 },
    { t: 'hill', x: -26, z: 44, r: 16, h: 10 },
    { t: 'hill', x: -16, z: -44, r: 14, h: 9 },
    { t: 'lake', x: -14, z: 0, rx: 24, rz: 31, depth: 3 },
    { t: 'causeway', pts: [[-27, -30], [-29, -15]], w: 1.6 },
    { t: 'causeway', pts: [[-29.4, -9], [-30, 9]], w: 1.6 },
    { t: 'causeway', pts: [[-29.8, 15], [-27, 30]], w: 1.6 },
    { t: 'causeway', pts: [[-12, -30], [-5, -27]], w: 1.6 },
    { t: 'causeway', pts: [[1, -25], [10, -22]], w: 1.6 },
    { t: 'island', x: -8, z: 8, r: 4.5 },
    { t: 'flatten', x: 38, z: 2, r: 22, square: true, pave: true, blend: 4 },
  ],
  structures: [
    { b: 'pagoda', x: -26, z: 40, p: { levels: 5, width: 7 } },
    { b: 'pagoda', x: -16, z: -44, p: { levels: 7, width: 5 } },
    { b: 'pavilion', x: -8, z: 8, p: { width: 5, lanterns: true } },
    { b: 'pavilion', x: 12, z: -21, p: { width: 5 } },
    { b: 'bridge', x: -29, z: -12, rot: 1, atLevel: true, p: { length: 9 } },
    { b: 'bridge', x: -30, z: 12, rot: 1, atLevel: true, p: { length: 9 } },
    { b: 'bridge', x: -2, z: -26, rot: 0, atLevel: true, p: { length: 9 } },
    { b: 'hall', x: 38, z: -12, p: { width: 13, depth: 9, lanterns: true, terrace: 2 } },
    { b: 'hall', x: -52, z: 2, rot: 3, p: { width: 11, depth: 7, terrace: 2, lanterns: true } },
    ...grid(steps(24, 52, 10), steps(4, 22, 9), (x, z) => x > 30 && x < 46 && z < 6),
  ],
  trees: [
    { type: 'willow', variant: 2, pts: [[-27, -29], [-29, -16]], n: 3 },
    { type: 'peach', pts: [[-28, -26], [-29, -18]], n: 2 },
    { type: 'willow', variant: 2, pts: [[-29.4, -7], [-30, 7]], n: 4 },
    { type: 'peach', pts: [[-29.6, -4], [-30, 4]], n: 2 },
    { type: 'willow', variant: 2, pts: [[-29.8, 17], [-27, 29]], n: 3 },
    { type: 'willow', variant: 2, pts: [[-11, -29], [-6, -27]], n: 2 },
    { type: 'willow', variant: 2, pts: [[2, -25], [9, -22]], n: 2 },
    { type: 'willow', variant: 1, pts: [[14, -24], [15, 24]], n: 6 },
    { type: 'bamboo', pts: [[-60, -6], [-60, 10]], n: 3 },
  ],
  biomeOverride: { biome: BiomeId.Garden, radius: 52 },
  vegetationProfile: { weights: { willow: 2.5, peach: 2, bamboo: 1.5, broadleaf: 1.5, pine: 2 }, density: 1.1, gardenScale: true },
  cameraPreset: { yaw: 0.55, pitch: 0.62, distance: 125 },
}

/** 庐山：群峰、香炉峰瀑布与潭；山巅亭、山脚东林寺与塔、白居易草堂 */
const LUSHAN: LandmarkDefinition = {
  id: 'lushan',
  name: '庐山',
  coordinate: { lng: 116.0, lat: 29.57 },
  // 手工山形北缘不能压到长江：整体往西南挪，东麓瀑布不落进鄱阳湖
  offset: [-16, 16],
  radius: 62,
  major: true,
  poetryPlaceId: 'lushan',
  terrainModifier: [
    { t: 'flatten', x: 30, z: 34, r: 16, blend: 10 },
    { t: 'hill', x: 8, z: -20, r: 32, h: 44 },
    { t: 'hill', x: -28, z: -8, r: 24, h: 30 },
    { t: 'hill', x: 2, z: 28, r: 22, h: 16 },
    { t: 'hill', x: -30, z: 32, r: 15, h: 11 },
    { t: 'hill', x: 14, z: -6, r: 12, h: 26, sharp: 1 },
    { t: 'lake', x: 14, z: 9, rx: 6, rz: 5, depth: 2 },
  ],
  structures: [
    { b: 'pavilion', x: 6, z: -22, p: { width: 5 } },
    { b: 'pavilion', x: -28, z: -10, p: { width: 5 } },
    { b: 'hall', x: 30, z: 32, p: { width: 13, depth: 9, terrace: 2, lanterns: true } },
    { b: 'pagoda', x: 44, z: 22, p: { levels: 5, width: 7 } },
    { b: 'hut', x: -12, z: 42, p: { width: 5, depth: 5 } },
  ],
  waterfall: { x: 14, z: 0, top: 0, width: 3, dir: 's' },
  trees: [{ type: 'bamboo', pts: [[-20, 44], [-18, 36]], n: 2 }],
  vegetationProfile: { weights: { pine: 6, broadleaf: 1.5, bamboo: 0.6 }, density: 1.3 },
  cameraPreset: { yaw: 0.35, pitch: 0.34, distance: 130 },
}

/** 长安：紧凑的城郭——北有宫城，十字大街交于钟楼，东市西市列肆设摊；东门外大雁塔。城南即终南山，不越界 */
const CHANGAN: LandmarkDefinition = {
  id: 'changan',
  name: '长安',
  coordinate: { lng: 108.95, lat: 34.27 },
  radius: 40,
  major: true,
  poetryPlaceId: 'changan',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 32, rz: 22, square: true, blend: 6 },
    { t: 'flatten', x: 38, z: 8, r: 8, blend: 6 },
    { t: 'pave', x0: -2, z0: -17, x1: 2, z1: 22 },
    { t: 'pave', x0: -30, z0: -2, x1: 36, z1: 2 },
    { t: 'pave', x0: -26, z0: 9, x1: -10, z1: 11 },
    { t: 'pave', x0: 10, z0: 9, x1: 26, z1: 11 },
    { t: 'flatten', x: 0, z: -11, r: 7, square: true, pave: true, blend: 0 },
  ],
  walls: [{ x: 0, z: 0, hw: 28, hd: 18, height: 8, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    /* 宫城 */
    { b: 'hall', x: 0, z: -11, p: { width: 13, depth: 7, height: 6, double: true, tile: 'yellow', lanterns: true, terrace: 2 } },
    { b: 'hall', x: -12, z: -11, rot: 3, p: { width: 7, depth: 5, tile: 'yellow', terrace: 1 } },
    { b: 'hall', x: 12, z: -11, rot: 1, p: { width: 7, depth: 5, tile: 'yellow', terrace: 1 } },
    { b: 'courtyard', x: -21, z: -10, p: { width: 11, seed: 3 } },
    { b: 'courtyard', x: 21, z: -10, p: { width: 11, seed: 5 } },
    /* 钟楼：十字街心 */
    { b: 'bellTower', x: 0, z: 0, p: { width: 9 } },
    /* 西市 */
    { b: 'shop', x: -22, z: 5, p: { seed: 11 } },
    { b: 'shop', x: -13, z: 5, p: { seed: 12 } },
    { b: 'loft', x: -22, z: 15, rot: 2, p: { width: 7, depth: 5, seed: 13 } },
    { b: 'shop', x: -13, z: 15, rot: 2, p: { seed: 14 } },
    ...[-24, -20, -16, -12].map((x, i) => ({ b: 'stall' as const, x, z: 10, p: { seed: 20 + i } })),
    /* 东市 */
    { b: 'loft', x: 13, z: 5, p: { width: 7, depth: 5, seed: 31 } },
    { b: 'shop', x: 22, z: 5, p: { seed: 32 } },
    { b: 'shop', x: 13, z: 15, rot: 2, p: { seed: 33 } },
    { b: 'shop', x: 22, z: 15, rot: 2, p: { seed: 34 } },
    ...[12, 16, 20, 24].map((x, i) => ({ b: 'stall' as const, x, z: 10, p: { seed: 40 + i } })),
    /* 朱雀大街灯、城外坊门 */
    ...[6, 12].flatMap((z) => [{ b: 'lamp' as const, x: -4, z, rot: 2 }, { b: 'lamp' as const, x: 4, z }]),
    { b: 'archway', x: 33, z: 0, rot: 1, p: { tile: 'gray' } },
    /* 东门外：大慈恩寺大雁塔 */
    { b: 'brickPagoda', x: 39, z: 9, p: { levels: 7, width: 9 } },
  ],
  trees: [
    { type: 'broadleaf', variant: 4, pts: [[33, 14], [44, 16]], n: 3 },
  ],
  vegetationProfile: { weights: { broadleaf: 3, willow: 2, peach: 0.5 }, density: 0.6 },
  cameraPreset: { yaw: -0.75, pitch: 0.6, distance: 100 },
}

export const LANDMARK_CATALOG: readonly LandmarkDefinition[] = [HANGZHOU, LUSHAN, CHANGAN]
