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
  // 定稿机位：主景东南从江侧斜看抱厦层檐、全景蛇山与江、近观下层柱廊与匾
  shots: [
    { id: 'hero', name: '主景', yaw: 0.75, pitch: 0.28, distance: 100, offset: [-6, 24, 0] },
    { id: 'context', name: '全景', yaw: 1.3, pitch: 0.55, distance: 185, offset: [-6, 12, 0] },
    { id: 'detail', name: '近观', yaw: 0.15, pitch: 0.2, distance: 40, offset: [-6, 15, 9] },
  ],
  terrainModifier: [
    { t: 'hill', x: 12, z: 2, r: 26, h: 13 },
    { t: 'hill', x: -6, z: 0, r: 17, h: 11 },
    { t: 'flatten', x: -6, z: 0, r: 13, dy: 11, blend: 6 },
    { t: 'flatten', x: 18, z: 2, r: 5, dy: 13, blend: 4 },
  ],
  structures: [
    // 四层十字抱厦、出檐深（eave 10）、层层收分：整组最高最突出，檐角层层叠叠如展翅
    { b: 'grandTower', x: -6, z: 0, atLevel: true, dy: 11, p: { levels: 4, width: 11, tile: 'yellow', plan: 'cross', top: 'cross', terrace: 2, eave: 10, shrink: 2, floorH: [6, 5, 5, 4] } },
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

/** 岳阳楼：巴陵城西门城台上，三层盔顶（坡面外撇、陡起外鼓、近脊圆收，面宽大于进深）、黄琉璃，面西临洞庭；左右三醉亭、仙梅亭 */
const YUEYANGLOU: LandmarkDefinition = {
  id: 'yueyanglou',
  name: '岳阳楼',
  coordinate: { lng: 113.09, lat: 29.38 },
  radius: 32,
  major: true,
  poetryPlaceId: 'p041',
  waterfront: true,
  // 定稿机位：主景西偏北斜看盔顶与城台、全景含洞庭湖面、近观城台踏道与底层柱廊
  shots: [
    { id: 'hero', name: '主景', yaw: -1.15, pitch: 0.26, distance: 82, offset: [0, 15, 0] },
    { id: 'context', name: '全景', yaw: -1.57, pitch: 0.62, distance: 165, offset: [-10, 4, 0] },
    { id: 'detail', name: '近观', yaw: -1.4, pitch: 0.1, distance: 34, offset: [-8, 7, 0] },
  ],
  terrainModifier: [{ t: 'flatten', x: 4, z: 0, r: 20, blend: 6 }],
  structures: [
    { b: 'grandTower', x: 0, z: 0, rot: 1, p: { levels: 3, width: 9, tile: 'yellow', top: 'helmet', base: 'wall', terrace: 4 } },
    { b: 'pavilion', x: 6, z: -15, p: { width: 5, tile: 'green', lanterns: true } },
    { b: 'pavilion', x: 6, z: 15, p: { width: 5, tile: 'green', double: true } },
    { b: 'house', x: 17, z: -7, rot: 3, p: { seed: 11, lanterns: true } },
    { b: 'house', x: 17, z: 7, rot: 3, p: { seed: 12, lanterns: true } },
    { b: 'shop', x: 24, z: 0, rot: 3, p: { seed: 13 } },
    // 楼前临湖：青石码头与入水踏道、系船柱、湿石；两条小舟泊在踏道两侧，楼前其余湖面留白
    { b: 'quay', x: -9, z: 0, rot: 1, atLevel: true, overWater: true, p: { width: 15, depth: 11 } },
    { b: 'skiff', x: -27, z: -8, atLevel: true, overWater: true, p: { seed: 1 } },
    { b: 'skiff', x: -24, z: 10, rot: 2, atLevel: true, overWater: true, p: { seed: 2 } },
  ],
  // 柳退到楼后街市一侧，作明亮屋顶的背景，不挡临湖的正面
  trees: [{ type: 'willow', variant: 0, pts: [[30, -22], [30, 22]], n: 4 }],
}

/**
 * 滕王阁：临赣江高台，三层歇山绿琉璃，正面朝江；南北挟屋两殿，背江一侧立牌坊。
 * 史上在赣江东岸、面西；本图的坐标落在江西岸（江在东侧），所以整组镜像成面东临江——
 * 「楼与江」的关系优先于绝对朝向，否则楼背对着江，取景也只能绕到侧面去找水。
 */
const TENGWANGGE: LandmarkDefinition = {
  id: 'tengwangge',
  name: '滕王阁',
  coordinate: { lng: 115.88, lat: 28.68 },
  radius: 34,
  major: true,
  poetryPlaceId: 'p077',
  // 定稿机位：主景东南斜看主阁与两翼、全景高台临江、近观登台踏道
  shots: [
    { id: 'hero', name: '主景', yaw: 1.0, pitch: 0.26, distance: 92, offset: [0, 13, 0] },
    { id: 'context', name: '全景', yaw: 1.57, pitch: 0.6, distance: 170, offset: [4, 4, 0] },
    { id: 'detail', name: '近观', yaw: 1.45, pitch: 0.1, distance: 36, offset: [9, 8, 0] },
  ],
  terrainModifier: [{ t: 'flatten', x: -6, z: 0, r: 26, blend: 6 }],
  structures: [
    // 横向展开：面宽 17、进深 9，三层不收进深之外的面宽太多，连同南北两殿成一字阶梯轮廓
    { b: 'grandTower', x: 0, z: 0, rot: 3, p: { levels: 3, width: 17, depth: 9, tile: 'green', top: 'xieshan', terrace: 3, baseStep: 3, shrink: 2, floorH: [5, 4, 4] } },
    { b: 'hall', x: -7, z: -18, rot: 3, p: { width: 9, depth: 7, tile: 'green', terrace: 3, lanterns: true } },
    // 南殿：楼南有一道支流斜穿（x −10…0），放在原位会压在溪上被跳过；挪到溪西岸的陆地，隔溪与楼相望
    { b: 'hall', x: -22, z: 19, rot: 3, p: { width: 9, depth: 7, tile: 'green', terrace: 3, lanterns: true } },
    { b: 'archway', x: -18, z: 0, rot: 3, p: { tile: 'green' } },
    { b: 'pavilion', x: -24, z: -22, p: { width: 5 } },
  ],
  // 柳树种在背江的陆地一侧，不挡临江的视线
  trees: [{ type: 'willow', variant: 0, pts: [[-28, -26], [-28, 26]], n: 5 }],
}

/**
 * 鹳雀楼：临黄河，三层歇山灰瓦，正面朝河；背河一侧是蒲州人家。
 * 史上在黄河东岸、面西；本图的坐标落在河西岸（河在东侧），与滕王阁同理整组镜像成面东临河。
 */
const GUANQUELOU: LandmarkDefinition = {
  id: 'guanquelou',
  name: '鹳雀楼',
  coordinate: { lng: 110.29, lat: 34.87 },
  radius: 32,
  major: true,
  // 坐标正落在两河相汇的转角，城台挡在黄河上：整组向西北退开
  offset: [-14, -12],
  poetryPlaceId: 'p027',
  // 定稿机位：主景河侧看楼、远眺让楼退小而黄河与远山成主景（「欲穷千里目」）、近观厚台入口
  shots: [
    { id: 'hero', name: '主景', yaw: 1.2, pitch: 0.24, distance: 82, offset: [0, 15, 0] },
    { id: 'vista', name: '远眺', yaw: 1.35, pitch: 0.22, distance: 170, offset: [6, 10, 0] },
    { id: 'detail', name: '近观', yaw: 1.5, pitch: 0.1, distance: 34, offset: [9, 9, 0] },
  ],
  terrainModifier: [{ t: 'flatten', x: -6, z: 0, r: 22, blend: 6 }],
  structures: [
    // 北方形制：长方平面、出檐克制（eave 6）、层高匀而高、台基厚，灰瓦；不是南方名楼换个瓦色
    { b: 'grandTower', x: 0, z: 0, rot: 3, p: { levels: 3, width: 13, depth: 9, tile: 'gray', top: 'xieshan', terrace: 6, eave: 6, shrink: 2, floorH: [5, 5, 5] } },
    { b: 'house', x: -17, z: -8, rot: 1, p: { seed: 21 } },
    { b: 'house', x: -17, z: 8, rot: 1, p: { seed: 22, lanterns: true } },
    { b: 'courtyard', x: -28, z: 0, rot: 1, p: { width: 11, seed: 23 } },
  ],
  // 北方河岸开阔，柳只在人家一侧稀疏几株
  trees: [{ type: 'willow', variant: 0, pts: [[-10, -22], [-10, 22]], n: 3 }],
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

const houseRow = (xs: readonly number[], z: number, rot: number, seed: number): StructureSpec[] => xs.map((x, i) => ({ b: 'house' as const, x, z, rot, p: { seed: seed + i, lanterns: i % 2 === 0 } }))
/**
 * 苏州：园林之城。地形是一条南北向的狭长平地，夹在两条运河之间，西边是大湖——
 * 按苏州古典园林做成一座大园（融拙政、留园、网师诸园的意象，是「苏州园林意象」而非某园复原）：
 *
 *  · 南墙正中园门，门内花街铺地的前院、花台，一座湖石假山障景（「开门见山」，不让园景一眼看尽）；
 *  · 过前院是远香堂（四面厅）面北临大池，堂前月台；池居全园中部，池心岛上荷风四面亭，九曲桥自堂前通岛；
 *    西岸水榭临池、游廊沿岸，东北岸石舫船头入水；池岸垂柳、湖石驳岸；
 *  · 池北是园的后半：见山楼（两层）居西北，冠云峰立在东北，书斋小院与松，双檐亭在峰旁的土山上；
 *    北墙开月洞门，框出墙外的北寺塔；
 *  · 园外：东运河上石拱桥，城北北寺塔作借景。
 */
const SUZHOU: LandmarkDefinition = {
  id: 'suzhou',
  name: '苏州',
  coordinate: { lng: 120.62, lat: 31.31 },
  radius: 54,
  major: true,
  poetryPlaceId: 'suzhou',
  // 定稿机位：全园总览、远香堂（自南俯看堂、九曲桥与池心亭）、池北（自北俯看池、石舫与堂）、后园（见山楼、冠云峰）。
  // 园小而密、斜看只见层层屋顶，都近乎俯看
  shots: [
    { id: 'hero', name: '全园', yaw: 0.35, pitch: 1.0, distance: 125, offset: [8, 0, 0] },
    { id: 'hall', name: '远香堂', yaw: 0.1, pitch: 0.95, distance: 48, offset: [8, 0, 10] },
    { id: 'pond', name: '池北', yaw: 3.0, pitch: 0.95, distance: 50, offset: [8, 0, -4] },
    { id: 'peak', name: '后园', yaw: 0.4, pitch: 1.0, distance: 42, offset: [8, 0, -28] },
  ],
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 40, blend: 6 },
    { t: 'canal', pts: [[-6, -44], [-6, 44]], w: 2 },
    { t: 'canal', pts: [[22, -44], [22, 44]], w: 2 },
    // 大池：园中部，x −1…17、z −12…20；池心小岛
    { t: 'lake', x: 8, z: 4, rx: 9, rz: 15, depth: 2 },
    { t: 'island', x: 8, z: 0, r: 3.4, dy: 1 },
  ],
  structures: [
    /* ——— 园墙：西、东、北三面粉墙，南墙正中园门；北墙开月洞门 ——— */
    { b: 'gardenWall', x: -4, z: -42, p: { length: 25, height: 5 } },
    { b: 'gardenWall', x: -4, z: -42, rot: 1, p: { length: 85, height: 4, gate: false } },
    { b: 'gardenWall', x: 20, z: -42, rot: 1, p: { length: 85, height: 4, gate: false } },
    { b: 'gardenWall', x: -4, z: 42, p: { length: 7, height: 4, gate: false } },
    { b: 'gardenWall', x: 14, z: 42, p: { length: 7, height: 4, gate: false } },
    { b: 'gardenGate', x: 8, z: 42, p: { width: 11 } },

    /* ——— 前院：花街铺地、花台、障景假山 ——— */
    { b: 'gardenPaving', x: 8, z: 38, p: { width: 13, depth: 5 } },
    { b: 'flowerBed', x: 0, z: 39, p: { seed: 11 } },
    { b: 'flowerBed', x: 16, z: 39, p: { seed: 12 } },
    { b: 'rockery', x: 8, z: 33, p: { seed: 7, height: 6 } },

    /* ——— 中部：远香堂面北临池，池心岛亭，九曲桥自堂前通岛 ——— */
    { b: 'gardenHall', x: 8, z: 26, rot: 2, p: { width: 9, depth: 5, lanterns: true } },
    { b: 'gardenPaving', x: 8, z: 22, p: { width: 9, depth: 2 } },
    { b: 'pavilion', x: 8, z: 0, p: { width: 5 } },
    { b: 'zigzagBridge', x: 8, z: 12, rot: 1, atLevel: true, overWater: true, p: { length: 13 } },
    // 西岸：水榭临池、游廊沿岸
    { b: 'waterPavilion', x: 0, z: 8, rot: 1, atLevel: true, overWater: true, p: { width: 5, depth: 5 } },
    { b: 'corridor', x: -2, z: -6, rot: 1, p: { length: 11 } },
    { b: 'corridor', x: -2, z: 20, rot: 1, p: { length: 9 } },
    // 东岸：石舫船头入池，湖石驳岸
    { b: 'stoneBoat', x: 15, z: -10, atLevel: true, overWater: true },
    { b: 'rockery', x: 17, z: 12, p: { seed: 5, height: 5 } },

    /* ——— 后园：见山楼、冠云峰、书斋、双檐亭 ——— */
    { b: 'loft', x: 1, z: -34, p: { width: 7, depth: 5, seed: 121, lanterns: true } },
    { b: 'rockery', x: 14, z: -30, p: { seed: 15, height: 14 } },
    { b: 'gardenHall', x: 3, z: -21, p: { width: 7, depth: 5 } },
    { b: 'pavilion', x: 15, z: -20, p: { width: 5, double: true } },
    { b: 'flowerBed', x: 8, z: -38, p: { seed: 13 } },
    { b: 'gardenPaving', x: 8, z: -27, p: { width: 7, depth: 3 } },
    ...lamps([5, 11], [41]),

    /* ——— 园外：东岸石桥、北寺塔（借景） ——— */
    { b: 'bridge', x: 22, z: -22, rot: 0, atLevel: true, p: { length: 7 } },
    { b: 'pagoda', x: 32, z: -28, p: { levels: 9, width: 7, tile: 'gray' } },
    ...lamps([30], [-20, -12]),
  ],
  trees: [
    // 池岸垂柳
    { type: 'willow', variant: 2, pts: [[-1, -8], [-1, 2]], n: 2 },
    { type: 'willow', variant: 2, pts: [[17, 0], [17, 6]], n: 2 },
    { type: 'willow', variant: 2, pts: [[2, 19], [14, 19]], n: 2 },
    // 墙下竹丛、后园松
    { type: 'bamboo', pts: [[-3, -41], [19, -41]], n: 7 },
    { type: 'bamboo', pts: [[-3, 30], [-3, 40]], n: 3 },
    { type: 'bamboo', pts: [[19, 30], [19, 40]], n: 3 },
    { type: 'pine', variant: 1, pts: [[8, -16], [12, -24]], n: 2 },
    { type: 'peach', pts: [[0, 28], [16, 28]], n: 2 },
    // 园外：河岸柳
    { type: 'willow', variant: 0, pts: [[26, -40], [44, -40]], n: 3 },
    { type: 'willow', variant: 0, pts: [[26, 20], [44, 20]], n: 3 },
  ],
  vegetationProfile: { weights: { willow: 3, broadleaf: 2, peach: 1, bamboo: 2 }, density: 0.7 },
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
  // 汉水是城北的城壕，不穿城：城池自动让开河道（此前允许穿城，一条河从城中间过、楼压在水上）
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
  // 大运河从城边流过、不穿城：城池自动让开河道
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

/**
 * 白帝城—夔门：长江北岸临江的白帝山顶，白帝庙面南俯江（正殿明良殿、东西配殿、山门牌坊、观星亭）；
 * 庙东两岸峭壁对峙、江面收束成夔门（瞿塘峡口）。「朝辞白帝彩云间」「风急天高猿啸哀」——城寺是视觉节点，峡谷是主形体。
 * 地图上的长江在这里自西向东，北岸缓起、南岸一道山梁；庙在北岸山顶（中心向北挪离江心）。
 */
const BAIDICHENG: LandmarkDefinition = {
  id: 'baidicheng-kuimen',
  name: '白帝城',
  coordinate: { lng: 109.5833, lat: 31.0467 },
  offset: [8, -26],
  radius: 40,
  major: true,
  poetryPlaceId: 'baidicheng',
  terrainModifier: [
    // 白帝山：庙所在的山顶平台，南坡临江
    { t: 'hill', x: 0, z: 2, r: 24, h: 6 },
    { t: 'flatten', x: 0, z: 0, r: 15, blend: 14 },
    // 夔门：庙东两岸峭壁对峙，沿江的走向（江在庙东向东南拐）起两道崖，崖壁直落江边（北岸崖面朝南、南岸崖面朝北）
    { t: 'ridge', pts: [[20, 10], [40, 11], [56, 17], [82, 24]], h: 30, w: 26, cliff: 5, cliffSide: 1, toWater: true },
    { t: 'ridge', pts: [[20, 30], [40, 29], [56, 35], [82, 42]], h: 34, w: 26, cliff: 5, cliffSide: -1, toWater: true },
  ],
  structures: [
    { b: 'hall', x: 0, z: -4, p: { width: 11, depth: 7, tile: 'gray', terrace: 2, lanterns: true } },
    { b: 'hall', x: -11, z: 4, rot: 3, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'hall', x: 11, z: 4, rot: 1, p: { width: 7, depth: 5, tile: 'gray', terrace: 1 } },
    { b: 'archway', x: 0, z: 11, p: { tile: 'gray' } },
    { b: 'pavilion', x: 13, z: -10, p: { width: 5, double: true, tile: 'gray', lanterns: true } },
  ],
  trees: [{ type: 'pine', variant: 1, pts: [[-16, -12], [-6, -16]], n: 3 }],
  vegetationProfile: { weights: { pine: 5, broadleaf: 2, bamboo: 1 }, density: 1.1 },
  // 定稿机位：主景从上游江面斜看临江崖顶的庙；夔门从上游顺江东望两岸峭壁；近观庙前山门
  shots: [
    { id: 'hero', name: '主景', yaw: -0.95, pitch: 0.28, distance: 120, offset: [8, -10, 8] },
    { id: 'vista', name: '夔门', yaw: -1.45, pitch: 0.17, distance: 175, offset: [48, -34, 24] },
    { id: 'detail', name: '近观', yaw: 0.15, pitch: 0.42, distance: 42, offset: [0, 4, 2] },
  ],
}

/**
 * 泰山：岱顶（玉皇顶）一座小殿与观日亭，南坡十八盘石阶之字形攀上南天门，山脚岱宗坊。
 * 「会当凌绝顶，一览众山小」——道路导向山门，建筑体量克制，峰顶留天际线。
 * 地图上的泰山主峰已在这里（宏观地形校准过海拔），只加山道与建筑，不改山形。
 */
const TAISHAN: LandmarkDefinition = {
  id: 'taishan',
  name: '泰山',
  coordinate: { lng: 117.1, lat: 36.25 },
  radius: 56,
  major: true,
  poetryPlaceId: 'p037',
  levelMode: 'summit',
  terrainModifier: [
    { t: 'flatten', x: 0, z: -1, r: 7, blend: 4 },
    // 南天门坐在山脊的垭口：削出一块台地，门不立在高高的石基上
    { t: 'flatten', x: 0, z: 15, r: 6, rz: 4, square: true, dy: -8, blend: 4 },
    // 十八盘：自岱宗坊北上，之字形折上南天门，再一段缓坡到岱顶
    { t: 'path', pts: [[1, 50], [-3, 42], [5, 36], [-3, 30], [4, 24], [-2, 20], [0, 16], [0, 7]], w: 1.2 },
  ],
  structures: [
    { b: 'hall', x: 0, z: -3, p: { width: 7, depth: 5, tile: 'yellow', terrace: 1, lanterns: true } },
    { b: 'pavilion', x: -10, z: -4, p: { width: 5, tile: 'gray' } },
    { b: 'gate', x: 0, z: 15, atLevel: true, dy: -8, p: { width: 9, depth: 5, height: 6 } },
    { b: 'archway', x: 1, z: 52, p: { tile: 'gray' } },
  ],
  vegetationProfile: { weights: { pine: 6, broadleaf: 1 }, density: 1.0 },
  // 定稿机位：主景从南面仰看十八盘直上南天门、岱顶；登顶远眺（「一览众山小」）；近观南天门
  shots: [
    { id: 'hero', name: '主景', yaw: 0.2, pitch: 0.3, distance: 120, offset: [0, -14, 26] },
    { id: 'vista', name: '岱顶', yaw: 0.1, pitch: 0.12, distance: 60, offset: [0, 2, 20] },
    { id: 'detail', name: '南天门', yaw: 0.25, pitch: 0.2, distance: 34, offset: [0, -12, 15] },
  ],
}

/**
 * 剑门关：大剑山七十二峰连绵如城，北面是一线绝壁，正中一道窄缺口，关楼横锁其间；蜀道自北而来，穿关南下入蜀。
 * 「剑阁峥嵘而崔嵬，一夫当关，万夫莫开」——崖是主体，关楼不大，卡在缺口里才显出险。
 * 地图上东侧有一条南北向的河，整组西移避开；两道山脊北面成崖（迎着北来的路），南坡缓。
 */
const JIANMEN: LandmarkDefinition = {
  id: 'jianmenguan',
  name: '剑门关',
  coordinate: { lng: 105.55, lat: 32.35 },
  offset: [-20, 0],
  radius: 60,
  major: true,
  poetryPlaceId: 'p095',
  terrainModifier: [
    { t: 'ridge', pts: [[-80, 4], [-46, -2], [-6, 0]], h: 38, w: 24, cliff: 6, cliffSide: -1, squareEnds: true },
    { t: 'ridge', pts: [[6, 0], [24, -3], [36, 2]], h: 36, w: 20, cliff: 6, cliffSide: -1, squareEnds: true },
    { t: 'flatten', x: 0, z: 0, r: 5, rz: 9, square: true, blend: 3 },
    // 蜀道：自北穿关南下
    { t: 'path', pts: [[2, -60], [-2, -30], [0, -10], [0, 12], [3, 34], [-1, 60]], w: 1.5 },
  ],
  structures: [
    // 关楼：城门洞（路穿门而过），门上一座重檐楼
    { b: 'gate', x: 0, z: 0, rot: 2, atLevel: true, p: { width: 11, depth: 7, height: 8 } },
    { b: 'pavilion', x: 0, z: 0, atLevel: true, dy: 8, p: { width: 7, double: true, tile: 'gray', lanterns: true } },
    { b: 'archway', x: 1, z: 30, p: { tile: 'gray' } },
  ],
  vegetationProfile: { weights: { pine: 6, broadleaf: 1.5 }, density: 1.1 },
  // 定稿机位：主景自北来路仰看绝壁与关楼；蜀道（俯看山道穿关南下）；近观关门
  shots: [
    { id: 'hero', name: '主景', yaw: 3.0, pitch: 0.14, distance: 120, offset: [0, 10, 0] },
    { id: 'context', name: '蜀道', yaw: 2.6, pitch: 0.75, distance: 170, offset: [0, 0, 0] },
    { id: 'detail', name: '关门', yaw: 3.14, pitch: 0.12, distance: 40, offset: [0, 6, 0] },
  ],
}

/**
 * 枫桥—寒山寺：苏州城西，运河上一座石拱桥（枫桥），桥南岸寒山寺——山门、大殿、钟楼、普明塔，黄墙围合；
 * 桥边泊着夜船。「月落乌啼霜满天，江枫渔火对愁眠。姑苏城外寒山寺，夜半钟声到客船」——
 * 桥作前景引导，寺作中景，暗林作背景；河面留夜色与几点渔火。与苏州园林隔水相望、不争中心。
 */
const FENGQIAO: LandmarkDefinition = {
  id: 'fengqiao',
  name: '枫桥',
  coordinate: { lng: 120.563, lat: 31.315 },
  offset: [-40, -4],
  radius: 30,
  major: true,
  poetryPlaceId: 'fengqiao',
  terrainModifier: [{ t: 'flatten', x: 2, z: 8, r: 16, blend: 6 }],
  structures: [
    // 运河在寺东自东北斜向南流过。枫桥：东西向跨河的石拱桥（沿自身轴线找水面居中跨过）
    { b: 'bridge', x: 14, z: -6, atLevel: true, span: true, p: { length: 11 } },
    // 寒山寺：山门朝东对河，大殿居中，钟楼在北，普明塔在西南，殿前小院
    { b: 'gate', x: 8, z: 4, rot: 1, p: { width: 9, depth: 3, height: 5 } },
    { b: 'hall', x: -4, z: 4, rot: 3, p: { width: 11, depth: 7, tile: 'gray', terrace: 2, lanterns: true } },
    { b: 'bellTower', x: -2, z: -10, p: { width: 7 } },
    { b: 'pagoda', x: -10, z: 18, p: { levels: 5, width: 7 } },
  ],
  trees: [{ type: 'broadleaf', pts: [[-20, -12], [-22, 2], [-20, 12]], n: 3 }],
  // 定稿机位：夜泊（河东岸低看桥在前、寺在后）、全景、寺门（自东看山门）
  shots: [
    { id: 'hero', name: '夜泊', yaw: 1.2, pitch: 0.2, distance: 70, offset: [4, 4, 0] },
    { id: 'context', name: '全景', yaw: 1.0, pitch: 0.75, distance: 110, offset: [4, 0, 2] },
    { id: 'detail', name: '寺门', yaw: 1.57, pitch: 0.18, distance: 34, offset: [6, 4, 4] },
  ],
}

/**
 * 终南山：长安城南的高峰（宏观地形按实测海拔校准过，山形不动）。太乙峰顶一座重檐亭；
 * 北麓（向着长安）楼观台——道观的殿、钟楼、牌坊坐在削出的台地上，一条石阶自观后上峰；
 * 南坡一条山溪出谷，溪头是王维的终南别业（「行到水穷处，坐看云起时」）。
 */
const ZHONGNAN: LandmarkDefinition = {
  id: 'zhongnan',
  name: '终南山',
  coordinate: { lng: 108.95, lat: 33.76 },
  radius: 50,
  major: true,
  poetryPlaceId: 'zhongnanshan',
  levelMode: 'summit',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 4, blend: 3 },
    // 楼观台：北麓台地（比峰顶低约 50 格）
    { t: 'flatten', x: 6, z: -34, r: 9, dy: -50, blend: 6 },
    { t: 'path', pts: [[6, -26], [2, -18], [-2, -10], [0, -4]], w: 1.1 },
    // 山溪：南坡出谷
    { t: 'canal', pts: [[-18, 10], [-16, 26], [-12, 46]], w: 1 },
  ],
  structures: [
    { b: 'pavilion', x: 0, z: 0, atLevel: true, p: { width: 5, double: true, tile: 'gray' } },
    { b: 'hall', x: 6, z: -34, rot: 2, atLevel: true, dy: -50, p: { width: 9, depth: 7, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'bellTower', x: 17, z: -32, atLevel: true, dy: -50, p: { width: 7 } },
    { b: 'archway', x: 6, z: -44, rot: 2, p: { tile: 'gray' } },
    { b: 'hut', x: -8, z: 32, p: { width: 5, depth: 5 } },
  ],
  trees: [{ type: 'bamboo', pts: [[-4, 28], [-4, 36]], n: 2 }],
  vegetationProfile: { weights: { pine: 6, broadleaf: 2 }, density: 1.2 },
  // 定稿机位：主景自长安方向（北）仰看峰与北麓楼观台；太乙峰（峰顶亭）；别业（南坡溪头茅舍）
  shots: [
    { id: 'hero', name: '主景', yaw: 3.0, pitch: 0.22, distance: 150, offset: [0, -30, -10] },
    { id: 'peak', name: '太乙峰', yaw: 0.4, pitch: 0.7, distance: 70, offset: [0, 2, 0] },
    { id: 'villa', name: '别业', yaw: 0.5, pitch: 0.4, distance: 46, offset: [-10, -40, 30] },
  ],
}

