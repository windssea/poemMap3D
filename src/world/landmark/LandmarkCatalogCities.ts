import type { LandmarkDefinition, StructureSpec } from './LandmarkDefinition'

/*
 * 名楼与名城的手工营造（局部坐标：方块，x 向东、z 向南；rot 为俯视顺时针 90° 次数，0 = 正面朝南，1 朝西，2 朝北，3 朝东）。
 * 名楼一律立在高台上、临江湖；名城按史料的格局布置：宫城、街市、河渠、寺塔、园林。
 */

const lamps = (xs: readonly number[], zs: readonly number[]): StructureSpec[] => xs.flatMap((x) => zs.map((z) => ({ b: 'lamp' as const, x, z, rot: x < 0 ? 2 : 0 })))

/* ================= 名楼 ================= */

/** 黄鹤楼：武昌蛇山西头，十字抱厦、十字脊，黄琉璃；山脚牌坊、胜像宝塔，山上白云亭 */
const HUANGHELOU: LandmarkDefinition = {
  id: 'huanghelou',
  name: '黄鹤楼',
  coordinate: { lng: 114.302, lat: 30.545 },
  radius: 38,
  major: true,
  poetryPlaceId: 'huanghelou',
  terrainModifier: [
    { t: 'hill', x: 12, z: 2, r: 26, h: 13 },
    { t: 'hill', x: -6, z: 0, r: 17, h: 11 },
    { t: 'flatten', x: -6, z: 0, r: 13, dy: 11, blend: 6 },
    { t: 'flatten', x: 18, z: 2, r: 5, dy: 13, blend: 4 },
  ],
  structures: [
    { b: 'grandTower', x: -6, z: 0, atLevel: true, dy: 11, p: { levels: 3, width: 11, tile: 'yellow', plan: 'cross', top: 'cross', terrace: 2 } },
    { b: 'pavilion', x: 18, z: 2, atLevel: true, dy: 13, p: { width: 5, double: true, tile: 'green' } },
    { b: 'archway', x: -6, z: 24, p: { tile: 'yellow' } },
    { b: 'stupa', x: -26, z: 10 },
  ],
  trees: [
    { type: 'pine', variant: 2, pts: [[2, -14], [28, -10]], n: 5 },
    { type: 'pine', variant: 0, pts: [[6, 14], [30, 12]], n: 4 },
    { type: 'willow', variant: 0, pts: [[-28, -8], [-28, 16]], n: 3 },
  ],
  vegetationProfile: { weights: { pine: 4, broadleaf: 2 }, density: 1 },
}

/** 岳阳楼：巴陵城西门城台上，三层盔顶（以庑殿写意）、黄琉璃，面西临洞庭；左右三醉亭、仙梅亭 */
const YUEYANGLOU: LandmarkDefinition = {
  id: 'yueyanglou',
  name: '岳阳楼',
  coordinate: { lng: 113.09, lat: 29.38 },
  radius: 32,
  major: true,
  poetryPlaceId: 'p041',
  terrainModifier: [{ t: 'flatten', x: 4, z: 0, r: 20, blend: 6 }],
  structures: [
    { b: 'grandTower', x: 0, z: 0, rot: 1, p: { levels: 3, width: 9, tile: 'yellow', top: 'wudian', base: 'wall', terrace: 4 } },
    { b: 'pavilion', x: 6, z: -15, p: { width: 5, tile: 'green', lanterns: true } },
    { b: 'pavilion', x: 6, z: 15, p: { width: 5, tile: 'green', double: true } },
    { b: 'house', x: 17, z: -7, rot: 3, p: { seed: 11, lanterns: true } },
    { b: 'house', x: 17, z: 7, rot: 3, p: { seed: 12, lanterns: true } },
    { b: 'shop', x: 24, z: 0, rot: 3, p: { seed: 13 } },
  ],
  trees: [{ type: 'willow', variant: 0, pts: [[-14, -20], [-14, 20]], n: 4 }],
}

