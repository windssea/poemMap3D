# 山河诗卷 · Greenfield 重写

一个小型 Minecraft 式中国诗词体素世界引擎 + React 文化内容应用。先秦至宋 325 首诗词、155 处地点，落在同一套方块网格上的中国山河里。

技术栈：React 19 + TypeScript + Vite + 原生 Three.js（WebGL 2，模块化 Worker）。

## 新旧项目关系

```text
Legacy poemMap3D（legacy/）
        │
        ├─ 功能参考
        ├─ 视觉参考
        └─ 数据参考 ── tools/import-legacy.mjs 清洗导入 ──▶ public/data、public/fonts
             │
             ▼
New poemMap3D（src/）
        │
        ├─ 不继承旧运行架构
        ├─ 不兼容旧 API
        ├─ 不迁移旧 Mesh
        ├─ 不迁移旧全局状态
        └─ 从零构建世界引擎
```

`legacy/` 保留旧项目原样，只供阅读需求、视觉与数据；新代码不引用其中任何文件。

## 运行

```bash
npm install
npm run dev            # http://localhost:5188
npm run build          # 类型检查 + 生产构建到 dist/
npm test               # Vitest：方块、区块、网格化、生成、树、结构、地标
npm run import-legacy  # 重新从 legacy/ 导出诗词、地点、足迹、巡游、掩膜与字体
```

地址参数：`?lab=tree` 树木样板（TreeLab）；`?debug` 打开区块边界与地形取样；`?q=low|mid|high` 指定画质。

## 架构

```text
React UI ──EngineFacade / AppStore──▶ Application（Poetry · Tour · PoetTrail · Settings）
                                            │
                                            ▼
                         Three.js Engine（Renderer · Camera · Interaction · Environment · Effects · WorldManager）
                                            │
                                            ▼
                         Voxel World（Block · Chunk · Generation · Terrain · Water · Biome · Structure · Vegetation · Building · Landmark · Overview）
```

