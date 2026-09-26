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
  // 山体整个落在南岸：北坡临江成崖，不把楼台的石基砌进江里
  offset: [-10, 20],
  radius: 32,
  major: true,
  poetryPlaceId: 'p030',
  terrainModifier: [
    { t: 'hill', x: 0, z: 2, r: 24, h: 16 },
    { t: 'flatten', x: 0, z: 2, r: 11, dy: 14, blend: 5 },
  ],
  structures: [
    { b: 'grandTower', x: 0, z: 0, rot: 2, atLevel: true, dy: 14, p: { levels: 2, width: 9, tile: 'gray', terrace: 2 } },
    { b: 'hall', x: -4, z: 20, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'pagoda', x: 14, z: 14, p: { levels: 5, width: 5 } },
  ],
  trees: [
    { type: 'pine', variant: 2, pts: [[-22, -12], [-22, 16]], n: 4 },
    { type: 'pine', variant: 0, pts: [[22, -12], [22, 18]], n: 4 },
  ],
  vegetationProfile: { weights: { pine: 5, broadleaf: 2, bamboo: 1 }, density: 1.2 },
}

/* ================= 名城 ================= */

/** 金陵：大江东南岸的大城。秦淮河穿城，文德桥与夫子庙，北岸酒楼、南岸铺面摊贩；城北宫城衙署、城中钟楼与乌衣巷；城西凤凰台；城南大报恩寺琉璃塔；钟山在城东北（地形自带） */
const JINLING: LandmarkDefinition = {
  id: 'jinling',
  name: '金陵',
  coordinate: { lng: 118.78, lat: 32.04 },
  // 城在大江东南岸（坐标正落在江面上）：挪到南岸平地，钟山在城东北；滁州留在江北西北方
  offset: [42, 40],
  radius: 66,
  major: true,
  poetryPlaceId: 'jinling',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 2, r: 38, rz: 29, square: true, blend: 6 },
    { t: 'canal', pts: [[-48, 12], [-14, 14], [12, 11], [48, 13]], w: 2.5 },
    { t: 'pave', x0: -2, z0: -24, x1: 2, z1: 46 },
    { t: 'pave', x0: -32, z0: -2, x1: 32, z1: 2 },
    { t: 'flatten', x: 0, z: 42, r: 10, blend: 5 },
  ],
  walls: [{ x: 0, z: 0, hw: 34, hd: 25, height: 9, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    /* 城北：宫城与衙署 */
    { b: 'hall', x: 0, z: -16, p: { width: 15, depth: 7, tile: 'gray', double: true, lanterns: true, terrace: 2 } },
    { b: 'hall', x: -14, z: -15, rot: 3, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'hall', x: 14, z: -15, rot: 1, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'courtyard', x: -25, z: -14, p: { width: 11, seed: 31 } },
    { b: 'courtyard', x: 25, z: -14, p: { width: 11, seed: 32 } },
    /* 城中：钟楼、乌衣巷的人家 */
    { b: 'bellTower', x: 0, z: 0, p: { width: 9 } },
    { b: 'courtyard', x: -24, z: 0, p: { width: 11, seed: 35 } },
    { b: 'house', x: -12, z: -4, p: { seed: 36, lanterns: true } },
    { b: 'house', x: 12, z: -4, p: { seed: 37, lanterns: true } },
    /* 秦淮河两岸：北岸酒楼，南岸铺面与摊，夫子庙与文德桥 */
    { b: 'bridge', x: 0, z: 13, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'loft', x: 11, z: 6, p: { width: 7, depth: 5, seed: 33, lanterns: true } },
    { b: 'loft', x: 20, z: 6, p: { width: 7, depth: 5, seed: 34, lanterns: true } },
    { b: 'loft', x: 29, z: 6, p: { width: 7, depth: 5, seed: 38, lanterns: true } },
    { b: 'hall', x: -16, z: 6, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    ...[-26, -17, 11, 20, 29].map((x, i) => ({ b: 'shop' as const, x, z: 20, rot: 2, p: { seed: 40 + i } })),
    ...[-6, 6].map((x, i) => ({ b: 'stall' as const, x, z: 18, p: { seed: 50 + i } })),
    { b: 'archway', x: 0, z: 19, p: { tile: 'gray' } },
    /* 城西凤凰台 */
    { b: 'terrace', x: -28, z: -2, p: { width: 7, depth: 7, height: 2 } },
    { b: 'pavilion', x: -28, z: -3, dy: 2, p: { width: 5, double: true, tile: 'gray' } },
    ...lamps([-4, 4], [-8, 30, 36]),
    /* 城南：大报恩寺与琉璃塔 */
    { b: 'pagoda', x: 0, z: 45, p: { levels: 9, width: 7, tile: 'green' } },
    { b: 'hall', x: -13, z: 42, p: { width: 9, depth: 5, tile: 'yellow', terrace: 1 } },
  ],
  trees: [
    { type: 'willow', variant: 0, pts: [[-44, 9], [-30, 9]], n: 3 },
    { type: 'willow', variant: 0, pts: [[34, 17], [44, 17]], n: 2 },
    { type: 'peach', pts: [[-32, -4], [-24, -4]], n: 2 },
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


/* ================= 第二批：黄州、扬州、汴京、山阴、密州 ================= */

/** 黄州：大江北岸的东坡赤壁（红崖临江，崖上二赋堂、睡仙亭），城东东坡雪堂与躬耕的东坡，江边临皋亭 */
const HUANGZHOU: LandmarkDefinition = {
  id: 'huangzhou',
  name: '黄州',
  coordinate: { lng: 114.87, lat: 30.46 },
  radius: 50,
  major: true,
  poetryPlaceId: 'huangzhou',
  terrainModifier: [
    { t: 'flatten', x: 0, z: -6, r: 20, rz: 14, square: true, blend: 6 },
    { t: 'hill', x: -26, z: 10, r: 16, h: 17, sharp: 1 },
    { t: 'flatten', x: -28, z: 6, r: 6, dy: 15, blend: 3 },
    { t: 'flatten', x: 30, z: -12, r: 12, blend: 6 },
  ],
  walls: [{ x: 0, z: -6, hw: 16, hd: 11, height: 6, gates: ['s', 'e'] }],
  structures: [
    { b: 'hall', x: 0, z: -11, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'house', x: -9, z: -2, p: { seed: 201, lanterns: true } },
    { b: 'house', x: 9, z: -2, p: { seed: 202 } },
    { b: 'shop', x: -9, z: -12, rot: 1, p: { seed: 203 } },
    { b: 'shop', x: 9, z: -12, rot: 3, p: { seed: 204 } },
    ...lamps([-3, 3], [-4, 2]),
    { b: 'hall', x: -28, z: 5, atLevel: true, dy: 15, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'pavilion', x: -20, z: 13, p: { width: 5, double: true } },
    { b: 'hut', x: 30, z: -15, p: { width: 7, depth: 5 } },
    { b: 'hut', x: 38, z: -9, rot: 3 },
    { b: 'pavilion', x: 22, z: 10, p: { width: 5, tile: 'thatch' } },
  ],
  trees: [
    { type: 'bamboo', pts: [[24, -22], [40, -22]], n: 3 },
    { type: 'peach', pts: [[26, -4], [36, -2]], n: 2 },
    { type: 'pine', variant: 2, pts: [[-34, 2], [-18, 18]], n: 3 },
  ],
  vegetationProfile: { weights: { broadleaf: 3, bamboo: 2, pine: 1 }, density: 0.8 },
}

/** 扬州：瘦西湖曲折如带，湖上石桥（桥自动跨水）、二十四桥、白塔、湖畔重檐亭；湖东城里楼阁酒肆；湖西北蜀冈上平山堂 */
const YANGZHOU: LandmarkDefinition = {
  id: 'yangzhou',
  name: '扬州',
  coordinate: { lng: 119.42, lat: 32.4 },
  radius: 54,
  major: true,
  poetryPlaceId: 'yangzhou',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 42, blend: 6 },
    { t: 'canal', pts: [[-40, -30], [-24, -18], [-14, -4], [-18, 10], [-8, 22], [6, 26], [14, 30]], w: 4 },
    { t: 'lake', x: -14, z: -2, rx: 9, rz: 6, depth: 2 },
    { t: 'hill', x: -40, z: -38, r: 14, h: 10 },
    { t: 'flatten', x: -40, z: -38, r: 6, dy: 9, blend: 3 },
    { t: 'pave', x0: 12, z0: -24, x1: 14, z1: 20 },
  ],
  structures: [
    { b: 'bridge', x: -14, z: 1, rot: 0, atLevel: true, span: true, p: { length: 9 } },
    { b: 'pavilion', x: -4, z: -8, p: { width: 5, double: true, tile: 'green' } },
    { b: 'bridge', x: -8, z: 22, rot: 1, atLevel: true, span: true, p: { length: 9 } },
    { b: 'stupa', x: -26, z: -2 },
    { b: 'waterPavilion', x: -24, z: -18, rot: 1, atLevel: true, overWater: true, p: { width: 7, depth: 5 } },
    { b: 'hall', x: -40, z: -38, atLevel: true, dy: 9, p: { width: 9, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'loft', x: 20, z: -16, rot: 3, p: { width: 7, depth: 5, seed: 301, lanterns: true } },
    { b: 'loft', x: 20, z: -6, rot: 3, p: { width: 7, depth: 5, seed: 302, lanterns: true } },
    { b: 'shop', x: 20, z: 4, rot: 3, p: { seed: 303 } },
    { b: 'shop', x: 6, z: -16, rot: 1, p: { seed: 304 } },
    { b: 'shop', x: 6, z: -6, rot: 1, p: { seed: 305 } },
    { b: 'courtyard', x: 30, z: 12, p: { width: 11, seed: 306 } },
    ...[16, 16, 16].map((x, i) => ({ b: 'stall' as const, x, z: 10 + i * 4, p: { seed: 310 + i } })),
    ...lamps([10, 16], [-20, -10, 0]),
  ],
  trees: [
    { type: 'willow', variant: 2, pts: [[-36, -26], [-22, -12]], n: 4 },
    { type: 'willow', variant: 0, pts: [[-10, 12], [2, 30]], n: 4 },
    { type: 'peach', pts: [[-4, -10], [-2, 4]], n: 2 },
    { type: 'bamboo', pts: [[-46, -30], [-34, -30]], n: 2 },
  ],
  vegetationProfile: { weights: { willow: 4, broadleaf: 2, peach: 1 }, density: 0.8 },
}

/** 汴京：宣德门与御街、州桥跨汴河、大相国寺、樊楼（三层酒楼）、开宝寺铁塔；街市摊铺 */
const BIANJING: LandmarkDefinition = {
  id: 'bianjing',
  name: '汴京',
  coordinate: { lng: 114.33, lat: 34.79 },
  radius: 56,
  major: true,
  poetryPlaceId: 'bianjing',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 34, rz: 26, square: true, blend: 6 },
    { t: 'canal', pts: [[-44, 6], [-10, 4], [10, 6], [44, 4]], w: 3 },
    { t: 'pave', x0: -3, z0: -22, x1: 3, z1: 26 },
    { t: 'flatten', x: 0, z: -14, r: 8, square: true, pave: true, blend: 0 },
  ],
  walls: [{ x: 0, z: 0, hw: 30, hd: 22, height: 8, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    { b: 'hall', x: 0, z: -15, p: { width: 15, depth: 7, height: 6, tile: 'yellow', double: true, terrace: 3, lanterns: true } },
    { b: 'bridge', x: 0, z: 5, rot: 1, atLevel: true, span: true, p: { length: 9 } },
    { b: 'grandTower', x: 16, z: -12, p: { levels: 3, width: 9, tile: 'green', terrace: 2 } },
    { b: 'hall', x: -16, z: -12, p: { width: 11, depth: 7, tile: 'yellow', terrace: 2, lanterns: true } },
    { b: 'pagoda', x: -24, z: -16, p: { levels: 7, width: 5, tile: 'gray' } },
    { b: 'loft', x: 12, z: 14, rot: 2, p: { width: 7, depth: 5, seed: 401, lanterns: true } },
    { b: 'loft', x: 21, z: 14, rot: 2, p: { width: 7, depth: 5, seed: 402, lanterns: true } },
    { b: 'shop', x: -12, z: 14, rot: 2, p: { seed: 403 } },
    { b: 'shop', x: -21, z: 14, rot: 2, p: { seed: 404 } },
    ...[-20, -15, -10, 10, 15, 20].map((x, i) => ({ b: 'stall' as const, x, z: 9, p: { seed: 410 + i } })),
    ...lamps([-5, 5], [-4, 12, 18, 30]),
    { b: 'archway', x: 0, z: 30, p: { tile: 'yellow' } },
    { b: 'brickPagoda', x: 40, z: -30, p: { levels: 9, width: 7 } },
  ],
  trees: [
    { type: 'willow', variant: 0, pts: [[-42, 1], [-14, 1]], n: 5 },
    { type: 'willow', variant: 0, pts: [[14, 1], [42, 1]], n: 5 },
  ],
  vegetationProfile: { weights: { broadleaf: 3, willow: 3 }, density: 0.6 },
}

/**
 * 山阴（绍兴）：钱塘江南岸、会稽山北麓的平原水乡，海拔不到十米——台面按实测定，城南山地自然高起。
 * 水巷一横一纵，枕河人家；城西北沈园（池、水榭、游廊、假山、重檐亭）；城南兰亭（曲水、鹅池、碑亭）。
 * 杭州在它西北约五十格，两处不再重叠。
 */
const SHANYIN: LandmarkDefinition = {
  id: 'shanyin',
  name: '山阴',
  coordinate: { lng: 120.58, lat: 30.0 },
  offset: [10, 12],
  levelMeters: 8,
  radius: 36,
  major: true,
  poetryPlaceId: 'shanyin',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 28, blend: 10 },
    { t: 'canal', pts: [[-30, 2], [30, 2]], w: 2 },
    { t: 'canal', pts: [[6, -28], [6, 28]], w: 2 },
    { t: 'lake', x: -16, z: -14, rx: 6, rz: 4, depth: 2 },
    { t: 'canal', pts: [[16, 16], [20, 20], [16, 24], [22, 27]], w: 1 },
    { t: 'lake', x: 24, z: 18, rx: 3, rz: 3, depth: 1 },
  ],
  structures: [
    ...houseRow([-24, -14, 16, 26], -5, 0, 501),
    ...houseRow([-24, -14, 16, 26], 9, 2, 511),
    { b: 'bridge', x: 6, z: 2, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'bridge', x: -6, z: 2, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'waterPavilion', x: -16, z: -9, rot: 2, atLevel: true, overWater: true, p: { width: 7, depth: 5 } },
    { b: 'corridor', x: -16, z: -22, p: { length: 11 } },
    { b: 'pavilion', x: -26, z: -16, p: { width: 5, double: true } },
    { b: 'rockery', x: -7, z: -18, p: { seed: 7 } },
    { b: 'pavilion', x: 18, z: 22, p: { width: 5, tile: 'green' } },
    { b: 'pavilion', x: 27, z: 24, p: { width: 3 } },
    ...lamps([2], [-10, 14]),
  ],
  trees: [
    { type: 'bamboo', pts: [[12, 28], [30, 30]], n: 3 },
    { type: 'willow', variant: 2, pts: [[-24, -8], [-8, -8]], n: 3 },
    { type: 'peach', pts: [[-22, -22], [-12, -24]], n: 2 },
    { type: 'willow', variant: 0, pts: [[-30, -1], [-20, -1]], n: 2 },
  ],
  vegetationProfile: { weights: { willow: 3, bamboo: 2, broadleaf: 2 }, density: 0.8 },
}