/**
 * 辋川别业：蓝田辋谷，王维的别业。辋水自西北而来，中间汇成欹湖，出湖南流出谷（东南不远是商山，水不往那边去）；
 * 湖北岸别业（厅堂、居室），西岸竹林深处竹里馆（「独坐幽篁里，弹琴复长啸」），东北一座华子冈上亭，
 * 西南一片密林即鹿柴（「空山不见人，但闻人语响」）。山居秋暝：「明月松间照，清泉石上流」。
 */
const WANGCHUAN: LandmarkDefinition = {
  id: 'wangchuan',
  name: '辋川别业',
  coordinate: { lng: 109.3, lat: 34.05 },
  radius: 50,
  major: true,
  poetryPlaceId: 'p043',
  terrainModifier: [
    { t: 'flatten', x: -4, z: -14, r: 12, blend: 6 },
    { t: 'canal', pts: [[-48, -34], [-24, -18], [-6, 2], [10, 10], [8, 24], [2, 46]], w: 1.5 },
    { t: 'lake', x: 4, z: 6, rx: 11, rz: 6, depth: 2, rot: 0.4 },
    { t: 'hill', x: 30, z: -18, r: 16, h: 16 },
  ],
  structures: [
    { b: 'gardenHall', x: -4, z: -14, p: { width: 9, depth: 5, lanterns: true } },
    { b: 'house', x: -16, z: -16, rot: 1, p: { seed: 41 } },
    { b: 'hut', x: -26, z: 8, rot: 1, p: { width: 5, depth: 5 } },
    { b: 'pavilion', x: 30, z: -18, p: { width: 5, tile: 'gray' } },
    { b: 'bridge', x: 8, z: 20, atLevel: true, span: true, p: { length: 7 } },
  ],
  trees: [
    { type: 'bamboo', pts: [[-32, 2], [-32, 14], [-22, 16], [-20, 2]], n: 8 },
    { type: 'pine', variant: 0, pts: [[-30, 26], [-18, 22], [-26, 38], [-12, 36]], n: 6 },
    { type: 'willow', variant: 0, pts: [[-6, 0], [12, 0]], n: 2 },
  ],
  vegetationProfile: { weights: { pine: 4, broadleaf: 3, bamboo: 2 }, density: 1.1 },
  // 定稿机位：主景（自南俯看欹湖与北岸别业）、竹里馆、华子冈
  shots: [
    { id: 'hero', name: '主景', yaw: 0.3, pitch: 0.8, distance: 120, offset: [0, 0, 0] },
    { id: 'bamboo', name: '竹里馆', yaw: 0.4, pitch: 0.8, distance: 46, offset: [-24, 0, 8] },
    { id: 'hill', name: '华子冈', yaw: 0.9, pitch: 0.6, distance: 75, offset: [26, 6, -16] },
  ],
}

