import { BiomeId } from '../biome/BiomeId'
import type { LandmarkDefinition, StructureSpec } from './LandmarkDefinition'
import { CITY_CATALOG } from './LandmarkCatalogCities'

/*
 * 手工营造的样板地标。每一处都有不同的地形、建筑、植被、水面与取景。
 * 局部坐标：方块，x 向东、z 向南；rot 为俯视顺时针 90° 次数（0 = 正面朝南，1 朝西，3 朝东）。
 */

const grid = (xs: number[], zs: number[], skip: (x: number, z: number) => boolean = () => false, rot = 0): StructureSpec[] => {
  const out: StructureSpec[] = []
  for (const x of xs) for (const z of zs) if (!skip(x, z)) out.push({ b: 'house', x, z, rot, p: { width: 7, depth: 5, seed: x * 31 + z } })
  return out
}

/**
 * 杭州：西湖居中；苏堤、白堤、三潭小岛；西、南群山环抱，南屏雷峰、北山保俶。
 * 湖东城在江南运河东岸、钱塘江北岸（此前钱塘江尾被接回上游运河，江面绕出回环，城的方铺地被切成一块孤零零的三角）；
 * 正街东西向，一座石桥跨运河通湖岸。
 */
const HANGZHOU: LandmarkDefinition = {
  id: 'hangzhou',
  name: '杭州',
  coordinate: { lng: 120.15, lat: 30.25 },
  radius: 66,
  major: true,
  poetryPlaceId: 'hangzhou',
  waterfront: true,
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 58, blend: 12, soft: true },
    { t: 'hill', x: -54, z: -8, r: 22, h: 17 },
    { t: 'hill', x: -46, z: 24, r: 17, h: 12 },
    { t: 'hill', x: -26, z: 44, r: 16, h: 10 },
    { t: 'hill', x: -16, z: -44, r: 14, h: 9 },
    { t: 'lake', x: -14, z: 0, rx: 24, rz: 31, depth: 3 },
    { t: 'causeway', pts: [[-27, -30], [-29, -15]], w: 1.6 },
    { t: 'causeway', pts: [[-29.4, -9], [-30, 9]], w: 1.6 },
    { t: 'causeway', pts: [[-29.8, 15], [-27, 30]], w: 1.6 },
    { t: 'causeway', pts: [[-12, -30], [-5, -27]], w: 1.6 },
    // 白堤东段只到运河入湖口西侧为止（原先伸到 x 10，正好把河口堵死）
    { t: 'causeway', pts: [[1, -25], [6, -23.5]], w: 1.6 },
    { t: 'island', x: -8, z: 8, r: 4.5 },
    { t: 'flatten', x: 38, z: -22, r: 18, rz: 9, square: true, blend: 6 },
    { t: 'pave', x0: 20, z0: -23, x1: 56, z1: -21 },
  ],
  structures: [
    { b: 'pagoda', x: -26, z: 45, p: { levels: 5, width: 9, style: 'leifeng' } },
    { b: 'pagoda', x: -16, z: -44, p: { levels: 7, style: 'spire' } },
    { b: 'pavilion', x: -8, z: 8, p: { width: 5, lanterns: true } },
    { b: 'pavilion', x: 18, z: -27, p: { width: 5 } },
    { b: 'bridge', x: -29, z: -12, rot: 1, atLevel: true, p: { length: 9 } },
    { b: 'bridge', x: -30, z: 12, rot: 1, atLevel: true, p: { length: 9 } },
    { b: 'bridge', x: -2, z: -26, rot: 0, atLevel: true, p: { length: 9 } },
    { b: 'hall', x: 38, z: -32, p: { width: 13, depth: 9, lanterns: true, terrace: 2 } },
    { b: 'bridge', x: 14, z: -34, atLevel: true, span: true, p: { length: 9 } },
    { b: 'hall', x: -52, z: 2, rot: 3, p: { width: 11, depth: 7, terrace: 2, lanterns: true } },
    ...grid([24, 52], [-29], () => false),
    ...grid([24, 31, 45, 52], [-15], () => false, 2),
  ],
  trees: [
    { type: 'willow', variant: 2, pts: [[-27, -29], [-29, -16]], n: 3 },
    { type: 'peach', pts: [[-28, -26], [-29, -18]], n: 2 },
    { type: 'willow', variant: 2, pts: [[-29.4, -7], [-30, 7]], n: 4 },
    { type: 'peach', pts: [[-29.6, -4], [-30, 4]], n: 2 },
    { type: 'willow', variant: 2, pts: [[-29.8, 17], [-27, 29]], n: 3 },
    { type: 'willow', variant: 2, pts: [[-11, -29], [-6, -27]], n: 2 },
    { type: 'willow', variant: 2, pts: [[2, -25], [5, -24]], n: 2 },
    // 湖东岸柳：避开北边运河入湖口与中段钱塘江出湖口
    { type: 'willow', variant: 1, pts: [[14, 10], [15, 24]], n: 3 },
    { type: 'bamboo', pts: [[-60, -6], [-60, 10]], n: 3 },
  ],
  biomeOverride: { biome: BiomeId.Garden, radius: 52 },
  vegetationProfile: { weights: { willow: 2.5, peach: 2, bamboo: 1.5, broadleaf: 1.5, pine: 2 }, density: 1.1, gardenScale: true },
  cameraPreset: { yaw: 0.55, pitch: 0.62, distance: 125 },
  // 子场景：苏堤上南望雷峰（与北山保俶一胖一瘦）、湖心望湖东城、三潭小岛的湖心亭
  shots: [
    { id: 'hero', name: '全湖', yaw: 0.55, pitch: 0.62, distance: 125 },
    { id: 'causeway', name: '堤上望塔', yaw: 3.12, pitch: 0.07, distance: 88, offset: [-26, 18, 42] },
    { id: 'city', name: '湖面望城', yaw: -1.32, pitch: 0.1, distance: 56, offset: [30, 6, -22] },
    { id: 'island', name: '岛亭', yaw: 0.6, pitch: 0.3, distance: 26, offset: [-8, 3, 8] },
  ],
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
  waterfront: true,
  terrainModifier: [
    // 东林寺在庐山西北麓（原放在东南山脚，已落进湖里、整座寺没建出来）
    { t: 'flatten', x: -42, z: 10, r: 12, blend: 8 },
    // 主峰：一条东西走向的不对称山脊——南面（瀑布、寺、草堂一侧）是陡崖，北坡缓而有冲沟；
    // 西段一道较低的支脊。不再是几座圆丘叠出的馒头山
    { t: 'ridge', pts: [[-22, -30], [-4, -24], [10, -22], [30, -30]], h: 46, w: 30, cliff: 9, cliffSide: 1 },
    { t: 'ridge', pts: [[-44, -2], [-30, -10], [-18, -20]], h: 28, w: 18, cliff: 6, cliffSide: 1 },
    { t: 'hill', x: 2, z: 28, r: 22, h: 16 },
    { t: 'hill', x: -30, z: 32, r: 15, h: 11 },
    { t: 'hill', x: 14, z: -6, r: 12, h: 26, sharp: 1 },
    { t: 'lake', x: 14, z: 8, rx: 8, rz: 6, depth: 3, rim: true },
  ],
  structures: [
    { b: 'pavilion', x: 6, z: -22, p: { width: 5 } },
    { b: 'pavilion', x: -28, z: -10, p: { width: 5 } },
    { b: 'hall', x: -44, z: 6, p: { width: 13, depth: 9, terrace: 2, lanterns: true } },
    { b: 'pagoda', x: -33, z: 14, p: { levels: 5, width: 7 } },
    { b: 'hut', x: -12, z: 42, p: { width: 5, depth: 5 } },
  ],
  // 三叠泉：落差 34 格、宽 5 格，从自砌的陡崖上分三叠落进潭里
  waterfall: { x: 14, z: -1, top: 34, width: 5, dir: 's' },
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
    // 城南切进终南山北麓：过渡带整个削成缓坡，城外南边是一道渐起的坡原，不是切出来的崖
    { t: 'flatten', x: 0, z: 0, r: 32, rz: 22, square: true, blend: 6, shave: true },
    { t: 'flatten', x: 38, z: 8, r: 8, blend: 6 },
    { t: 'pave', x0: -2, z0: -17, x1: 2, z1: 22 },
    { t: 'pave', x0: -30, z0: -1, x1: 36, z1: 3 },
    { t: 'pave', x0: -26, z0: 9, x1: -10, z1: 11 },
    { t: 'pave', x0: 10, z0: 9, x1: 26, z1: 11 },
    { t: 'flatten', x: 0, z: -11, r: 7, square: true, pave: true, blend: 0 },
  ],
  walls: [{ x: 0, z: 0, hw: 28, hd: 18, height: 8, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    /* 宫城 */
    { b: 'hall', x: 0, z: -13, p: { width: 13, depth: 7, height: 6, double: true, tile: 'yellow', lanterns: true, terrace: 2 } },
    { b: 'hall', x: -12, z: -11, rot: 3, p: { width: 7, depth: 5, tile: 'yellow', terrace: 1 } },
    { b: 'hall', x: 12, z: -11, rot: 1, p: { width: 7, depth: 5, tile: 'yellow', terrace: 1 } },
    { b: 'courtyard', x: -21, z: -10, p: { width: 11, seed: 3 } },
    { b: 'courtyard', x: 21, z: -10, p: { width: 11, seed: 5 } },
    /* 皇城正门朱雀门：朱雀大街由此南下直抵城南正门（唐长安街心并无钟楼，钟楼是明代西安城的） */
    { b: 'gate', x: 0, z: -3, p: { width: 13, depth: 5, height: 6, tile: 'yellow', lanterns: true } },
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
  shots: [
    // 机位都在城北（渭河一侧）：城南紧贴终南山，从南面看全被山挡住
    { id: 'hero', name: '全城', yaw: 2.55, pitch: 0.55, distance: 115 },
    // 中轴：城北南望，北门、宫殿、朱雀门一线，终南山作背景
    { id: 'axis', name: '中轴', yaw: 3.14, pitch: 0.3, distance: 80, offset: [0, 6, 6] },
    { id: 'tower', name: '雁塔', yaw: 2.8, pitch: 0.32, distance: 64, offset: [39, 22, 9] },
  ],
}

export const LANDMARK_CATALOG: readonly LandmarkDefinition[] = [HANGZHOU, LUSHAN, CHANGAN, ...CITY_CATALOG]