/** 密州：小城一座，城北超然台（砖台高筑、台上重檐亭）；城外猎场开阔、疏林 */
const MIZHOU: LandmarkDefinition = {
  id: 'mizhou',
  name: '密州',
  coordinate: { lng: 119.41, lat: 36.0 },
  radius: 44,
  major: true,
  poetryPlaceId: 'p107',
  terrainModifier: [{ t: 'flatten', x: 0, z: 0, r: 22, rz: 18, square: true, blend: 6 }, { t: 'pave', x0: -2, z0: -15, x1: 2, z1: 20 }],
  walls: [{ x: 0, z: 2, hw: 18, hd: 13, height: 6, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    { b: 'terrace', x: 0, z: -7, p: { width: 13, depth: 9, height: 6 } },
    { b: 'pavilion', x: 0, z: -8, dy: 6, p: { width: 7, double: true, tile: 'gray', lanterns: true } },
    { b: 'hall', x: -10, z: 6, rot: 1, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'house', x: 10, z: 4, rot: 3, p: { seed: 601, lanterns: true } },
    { b: 'house', x: 10, z: 11, rot: 3, p: { seed: 602 } },
    { b: 'shop', x: -10, z: 12, rot: 1, p: { seed: 603 } },
    ...lamps([-4, 4], [4, 10]),
  ],
  trees: [{ type: 'broadleaf', variant: 1, pts: [[26, -20], [34, 24]], n: 4 }],
  vegetationProfile: { weights: { broadleaf: 3, pine: 1 }, density: 0.5 },
}


/* ================= 第三批：滁州、襄阳、洞庭君山、彭城、惠州 ================= */

/** 滁州：琅琊山谷中醉翁亭（依山临溪），溪上小桥，山门琅琊寺；「环滁皆山也」——四面山围 */
const CHUZHOU: LandmarkDefinition = {
  id: 'chuzhou',
  name: '滁州',
  coordinate: { lng: 118.28, lat: 32.28 },
  radius: 40,
  major: true,
  poetryPlaceId: 'chuzhou',
  terrainModifier: [
    { t: 'hill', x: -22, z: -14, r: 20, h: 22 },
    { t: 'hill', x: 22, z: -18, r: 18, h: 18 },
    { t: 'hill', x: 0, z: -30, r: 18, h: 24 },
    { t: 'flatten', x: 0, z: 0, r: 12, blend: 8 },
    { t: 'canal', pts: [[-30, 14], [-8, 8], [10, 12], [30, 22]], w: 1.5 },
  ],
  structures: [
    { b: 'pavilion', x: -3, z: -2, p: { width: 7, double: true, tile: 'gray', lanterns: true } },
    { b: 'bridge', x: -2, z: 9, rot: 1, atLevel: true, p: { length: 7 } },
    { b: 'hall', x: 8, z: -6, p: { width: 9, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'archway', x: 4, z: 18, p: { tile: 'gray' } },
  ],
  trees: [
    { type: 'pine', variant: 2, pts: [[-14, -12], [14, -14]], n: 4 },
    { type: 'broadleaf', variant: 1, pts: [[-24, 4], [-14, 16]], n: 3 },
  ],
  vegetationProfile: { weights: { pine: 3, broadleaf: 4, bamboo: 1 }, density: 1.1 },
}

/** 襄阳：汉水南岸古城（城楼、夫子庙），城南往岘山去的路口有羊祜碑亭（堕泪碑） */
const XIANGYANG: LandmarkDefinition = {
  id: 'xiangyang',
  name: '襄阳',
  coordinate: { lng: 112.14, lat: 32.0 },
  // 城在汉水南岸的河谷里，汉水为北城壕：允许江水擦着北墙（水门），不把城挪上山
  offset: [0, 6],
  allowRivers: ['han'],
  radius: 46,
  major: true,
  poetryPlaceId: 'xiangyang',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 18, rz: 13, square: true, blend: 6 },
    { t: 'pave', x0: -2, z0: -10, x1: 2, z1: 14 },
  ],
  walls: [{ x: 0, z: 0, hw: 14, hd: 9, height: 7, gates: ['n', 's', 'e', 'w'] }],
  structures: [
    { b: 'hall', x: 0, z: -4, p: { width: 11, depth: 5, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'house', x: -10, z: 5, rot: 1, p: { seed: 701, lanterns: true } },
    { b: 'house', x: 10, z: 5, rot: 3, p: { seed: 702 } },
    { b: 'shop', x: -10, z: -5, rot: 1, p: { seed: 703 } },
    { b: 'shop', x: 10, z: -5, rot: 3, p: { seed: 704 } },
    ...lamps([-4, 4], [2, 8]),
    { b: 'pavilion', x: 12, z: 30, p: { width: 5, double: true } },
  ],
  trees: [{ type: 'pine', variant: 2, pts: [[2, 28], [18, 42]], n: 4 }],
}

/** 洞庭君山：湖中一岛，岛上湘妃祠、二妃墓亭，竹林（湘妃竹） */
const JUNSHAN: LandmarkDefinition = {
  id: 'junshan',
  name: '洞庭湖',
  coordinate: { lng: 112.97, lat: 29.38 },
  radius: 30,
  major: true,
  poetryPlaceId: 'dongtinghu',
  terrainModifier: [
    { t: 'island', x: 0, z: 0, r: 16, dy: 2 },
    { t: 'hill', x: 2, z: -2, r: 14, h: 10 },
    { t: 'flatten', x: -2, z: 4, r: 6, dy: 4, blend: 3 },
  ],
  structures: [
    { b: 'hall', x: -2, z: 4, atLevel: true, dy: 4, p: { width: 7, depth: 5, tile: 'green', terrace: 1, lanterns: true } },
    { b: 'pavilion', x: 6, z: -6, p: { width: 5 } },
  ],
  trees: [{ type: 'bamboo', pts: [[-10, -8], [10, -10]], n: 4 }],
  vegetationProfile: { weights: { bamboo: 4, broadleaf: 2 }, density: 1.2 },
}

/** 彭城：徐州城，城中燕子楼（二层小楼），城东黄楼；城外泗水 */
const PENGCHENG: LandmarkDefinition = {
  id: 'pengcheng',
  name: '彭城',
  coordinate: { lng: 117.19, lat: 34.27 },
  radius: 42,
  major: true,
  poetryPlaceId: 'pengcheng',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 22, rz: 17, square: true, blend: 6 },
    { t: 'pave', x0: -2, z0: -13, x1: 2, z1: 17 },
  ],
  walls: [{ x: 0, z: 0, hw: 18, hd: 13, height: 7, gates: ['n', 's', 'e', 'w'] }],
  // 大运河从城边流过：允许穿城，城墙留水门
  allowRivers: ['grand-canal'],
  structures: [
    { b: 'grandTower', x: -8, z: -4, p: { levels: 2, width: 7, tile: 'gray', terrace: 2 } },
    { b: 'grandTower', x: 10, z: -4, p: { levels: 2, width: 7, tile: 'yellow', top: 'wudian', terrace: 2 } },
    { b: 'house', x: -10, z: 8, rot: 1, p: { seed: 801, lanterns: true } },
    { b: 'shop', x: 10, z: 8, rot: 3, p: { seed: 802 } },
    ...lamps([-4, 4], [4, 10]),
  ],
  trees: [{ type: 'willow', variant: 0, pts: [[-26, -16], [-26, 16]], n: 3 }],
}