/**
 * 兰亭：会稽山阴之兰渚，「崇山峻岭，茂林修竹，又有清流激湍，映带左右」。
 * 一条清溪弯成几道曲水（流觞），溪边一座小亭（流觞亭）与几方坐石；北有鹅池、池边碑亭；兰亭碑亭居中；四周竹林，背后一道小山。
 * 不设高塔大殿——以曲线与竹影为主体，与山阴城、沈园分开。
 */
const LANTING: LandmarkDefinition = {
  id: 'lanting',
  name: '兰亭',
  coordinate: { lng: 120.5, lat: 29.93 },
  offset: [-34, 32],
  radius: 32,
  major: true,
  poetryPlaceId: 'lanting',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 20, blend: 8 },
    { t: 'hill', x: -6, z: -30, r: 20, h: 16 },
    // 曲水：自北向南三折，宽一格
    { t: 'canal', pts: [[-10, -14], [-2, -10], [-8, -4], [0, 2], [-6, 8], [2, 14], [-2, 22]], w: 0.8 },
    // 鹅池
    { t: 'lake', x: 12, z: -10, rx: 5, rz: 4, depth: 2 },
    { t: 'pave', x0: 4, z0: 14, x1: 6, z1: 26 },
  ],
  structures: [
    { b: 'pavilion', x: 6, z: 2, p: { width: 5, tile: 'gray' } },
    { b: 'pavilion', x: 12, z: -18, p: { width: 3, tile: 'gray' } },
    { b: 'pavilion', x: -14, z: 4, p: { width: 5, double: true, tile: 'gray' } },
    { b: 'gardenHall', x: 10, z: 14, rot: 3, p: { width: 7, depth: 5 } },
    { b: 'rockery', x: -14, z: -10, p: { seed: 21 } },
    { b: 'rockery', x: 4, z: 10, p: { seed: 22 } },
  ],
  trees: [
    { type: 'bamboo', pts: [[-22, -16], [-20, 0], [-22, 16], [-16, 24]], n: 9 },
    { type: 'bamboo', pts: [[18, -2], [20, 8], [18, 20]], n: 5 },
    { type: 'willow', variant: 2, pts: [[8, -6], [16, -6]], n: 2 },
  ],
  vegetationProfile: { weights: { bamboo: 4, broadleaf: 2, pine: 1 }, density: 1.1 },
  shots: [
    { id: 'hero', name: '曲水', yaw: 0.6, pitch: 0.75, distance: 70, offset: [-2, 0, 4] },
    { id: 'pond', name: '鹅池', yaw: 0.8, pitch: 1.0, distance: 46, offset: [12, 0, -12] },
    { id: 'detail', name: '流觞亭', yaw: -0.3, pitch: 0.35, distance: 30, offset: [-10, 2, 4] },
  ],
}