/** 滕王阁：赣江东岸高台，三层歇山绿琉璃，面西；南北挟屋两殿，东有牌坊 */
const TENGWANGGE: LandmarkDefinition = {
  id: 'tengwangge',
  name: '滕王阁',
  coordinate: { lng: 115.88, lat: 28.68 },
  radius: 34,
  major: true,
  poetryPlaceId: 'p077',
  terrainModifier: [{ t: 'flatten', x: 6, z: 0, r: 26, blend: 6 }],
  structures: [
    { b: 'grandTower', x: 0, z: 0, rot: 1, p: { levels: 3, width: 11, tile: 'green', top: 'xieshan', terrace: 5 } },
    { b: 'hall', x: 7, z: -18, rot: 1, p: { width: 9, depth: 7, tile: 'green', terrace: 3, lanterns: true } },
    { b: 'hall', x: 7, z: 18, rot: 1, p: { width: 9, depth: 7, tile: 'green', terrace: 3, lanterns: true } },
    { b: 'archway', x: 18, z: 0, rot: 1, p: { tile: 'green' } },
    { b: 'pavilion', x: -14, z: -22, p: { width: 5 } },
  ],
  trees: [{ type: 'willow', variant: 0, pts: [[-18, -26], [-18, 26]], n: 5 }],
}

/** 鹳雀楼：蒲州城西、黄河东岸，三层歇山灰瓦，面西；楼东是蒲州人家 */
const GUANQUELOU: LandmarkDefinition = {
  id: 'guanquelou',
  name: '鹳雀楼',
  coordinate: { lng: 110.29, lat: 34.87 },
  radius: 32,
  major: true,
  poetryPlaceId: 'p027',
  terrainModifier: [{ t: 'flatten', x: 6, z: 0, r: 22, blend: 6 }],
  structures: [
    { b: 'grandTower', x: 0, z: 0, rot: 1, p: { levels: 3, width: 11, tile: 'gray', top: 'xieshan', terrace: 4 } },
    { b: 'house', x: 17, z: -8, rot: 3, p: { seed: 21 } },
    { b: 'house', x: 17, z: 8, rot: 3, p: { seed: 22, lanterns: true } },
    { b: 'courtyard', x: 28, z: 0, rot: 3, p: { width: 11, seed: 23 } },
  ],
  trees: [{ type: 'willow', variant: 0, pts: [[-16, -20], [-16, 20]], n: 4 }],
}

/** 多景楼：镇江北固山巅，甘露寺中，二层歇山，面北俯瞰大江；寺后铁塔 */
const DUOJINGLOU: LandmarkDefinition = {
  id: 'duojinglou',
  name: '多景楼',
  // 北固山在大江南岸（图上江面宽，坐标落到南岸山脚）
  coordinate: { lng: 119.46, lat: 32.14 },
  radius: 32,
  major: true,
  poetryPlaceId: 'p030',
  terrainModifier: [
    { t: 'hill', x: 0, z: 4, r: 22, h: 16 },
    { t: 'flatten', x: 0, z: 2, r: 15, dy: 14, blend: 5 },
  ],
  structures: [
    { b: 'grandTower', x: 0, z: -4, rot: 2, atLevel: true, dy: 14, p: { levels: 2, width: 9, tile: 'gray', terrace: 2 } },
    { b: 'hall', x: -2, z: 12, atLevel: true, dy: 14, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'pagoda', x: 11, z: 10, atLevel: true, dy: 14, p: { levels: 5, width: 5 } },
  ],
  trees: [
    { type: 'pine', variant: 2, pts: [[-22, -12], [-22, 16]], n: 4 },
    { type: 'pine', variant: 0, pts: [[22, -12], [22, 18]], n: 4 },
  ],
  vegetationProfile: { weights: { pine: 5, broadleaf: 2, bamboo: 1 }, density: 1.2 },
}

/* ================= 名城 ================= */