/** 惠州：西湖（丰湖）湖堤、泗洲塔、湖心亭，城中东坡居所白鹤峰 */
const HUIZHOU: LandmarkDefinition = {
  id: 'huizhou',
  name: '惠州',
  coordinate: { lng: 114.4, lat: 23.09 },
  radius: 44,
  major: true,
  poetryPlaceId: 'p128',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 34, blend: 6 },
    { t: 'lake', x: -10, z: 0, rx: 16, rz: 11, depth: 3 },
    { t: 'causeway', pts: [[-26, 2], [6, -2]], w: 1.5, dy: 0 },
    { t: 'island', x: -12, z: 6, r: 3, dy: 0 },
    { t: 'hill', x: 20, z: -18, r: 12, h: 9 },
  ],
  structures: [
    { b: 'pavilion', x: -12, z: 6, atLevel: true, overWater: true, p: { width: 5, tile: 'green' } },
    { b: 'pagoda', x: -4, z: -16, p: { levels: 7, width: 5 } },
    { b: 'house', x: 20, z: -16, p: { seed: 901, lanterns: true } },
    { b: 'house', x: 18, z: 10, rot: 3, p: { seed: 902 } },
    { b: 'shop', x: 24, z: 2, rot: 3, p: { seed: 903 } },
  ],
  trees: [
    { type: 'palm', pts: [[-24, 16], [0, 16]], n: 4 },
    { type: 'willow', variant: 0, pts: [[-22, -2], [2, -2]], n: 3 },
  ],
  vegetationProfile: { weights: { palm: 3, broadleaf: 3, bamboo: 1 }, density: 0.8 },
}

export const CITY_CATALOG: readonly LandmarkDefinition[] = [HUANGHELOU, YUEYANGLOU, TENGWANGGE, GUANQUELOU, DUOJINGLOU, JINLING, LUOYANG, CHENGDU, SUZHOU, HUANGZHOU, YANGZHOU, BIANJING, SHANYIN, MIZHOU, CHUZHOU, XIANGYANG, JUNSHAN, PENGCHENG, HUIZHOU]