/**
 * 天姥山：「天姥连天向天横，势拔五岳掩赤城」——宏观地形这里只是一座缓丘，另起一道南北横亘的山岭，东面（向海）陡崖；
 * 「脚著谢公屐，身登青云梯」：一条石阶之字形攀上岭头，岭头一座重檐亭（「半壁见海日」）；
 * 西麓剡溪边谢公宿处（茅舍），溪上一座小桥。
 */
const TIANMU: LandmarkDefinition = {
  id: 'tianmu',
  name: '天姥山',
  coordinate: { lng: 121.02, lat: 29.15 },
  // 地图上天台山（海拔校准点）只在北边 9 格，整组南移，山岭不压到天台
  offset: [0, 34],
  radius: 50,
  major: true,
  poetryPlaceId: 'p026',
  terrainModifier: [
      { t: 'ridge', pts: [[2, -6], [6, 8], [4, 26], [8, 50]], h: 34, w: 28, cliff: 7, cliffSide: -1 },
    { t: 'canal', pts: [[-40, -40], [-30, -10], [-34, 20], [-28, 46]], w: 1.2 },
    { t: 'path', pts: [[-24, 24], [-14, 20], [-18, 14], [-6, 10], [-10, 6], [2, 6]], w: 1.1 },
  ],
  structures: [
    { b: 'pavilion', x: 5, z: 6, p: { width: 5, double: true, tile: 'gray' } },
    { b: 'hut', x: -24, z: 24, rot: 1, p: { width: 5, depth: 5 } },
    { b: 'bridge', x: -30, z: 12, atLevel: true, span: true, p: { length: 7 } },
  ],
  vegetationProfile: { weights: { pine: 5, broadleaf: 2, bamboo: 1 }, density: 1.1 },
  shots: [
    { id: 'hero', name: '主景', yaw: 1.4, pitch: 0.3, distance: 150, offset: [4, 10, 16] },
    { id: 'stair', name: '青云梯', yaw: -0.6, pitch: 0.9, distance: 80, offset: [-8, 10, 14] },
    { id: 'detail', name: '谢公宿处', yaw: -0.4, pitch: 0.8, distance: 46, offset: [-26, 0, 22] },
  ],
}