/** 金陵：秦淮河穿城，文德桥与夫子庙，河北岸酒楼、南岸铺面；城北衙署、乌衣巷；城西北凤凰台；城外东北钟山、城南大报恩寺琉璃塔 */
const JINLING: LandmarkDefinition = {
  id: 'jinling',
  name: '金陵',
  coordinate: { lng: 118.78, lat: 32.04 },
  radius: 58,
  major: true,
  poetryPlaceId: 'jinling',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 2, r: 32, rz: 24, square: true, blend: 6 },
    { t: 'canal', pts: [[-42, 10], [-12, 12], [10, 9], [42, 11]], w: 2.5 },
    { t: 'pave', x0: -2, z0: -19, x1: 2, z1: 42 },
    { t: 'hill', x: 44, z: -30, r: 22, h: 30 },
    { t: 'flatten', x: 0, z: 37, r: 10, blend: 5 },
  ],
  walls: [{ x: 0, z: 0, hw: 28, hd: 20, height: 8, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    { b: 'hall', x: 0, z: -12, p: { width: 13, depth: 7, tile: 'gray', double: true, lanterns: true, terrace: 2 } },
    { b: 'courtyard', x: -19, z: -11, p: { width: 11, seed: 31 } },
    { b: 'courtyard', x: 19, z: -11, p: { width: 11, seed: 32 } },
    { b: 'hall', x: -14, z: 2, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'bridge', x: 0, z: 11, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'archway', x: 0, z: 16, p: { tile: 'gray' } },
    { b: 'loft', x: 10, z: 4, p: { width: 7, depth: 5, seed: 33, lanterns: true } },
    { b: 'loft', x: 19, z: 4, p: { width: 7, depth: 5, seed: 34, lanterns: true } },
    ...[-20, -11, 11, 20].map((x, i) => ({ b: 'shop' as const, x, z: 17, rot: 2, p: { seed: 40 + i } })),
    { b: 'terrace', x: -23, z: 3, p: { width: 7, depth: 7, height: 2 } },
    { b: 'pavilion', x: -23, z: 2, dy: 2, p: { width: 5, double: true, tile: 'gray' } },
    ...lamps([-4, 4], [-6, 26, 32]),
    { b: 'pagoda', x: 0, z: 40, p: { levels: 9, width: 7, tile: 'green' } },
    { b: 'hall', x: -12, z: 37, p: { width: 9, depth: 5, tile: 'yellow', terrace: 1 } },
    { b: 'pavilion', x: 44, z: -30, p: { width: 5 } },
  ],
  trees: [
    { type: 'willow', variant: 0, pts: [[-38, 7], [-26, 7]], n: 3 },
    { type: 'willow', variant: 0, pts: [[26, 15], [38, 15]], n: 3 },
    { type: 'pine', variant: 2, pts: [[32, -40], [56, -22]], n: 6 },
    { type: 'peach', pts: [[-27, -2], [-19, -2]], n: 2 },
  ],
  vegetationProfile: { weights: { broadleaf: 3, willow: 2, pine: 2, peach: 0.5 }, density: 0.8 },
}