- **统一方块网格**：地形、树、建筑、城墙、地标全部在同一个整数 Block 网格上；渲染坐标 = 方块坐标 × `WORLD_RENDER_SCALE`。
- **Block / BlockState**：`FULL_CUBE · SLAB · STAIRS · POST · FENCE · PANE · CROSS_PLANT · LIQUID · CUSTOM_VOXEL`；朝向、半砖、轴向打包在 16 位状态里。渲染层 `Solid · Cutout · Translucent · Effect`。
- **Chunk**：16×16 列、16×16×16 段，整段相同时不分配数组（调色板思路）；生命周期 `UNLOADED → … → VISIBLE → DIRTY → REMESH`。
- **Meshing**：六面剔除、贪心合并、Minecraft 式顶点 AO、楼梯内外角；各层分网格；顶点压成 Int16。
- **世界生成**（`src/world/generation`）：聚焦投影 → 陆地掩膜 → 宏观海拔 → 山脉名山 → 噪声 → 热侵蚀 → 生物群系 → 地表分层 → 江河下切 → 注水 → 地标预留 → 结构 → 植被 → 地被 → 网格化。全部是世界坐标的纯函数：Worker 直接生成「区块 + 外边一圈」，与邻居严丝合缝。
- **结构**：`VoxelStructure` 支持旋转、镜像、平移、包围盒；`StructurePlacer` 跨区块裁剪、地基、削坡；占用图登记建筑、入口与视线通道。
- **建筑**：数据驱动的 `BuildingRegistry`；`ChineseRoofBuilder` 生成悬山、歇山、庑殿、攒尖、塔檐、复檐；斗拱承托出檐。
- **植物**：阔叶、松、柳、桃、竹丛，自下而上（根 → 干 → 枝 → 冠团 → 叶 / 花 / 柳丝），无漂浮方块；`TreePlacementSystem` 只决定种什么、种在哪。
- **地标**：手工营造——杭州、庐山（三叠泉：自砌陡崖、三叠飞瀑）、长安；名楼黄鹤楼（蛇山、十字抱厦十字脊）、岳阳楼（城台盔顶面洞庭）、滕王阁（高台挟屋面赣江）、鹳雀楼、多景楼（北固山甘露寺）；名城金陵（秦淮、夫子庙、钟山、报恩寺琉璃塔、凤凰台）、黄州（东坡赤壁、雪堂、临皋亭）、扬州（瘦西湖、五亭桥、二十四桥、白塔、平山堂）、汴京（宣德门、御街、州桥、大相国寺、樊楼、铁塔）、山阴（沈园、兰亭曲水）、密州（超然台）、洛阳（洛水穿城、天津桥、明堂、南市、白马寺）、成都（散花楼、锦江万里桥、草堂、武侯祠）、苏州（水巷拱桥、园林水榭游廊假山、北寺塔）。其余地点按诗作多少与地名自动成聚落（楼、阁、台、亭、寺各有形制，以山为名的在山巅设重檐亭）；长城为沿山脊的线性结构。落在江心的名楼自动挪到岸上，洛阳这类允许江河穿城，城墙在水上留水门，桥自动找河跨过。
- **机位**：手工名胜用定稿机位；其余由 `CameraDesigner` 在 16 个方位 × 3 俯角 × 2 距离里按视线遮挡（含树冠）、离地高度、朝南、前景有水、不进雾打分挑选。
- **边缘雾**：地图四边、离岸两百格以外的远海、海南以南全部渐隐入雾（雾图由宏观陆地距离变换生成，着色器取样混雾），全隐处不生成区块，镜头止于雾边；海南以南没有陆地。
- **远近四级，一套数据**：近景原分辨率区块 → 远景（同一生成结果 2×2×2 合并）→ 远景片（4×4 区块一片，每 4 格取一列地形，树与建筑按格合并，铺满整个画面）→ 全国覆盖图。每级在更细一级已显示处按区块掩膜让位（255 近景 / 128 远景片），装好即显示、不淡入，拖动不露天色。远景 2×2 区块一片、远景片 8×8 区块一片以减少绘制调用；范围扫描只在焦点或半径变了时做，掩膜只刷新变了的区块；Worker 队列有序、定时重排；近景半径随视距变化带回差，细节圈中心偏向镜头。调度视锥优先；焦点按镜头速度前移预读，飞行时目的地提前排队。
- **地域地貌与气候**：喀斯特峰林（桂林、广西、黔南滇东）、黄土沟壑与梯田、沙漠沙丘、巴蜀紫色土、东北黑土与针阔林海（白桦）、岭南常绿（椰棕）；秦岭—淮河以南水田、以北麦田。冬季积雪按纬度与海拔（`world/climate/Climate.ts`，着色器与主线程共用）：北方满覆、江南薄、岭南不积雪、高山皆雪，南方落叶与秋色也随之减弱。
- **江河水位**：主要江河用沿程实测水面海拔插值（`RiverDef.levels`），不再由宏观网格推算；地势低于水位处自动筑缓坡堤岸。海拔以 `tests/elevation.test.ts` 校验名山与城市。
- **市井生机**（`engine/effects/LifeSystem.ts`）：镜头推近一处地方时，街巷行人、摊贩与看货人、屋顶炊烟、盘旋飞鸟；附近江河湖上渔舟、客船、画舫，沿海明代福船式海船。全是方块拼成的小模型：士人（幞头、交领广袖长袍）、女子（高髻金簪、襦裙披帛）、劳作者（斗笠短褐），渔舟上有垂钓的渔翁，客船上有摇橹的艄公。
- **背景音**（`app/AmbientSound.ts`）：Web Audio 程序合成，不用音频文件——风、松风、寒风、雨（含雨滴）、山溪、鸟鸣、夏蝉、秋虫（噪声类压在两千多赫兹以下，不刺耳）；古乐三套：古琴、竹笛、琴瑟笛合奏（五声音阶即兴，厅堂混响）。「随境」按季节、时辰、天气自动调配，也可固定为松风、夜雨、山溪、夏蝉、秋虫；页面隐藏时暂停。
- **自动取景**：工具条开关（默认开），关掉后点地名只展开诗目、镜头不动；调试面板改由地址栏 `?debug` 打开。
- **浏览器缓存与预热**：生成过的区块（网格与方块数据）存进 IndexedDB（`workers/ChunkStore.ts`），按构建号作废；Worker 空闲时预先生成名胜周围的区块（`world/ChunkWarmer.ts`）。第二次到同一处，平均每块生成耗时从约 6 毫秒降到约 1 毫秒。
- **植被群落**：密林、林缘（小树）、疏林、空地四类空间，整体密度收约两成；地标核心不栽自然乔木、外圈只栽小树；一半水岸不栽乔木，岸边柳树约占六成；地被草花芦苇卵石减少约四成五。岸型分草岸、浅滩、岩岸、湿地四种。山地按成片岩区露岩，不再草土岩横条交替；起伏大的山体做 7 格一级的台层退让。夏季浅湖浅塘有荷叶荷花（春秋稀、冬无）；冬季北方落叶树叶子落尽。远处空气透视：褪色、减反差、偏蓝灰。
- **色彩**：树种分色（松冷深绿、阔叶石绿、柳浅青绿、竹青黄），草色压向灰黄绿，低于树冠饱和度；黄琉璃改古金。
- **区块裙边**：区块四周的侧面在地表以下画几格裙边，相邻区块精度不同或尚未载入时不露白缝。
- **光影**：顶点 AO（网格生成时，Minecraft 式四角 0–3 级，半砖顶、楼梯踏面也算）+ 面向明暗 + 动态太阳为主；级联阴影（「衡」两级 1024、「高」三级 2048），草、芦苇、花、庄稼（地被层）与远景不投影，树叶只在近处投影；重点地标的天空可见度烘焙只乘间接光（`AmbientBaker`）；0–15 级天空光 / 方块光数据结构已备（`world/light/VoxelLight.ts`）；「高」画质另有低强度 GTAO；「衡」「高」有泛光与调色。前后对比与性能数据见 `doc/lighting/README.md`。
- **环境**：晨昼暮夜 × 四季 × 晴雨雪，只改共享 uniform：光照、天空（方形日月、星）、线性雾、方块云、积雪、秋色、花期、雨雪与飘叶、瀑布水雾。
- **镜头**：环绕、飞行（远渡升高、沿途净空）、聚焦、避山（`WorldSampler.surfaceHeightAt`）、全国 / 区域 / 地点三级。
- **色彩**：唯一来源 `src/config/palette.ts`。地表按「生物群系 × 海拔 × 纬度」取千里江山图分区色（黄绿田、稻绿、石绿、石青、高山草甸），岩层蓝灰；装裱纹理（宣纸、云纹锦、木轴）也由调色板生成，界面只引用 CSS 变量。
- **诗词展示**（承袭旧版）：点地名先出诗目（锦边纸笺、引线指向地点），一首则直接展卷；诗卷为右起手卷（包首签条、引首地名、画心名句点朱、题跋译文赏析诗话注释小传、木轴），可滚轮横读、拖动；巡游与足迹用题诗立轴逐列写出。
- **诗人足迹**：光带逐段画出，镜头跟随笔头，到站题诗、说明卡与站点标记，意境随一生四季，结束后整体取景。
- **城池与江河**：带城墙的地标自动让开河湖；三峡段江面收窄、两岸起峭壁。