/**
 * 峨眉山：「峨眉山月半轮秋，影入平羌江水流」。主峰按宏观地形实测海拔，山形不动；
 * 金顶一座黄琉璃殿与观景亭，东麓江边报国寺（山门、殿），一条石阶自报国寺折上金顶；东边是平羌江（青衣江）。
 */
const EMEI: LandmarkDefinition = {
  id: 'emei',
  name: '峨眉山',
  coordinate: { lng: 103.33, lat: 29.52 },
  radius: 50,
  major: true,
  poetryPlaceId: 'p093',
  levelMode: 'summit',
  terrainModifier: [
    { t: 'flatten', x: 0, z: 0, r: 8, blend: 4 },
    { t: 'path', pts: [[30, 26], [22, 18], [26, 10], [16, 6], [12, 0], [4, 0]], w: 1.1 },
  ],
  structures: [
    { b: 'hall', x: 0, z: 0, atLevel: true, p: { width: 9, depth: 7, tile: 'yellow', terrace: 1, lanterns: true } },
    { b: 'pavilion', x: -8, z: 6, atLevel: true, dy: -2, p: { width: 5, tile: 'gray' } },
    { b: 'hall', x: 32, z: 30, rot: 3, p: { width: 9, depth: 7, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'archway', x: 26, z: 34, rot: 1, p: { tile: 'gray' } },
  ],
  vegetationProfile: { weights: { pine: 4, broadleaf: 3, bamboo: 2 }, density: 1.2 },
  // 定稿机位：江月（入夜自江东岸望峨眉，月在西南天边）、金顶、报国寺
  shots: [
    { id: 'hero', name: '江月', yaw: 1.4, pitch: 0.18, distance: 160, offset: [10, -20, 10] },
    { id: 'summit', name: '金顶', yaw: 0.8, pitch: 0.4, distance: 50, offset: [0, 2, 0] },
    { id: 'temple', name: '报国寺', yaw: 1.0, pitch: 0.8, distance: 50, offset: [32, -62, 30] },
  ],
}

/**
 * 华山：「岧峣太华俯咸京，天外三峰削不成」。主峰按宏观地形实测海拔，峰腰已有冲沟岩脊；
 * 峰顶一座重檐亭（西峰），东西两侧小峰各一亭，北麓河谷玉泉院（殿、牌坊），一条石阶自北麓攀上（苍龙岭）。
 */
const HUASHAN: LandmarkDefinition = {
  id: 'huashan',
  name: '华山',
  coordinate: { lng: 110.17, lat: 34.515 },
  radius: 46,
  major: true,
  poetryPlaceId: 'p071',
  levelMode: 'summit',
  // 不平整峰顶：平整的过渡坡会把偏南几格的真峰顶削掉（华山的峰高按实测校准）
  terrainModifier: [
    { t: 'path', pts: [[2, 30], [-4, 24], [4, 18], [-2, 12], [2, 6], [0, 3]], w: 1.1 },
  ],
  structures: [
    { b: 'pavilion', x: 0, z: 0, p: { width: 5, double: true, tile: 'gray' } },
    { b: 'pavilion', x: -12, z: 6, p: { width: 3, tile: 'gray' } },
    { b: 'pavilion', x: 12, z: 8, p: { width: 3, tile: 'gray' } },
    { b: 'hall', x: 0, z: 36, rot: 2, p: { width: 9, depth: 7, tile: 'gray', terrace: 1, lanterns: true } },
    { b: 'archway', x: 0, z: 44, p: { tile: 'gray' } },
  ],
  vegetationProfile: { weights: { pine: 6, broadleaf: 1 }, density: 0.9 },
  shots: [
    { id: 'hero', name: '主景', yaw: 3.0, pitch: 0.22, distance: 140, offset: [0, -10, 10] },
    { id: 'summit', name: '西峰', yaw: 2.6, pitch: 0.45, distance: 46, offset: [0, 2, 0] },
    { id: 'temple', name: '玉泉院', yaw: 0.2, pitch: 0.7, distance: 50, offset: [0, 0, 38] },
  ],
}

export const CITY_CATALOG: readonly LandmarkDefinition[] = [HUANGHELOU, YUEYANGLOU, TENGWANGGE, GUANQUELOU, DUOJINGLOU, JINLING, LUOYANG, CHENGDU, SUZHOU, HUANGZHOU, YANGZHOU, BIANJING, SHANYIN, MIZHOU, CHUZHOU, XIANGYANG, JUNSHAN, PENGCHENG, HUIZHOU, BAIDICHENG, TAISHAN, JIANMEN, FENGQIAO, ZHONGNAN, WANGCHUAN, LANTING, TIANMU, EMEI, HUASHAN]