/** 洛阳：洛水穿城而过（城墙留水门），天津桥自动跨河；城北宫城明堂（三层攒尖）与紫微殿；河南南市；城外东北白马寺齐云塔；满城牡丹（以花树写意） */
const LUOYANG: LandmarkDefinition = {
  id: 'luoyang',
  name: '洛阳',
  coordinate: { lng: 112.45, lat: 34.69 },
  radius: 58,
  major: true,
  poetryPlaceId: 'luoyang',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 34, rz: 26, square: true, blend: 6 },
    { t: 'pave', x0: -2, z0: -21, x1: 2, z1: 30 },
    { t: 'flatten', x: 40, z: -36, r: 14, blend: 5 },
  ],
  walls: [{ x: 0, z: 0, hw: 30, hd: 22, height: 8, gates: ['n', 's', 'e', 'w'] }],
  allowRivers: ['luo'],
  structures: [
    { b: 'grandTower', x: -12, z: -10, p: { levels: 3, width: 11, tile: 'yellow', top: 'cuanjian', terrace: 3 } },
    { b: 'hall', x: 15, z: -13, p: { width: 11, depth: 7, tile: 'yellow', double: true, terrace: 2, lanterns: true } },
    { b: 'bridge', x: 0, z: 8, rot: 1, atLevel: true, span: true, p: { length: 11 } },
    { b: 'loft', x: -12, z: 18, rot: 2, p: { width: 7, depth: 5, seed: 51, lanterns: true } },
    { b: 'loft', x: -21, z: 18, rot: 2, p: { width: 7, depth: 5, seed: 52 } },
    { b: 'shop', x: 11, z: 18, rot: 2, p: { seed: 53 } },
    { b: 'shop', x: 20, z: 18, rot: 2, p: { seed: 54 } },
    ...[8, 12, 16, 20, 24].map((x, i) => ({ b: 'stall' as const, x, z: 14, p: { seed: 60 + i } })),
    ...lamps([-4, 4], [-4, 2, 26]),
    { b: 'brickPagoda', x: 40, z: -42, p: { levels: 9, width: 7 } },
    { b: 'hall', x: 40, z: -28, p: { width: 9, depth: 5, tile: 'gray', terrace: 1 } },
  ],
  trees: [
    { type: 'peach', pts: [[6, 3], [26, 3]], n: 5 },
    { type: 'peach', pts: [[-26, 3], [-8, 3]], n: 4 },
    { type: 'willow', variant: 0, pts: [[-42, 7], [-32, 7]], n: 2 },
    { type: 'pine', variant: 0, pts: [[30, -44], [30, -26]], n: 3 },
  ],
  vegetationProfile: { weights: { broadleaf: 3, willow: 2, peach: 1.5 }, density: 0.8 },
}

/** 成都：城中蜀王府与散花楼，街市；城南锦江、万里桥；城西浣花溪畔杜甫草堂（茅屋、竹林）；西南武侯祠（柏森森） */
const CHENGDU: LandmarkDefinition = {
  id: 'chengdu',
  name: '成都',
  coordinate: { lng: 104.06, lat: 30.66 },
  radius: 54,
  major: true,
  poetryPlaceId: 'chengdu',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 28, rz: 22, square: true, blend: 6 },
    { t: 'canal', pts: [[-48, 26], [-10, 27], [20, 25], [48, 27]], w: 3 },
    { t: 'pave', x0: -2, z0: -17, x1: 2, z1: 32 },
    { t: 'flatten', x: -40, z: -6, r: 11, blend: 5 },
    { t: 'flatten', x: -20, z: 38, r: 9, blend: 5 },
  ],
  walls: [{ x: 0, z: 0, hw: 24, hd: 18, height: 7, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    { b: 'hall', x: -9, z: -9, p: { width: 11, depth: 7, tile: 'green', terrace: 2, lanterns: true } },
    { b: 'grandTower', x: 12, z: -8, p: { levels: 2, width: 7, tile: 'green', terrace: 2 } },
    { b: 'courtyard', x: -14, z: 9, p: { width: 11, seed: 71 } },
    { b: 'shop', x: 9, z: 6, p: { seed: 72 } },
    { b: 'shop', x: 17, z: 6, p: { seed: 73 } },
    ...[8, 12, 16].map((x, i) => ({ b: 'stall' as const, x, z: 12, p: { seed: 74 + i } })),
    ...lamps([-4, 4], [-4, 4, 22]),
    { b: 'bridge', x: 0, z: 26, rot: 1, atLevel: true, p: { length: 9 } },
    { b: 'hut', x: -42, z: -9, p: { width: 7, depth: 5 } },
    { b: 'hut', x: -34, z: -2, rot: 3 },
    { b: 'pavilion', x: -45, z: 1, p: { width: 5, tile: 'thatch' } },
    { b: 'hall', x: -20, z: 38, p: { width: 9, depth: 5, tile: 'gray', terrace: 1 } },
  ],
  trees: [
    { type: 'bamboo', pts: [[-50, -16], [-32, -16]], n: 4 },
    { type: 'bamboo', pts: [[-50, 8], [-34, 8]], n: 3 },
    { type: 'pine', variant: 1, pts: [[-28, 31], [-12, 31]], n: 3 },
    { type: 'pine', variant: 1, pts: [[-28, 45], [-12, 45]], n: 3 },
    { type: 'willow', variant: 0, pts: [[-42, 23], [-8, 23]], n: 4 },
    { type: 'willow', variant: 0, pts: [[8, 22], [42, 22]], n: 4 },
  ],
  vegetationProfile: { weights: { bamboo: 2, broadleaf: 3, pine: 1 }, density: 0.9 },
}