## 调试工具

- **TreeLab**（`?lab=tree`）：树种、变体、种子、方块数、包围盒、冠幅、连通块；正面 / 侧面 / 俯视 / 斜上。
- **TerrainLab**（调试开关后悬停）：区块、方块坐标、高度、坡度、生物群系、离水、占用、候选树。
- **ChunkDebug**：区块边界（按状态着色）、Worker 忙闲与队列、生成与网格耗时、三角形数。

## 开发规则（AI 与人都适用）

```text
这是一个 Greenfield Rewrite。
不要尝试迁移、包装、兼容或渐进式重构旧 index.html。
旧项目只用于阅读需求、视觉风格、诗词/地点数据和交互功能。
任何旧函数、旧全局变量、旧 Mesh Builder、旧 Shader、旧 DOM 操作都不是新项目的设计约束。
所有功能必须基于新架构重新实现。优先构建体素世界底层，而不是优先复刻 UI。
禁止直接在业务模块中 scene.add()（统一经 SceneManager.attach）。
禁止一个方块一个 Mesh。禁止一棵树一个 React 组件。
禁止植物、建筑和地形使用三套不同的体素坐标。
禁止 TreeManager 直接构建 Three.js Geometry。禁止 BuildingManager 直接操作 React。
禁止 Poetry 模块持有 Three.js Object。
所有世界对象必须归属于统一的 World / Chunk / Block / Structure 系统。
任何新增功能都必须先明确属于：Block、Chunk、Structure、World Generation、Engine、Feature 或 UI 中的哪一层。
```

## 目录

```text
src/
├─ app/          bootstrap、AppStore、AppEvents、EngineFacade
├─ engine/       core · rendering · camera · interaction · environment · effects
├─ world/        coordinate · block · chunk · voxel · generation · biome · terrain · water
│                vegetation · structure · building · landmark · overview · World / WorldManager / WorldSampler
├─ features/     poetry · tour · poetTrail
├─ ui/           React 组件与样式
├─ workers/      chunk-generator.worker · chunk-mesher.worker
├─ devtools/     TreeLab · DebugPanel · ChunkDebugOverlay
├─ config/       palette
└─ utils/
```

## 字体

马善政毛笔楷书（SIL OFL 1.1，见 `public/fonts/OFL.txt`）：界面子集首屏加载，诗卷用字空闲时加载；缺失时退回系统楷体。
