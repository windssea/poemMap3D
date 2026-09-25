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
- **地标**：杭州、庐山、长安三处手工样板（地形、建筑、植被、水面、取景各不相同），其余地点按诗作多少自动成聚落；长城为沿山脊的线性结构。
- **远近两种表示，一套数据**：近景物化区块（Worker 生成与网格化、按距离与视锥排队、节流上传、缓存卸载）；全国为覆盖图（顶面、宏观地形、水、林色、名胜体量代理、江河长城墨线），按区块掩膜淡出让位。
- **环境**：晨昼暮夜 × 四季 × 晴雨雪，只改共享 uniform：光照、天空（方形日月、星）、线性雾、方块云、积雪、秋色、花期、雨雪与飘叶、瀑布水雾。
- **镜头**：环绕、飞行（远渡升高、沿途净空）、聚焦、避山（`WorldSampler.surfaceHeightAt`）、全国 / 区域 / 地点三级。
- **色彩**：唯一来源 `src/config/palette.ts`（石青、石绿、黛青、宣纸白、古金、朱砂红及材质、生物群系、季节、天气色）；界面通过 CSS 变量取色。

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