/** 苏州：水城——两横两纵河道，枕河人家，石拱桥；城北北寺塔；西北园林（池、水榭、游廊、假山、重檐亭） */
const houseRow = (xs: readonly number[], z: number, rot: number, seed: number): StructureSpec[] => xs.map((x, i) => ({ b: 'house' as const, x, z, rot, p: { seed: seed + i, lanterns: i % 2 === 0 } }))
const SUZHOU: LandmarkDefinition = {
  id: 'suzhou',
  name: '苏州',
  coordinate: { lng: 120.62, lat: 31.31 },
  radius: 54,
  major: true,
  poetryPlaceId: 'suzhou',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 40, blend: 6 },
    { t: 'canal', pts: [[-48, -8], [48, -8]], w: 2 },
    { t: 'canal', pts: [[-48, 14], [48, 14]], w: 2 },
    { t: 'canal', pts: [[-6, -44], [-6, 44]], w: 2 },
    { t: 'canal', pts: [[22, -44], [22, 44]], w: 2 },
    { t: 'lake', x: -28, z: -26, rx: 8, rz: 6, depth: 2 },
  ],
  structures: [
    ...houseRow([-38, -30, -20, 4, 12, 30, 38], -13, 0, 80),
    ...houseRow([-38, -30, -20, 4, 12, 30, 38], -3, 2, 90),
    ...houseRow([-38, -30, -20, 4, 12, 30, 38], 9, 0, 100),
    ...houseRow([-38, -30, -20, 4, 12, 30, 38], 19, 2, 110),
    { b: 'bridge', x: 9, z: -8, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'bridge', x: -26, z: 14, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'bridge', x: 34, z: 14, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'bridge', x: -6, z: 3, rot: 0, atLevel: true, p: { length: 7 } },
    { b: 'bridge', x: 22, z: -22, rot: 0, atLevel: true, p: { length: 7 } },
    { b: 'pagoda', x: 32, z: -28, p: { levels: 9, width: 7, tile: 'gray' } },
    { b: 'waterPavilion', x: -28, z: -18, rot: 2, atLevel: true, overWater: true, p: { width: 7, depth: 5 } },
    { b: 'corridor', x: -28, z: -36, p: { length: 13 } },
    { b: 'pavilion', x: -40, z: -30, p: { width: 5, double: true } },
    { b: 'rockery', x: -39, z: -21, p: { seed: 3 } },
    { b: 'rockery', x: -17, z: -30, p: { seed: 5 } },
    ...lamps([-2], [-12, 22, 30]),
  ],
  trees: [
    { type: 'willow', variant: 2, pts: [[-36, -22], [-20, -22]], n: 3 },
    { type: 'peach', pts: [[-22, -34], [-14, -24]], n: 2 },
    { type: 'bamboo', pts: [[-44, -38], [-44, -24]], n: 2 },
    { type: 'willow', variant: 0, pts: [[-46, 11], [-34, 11]], n: 2 },
    { type: 'willow', variant: 0, pts: [[26, -5], [44, -5]], n: 2 },
  ],
  vegetationProfile: { weights: { willow: 3, broadleaf: 2, peach: 1, bamboo: 1 }, density: 0.7 },
}

export const CITY_CATALOG: readonly LandmarkDefinition[] = [HUANGHELOU, YUEYANGLOU, TENGWANGGE, GUANQUELOU, DUOJINGLOU, JINLING, LUOYANG, CHENGDU, SUZHOU]
