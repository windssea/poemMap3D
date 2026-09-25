# 《山河诗卷》Greenfield 全量重写架构方案

> 技术栈：React + TypeScript + Vite + 原生 Three.js  
> 项目策略：**完全重写，不迁移旧架构，不兼容旧 API，不复用旧全局状态，不逐文件搬运旧代码。**  
> 旧项目仅作为三类参考：
>
> 1. 功能需求清单；
> 2. 视觉与色彩风格；
> 3. 可验证的数据资产（诗词、地点、经纬度、地图掩膜等，经过清洗后重新导入）。
>
> 体素世界设计原则参考 Minecraft 的成熟思路：  
> **Block → BlockState → Chunk → ChunkSection → Biome → World Generation → Structure → Meshing → Render Layer → Streaming**。
>
> 不复制 Minecraft 的代码、贴图或资产，仅采用其体素世界架构思想。

---

# 1. 重写目标

新项目不是“把旧 `index.html` 拆成很多 TypeScript 文件”。

新项目从零设计一套真正的 3D 体素世界引擎，并在其上实现：

- 中国地图
- 体素山地
- 江河湖泊
- 中国古建筑
- 五类植物
- 文化地标
- 诗词数据与搜索
- 地点聚焦
- 相机交互
- 诗人足迹
- 自动巡游
- 昼夜
- 四季
- 晴雨雪
- 云雾粒子
- 标签布局
- 全国 / 区域 / 地点三级视角
- 调试工具
- 性能等级

旧项目的函数名、目录、全局变量、渲染流程、几何构建方式均不作为新架构约束。

---

# 2. 最高级原则

## 2.1 Legacy 只作为 Product Spec

旧项目禁止直接复制以下内容：

- 全局 `window.*`
- 大量共享数组
- 直接 `scene.add()`
- DOM 操作与 Three.js 混合
- 每个功能自己创建 Mesh
- 每种植物单独一套几何逻辑
- 建筑与地形使用不同坐标尺度
- 相机直接读取某个业务模块内部变量
- UI 直接操作 Scene Object

可以参考：

- 需求
- 色彩
- 功能
- 地标
- 诗词
- 交互体验
- 已验证的视觉方向

---

# 3. 总体架构

```text
React UI
│
│  EngineFacade / AppStore
▼
Application Layer
│
├─ Poetry
├─ Landmark
├─ Tour
├─ PoetTrail
└─ Settings
│
▼
Three.js Engine
│
├─ Renderer
├─ Camera
├─ Interaction
├─ Environment
├─ Effects
└─ WorldManager
     │
     ▼
Voxel World
     │
     ├─ Block System
     ├─ Chunk System
     ├─ World Generator
     ├─ Terrain
     ├─ Water
     ├─ Biome
     ├─ Structure
     ├─ Vegetation
     ├─ Building
     └─ Landmark
```

---

# 4. React 与 Three.js 边界

React 只负责 UI。

React 不负责：

- 树
- 山
- 水
- 建筑
- Chunk
- Mesh
- Shader 生命周期
- Animation Loop

Three.js Engine 是独立运行时。

React 中只存在一个世界容器：

```tsx
<WorldCanvas />
```

其他均为 UI：

```tsx
<App>
  <WorldCanvas />

  <Brand />
  <SearchPanel />
  <ViewSwitcher />
  <PoetryPanel />
  <AmbienceControls />
  <TourControls />
  <TrailPanel />
  <LoadingScreen />
</App>
```

React 通过 `EngineFacade` 与引擎通信。

---

# 5. 推荐目录

```text
src/
├─ main.tsx
├─ App.tsx
│
├─ app/
│  ├─ bootstrap.ts
│  ├─ AppStore.ts
│  ├─ AppEvents.ts
│  └─ EngineFacade.ts
│
├─ engine/
│  ├─ core/
│  │  ├─ Engine.ts
│  │  ├─ RenderLoop.ts
│  │  ├─ FrameContext.ts
│  │  ├─ ResourceManager.ts
│  │  ├─ EventBus.ts
│  │  └─ Disposable.ts
│  │
│  ├─ rendering/
│  │  ├─ RendererManager.ts
│  │  ├─ SceneManager.ts
│  │  ├─ RenderPipeline.ts
│  │  ├─ MaterialLibrary.ts
│  │  ├─ ShaderLibrary.ts
│  │  ├─ ShadowManager.ts
│  │  └─ QualityManager.ts
│  │
│  ├─ camera/
│  │  ├─ CameraController.ts
│  │  ├─ OrbitController.ts
│  │  ├─ FlightController.ts
│  │  ├─ FocusController.ts
│  │  ├─ CollisionResolver.ts
│  │  └─ CameraPresetRepository.ts
│  │
│  ├─ interaction/
│  │  ├─ InputController.ts
│  │  ├─ RaycastSystem.ts
│  │  ├─ SelectionSystem.ts
│  │  └─ HoverSystem.ts
│  │
│  └─ environment/
│     ├─ EnvironmentManager.ts
│     ├─ TimeOfDaySystem.ts
│     ├─ SeasonSystem.ts
│     ├─ WeatherSystem.ts
│     ├─ SkySystem.ts
│     ├─ FogSystem.ts
│     ├─ CloudSystem.ts
│     ├─ PrecipitationSystem.ts
│     └─ ParticleSystem.ts
│
├─ world/
│  ├─ World.ts
│  ├─ WorldManager.ts
│  ├─ WorldSampler.ts
│  ├─ WorldConfig.ts
│  │
│  ├─ coordinate/
│  ├─ block/
│  ├─ chunk/
│  ├─ voxel/
│  ├─ generation/
│  ├─ biome/
│  ├─ terrain/
│  ├─ water/
│  ├─ vegetation/
│  ├─ structure/
│  ├─ building/
│  ├─ landmark/
│  └─ overview/
│
├─ features/
│  ├─ poetry/
│  ├─ tour/
│  └─ poetTrail/
│
├─ ui/
├─ shaders/
├─ workers/
├─ devtools/
├─ config/
└─ utils/
```

---

# 6. Minecraft 风格的体素核心

这是项目最重要的底座。

## 6.1 世界逻辑单位

整个世界统一为：

```text
Block X
Block Y
Block Z
```

所有逻辑坐标均为整数。

禁止存在：

- 地形一套 voxel 尺寸
- 树木一套 voxel 尺寸
- 建筑一套 voxel 尺寸
- 地标局部 patch 又一套尺寸

所有结构都在同一个 Block Grid 上。

Three.js 世界坐标仅负责渲染：

```ts
renderPosition = blockPosition * WORLD_RENDER_SCALE
```

---

# 7. Block System

## BlockDefinition

```ts
interface BlockDefinition {
  id: BlockId
  name: string

  shape: BlockShape
  renderLayer: BlockRenderLayer

  solid: boolean
  opaque: boolean
  liquid: boolean
  replaceable: boolean
  occludesNeighbor: boolean

  castsShadow: boolean
  receivesAO: boolean

  tags: readonly BlockTag[]
  materialKey: string
}
```

## Block Render Layer

```ts
enum BlockRenderLayer {
  Solid,
  Cutout,
  Translucent,
  Effect
}
```

### Solid

- stone
- dirt
- grass
- wood
- wall
- roof
- snow

### Cutout

- leaf
- bamboo leaf
- grass
- reed
- blossom

### Translucent

- water
- ice

### Effect

- lantern glow
- waterfall mist

---

# 8. BlockState

方向、半砖、朝向等都不通过新 Mesh 表达。

```ts
interface BlockState {
  id: BlockId

  facing?: Direction
  axis?: Axis
  half?: 'top' | 'bottom'

  variant?: number
  level?: number
}
```

例如：

```text
ROOF_STAIR
facing = east
half = top
```

---

# 9. Block Shape

```text
FULL_CUBE
SLAB
STAIRS
POST
FENCE
PANE
CROSS_PLANT
LIQUID
CUSTOM_VOXEL
```

中国古建筑尽可能使用 Minecraft 风格 Block Shape 拼装。

例如：

```text
柱 = POST
墙 = FULL_CUBE
窗 = PANE
台基 = SLAB
屋瓦 = STAIRS
屋脊 = SLAB / CUSTOM_VOXEL
栏杆 = FENCE
```

---

# 10. Chunk System

建议初始采用：

```text
Chunk XZ = 16 × 16
ChunkSection = 16 × 16 × 16
```

```ts
class Chunk {
  cx: number
  cz: number

  sections: Map<number, ChunkSection>

  heightmap: Uint16Array
  biomeMap: Uint8Array

  state: ChunkState
}
```

```ts
class ChunkSection {
  blocks: Uint16Array
}
```

---

# 11. Chunk 生命周期

```text
UNLOADED
→ REQUESTED
→ GENERATING
→ GENERATED
→ DECORATING
→ MESHING
→ READY
→ VISIBLE
→ DIRTY
→ REMESH
```

ChunkManager 负责：

- Streaming
- Generation queue
- Mesh queue
- Worker 调度
- Cache
- Unload
- Dirty propagation
- Neighbor invalidation
- GPU upload

---

# 12. 全国地图与 Chunk World

这是《山河诗卷》与 Minecraft 最大差异。

用户需要：

```text
全国
→ 区域
→ 城市
→ 地标
```

因此采用：

## 一套 World Data

但拥有两种 Render Representation。

### Overview Renderer

全国视图。

输入：

```text
heightmap
top block
biome
water
major landmarks
```

输出低成本全国代理。

### Detail Chunk Renderer

区域和地点近景。

渲染真实：

```text
Chunk
Block
Tree
Building
River
```

相机推进时：

```text
Overview fade out
Detail Chunk fade in
```

不是两套世界数据。

---

# 13. 世界规模

不要直接使用真实公里比例。

采用艺术化中国地图尺度。

例如：

```text
中国整体映射到固定逻辑 Block Grid
```

具体 Grid 大小必须通过性能原型决定，不在架构阶段硬编码。

原则：

- 足够让主要地理关系成立
- 足够让杭州、西安等地点之间保留明显空间距离
- 仍能让建筑使用几十个 Block 表现
- 只有相机附近的 Chunk 真正物化
- 全国远景通过 Overview 表示

---

# 14. World Generation

新项目从零实现固定 Pipeline：

```text
Geography
↓
Land Mask
↓
Macro Height
↓
Mountain Range
↓
Noise Detail
↓
Erosion
↓
Biome
↓
Terrain Block Fill
↓
River Carving
↓
Water Fill
↓
Landmark Reservation
↓
Structure Placement
↓
Vegetation Decoration
↓
Ground Decoration
↓
Chunk Meshing
```

---

# 15. Geography

GeoProjection 负责：

```ts
interface GeoProjection {
  project(lng: number, lat: number): WorldXZ
  unproject(x: number, z: number): GeoPoint
}
```

允许使用艺术化聚焦投影。

要求：

- 中国轮廓仍可识别
- 东部诗词密集区可以适度放大
- 西部适度压缩
- 地点相对关系保持合理

---

# 16. Terrain System

TerrainManager 只负责世界地形数据。

输入：

- Land Mask
- Mountain ranges
- Famous mountains
- Plateau
- Desert
- Steppe
- Lakes
- River network
- Noise
- Seed

输出：

```ts
interface TerrainSample {
  surfaceY: number
  slope: number
  biome: BiomeId

  topBlock: BlockId
  soilBlock: BlockId
  rockBlock: BlockId
}
```

TerrainManager 不创建 Three.Mesh。

---

# 17. Biome System

建议：

```text
Mountain
Hillside
Plain
Riverside
Wetland
Garden
Plateau
Steppe
Desert
Gobi
Cliff
Snow
```

BiomeResolver 输入：

```text
lat
lng
height
slope
waterDistance
landmarkRegion
macro geography
noise
```

Biome 决定：

- surface blocks
- tree type
- vegetation density
- grass
- rock
- snow
- tint
- ground decoration

---

# 18. River / Water

拆为：

```text
RiverManager
RiverCarver
WaterManager
ShorelineSystem
WaterRenderer
```

RiverCarver：

- 河中心
- 河宽
- 深度
- 河床
- 湖泊
- 河口

Shoreline：

- 浅滩
- 湿地
- 岸高
- 芦苇候选
- 柳树候选
- 卵石
- 岸边草

逻辑层水仍然是 Block。

视觉层可以用独立 Shader 表现连续水面。

---

# 19. Voxel Structure

Minecraft 风格架构里：

- 树
- 建筑
- 桥
- 塔
- 城墙
- 亭子

都属于 Structure。

```ts
interface VoxelStructure {
  size: Vec3i
  blocks: StructureBlock[]
}
```

能力：

```text
rotate
mirror
translate
bounds
```

---

# 20. Structure Placement

StructurePlacer 负责：

- 放置到 Chunk
- 跨 Chunk
- terrain alignment
- occupancy
- collision
- entrance clearance
- sightline reservation

---

# 21. Building System

从零设计数据驱动建筑系统。

```text
BuildingRegistry
BuildingDefinition
BuildingFactory
ChineseRoofBuilder
StructurePlacer
```

核心建筑：

```text
house
hall
pavilion
pagoda
gate
wall
tower
bridge
stupa
terrace
hut
```

---

# 22. Chinese Roof System

中国建筑的核心是屋顶。

单独设计：

```ts
ChineseRoofBuilder
```

支持：

- 歇山
- 悬山
- 庑殿
- 攒尖
- 塔檐
- 楼阁复檐

输入：

```text
width
depth
roof type
orientation
floor count
tile material
ridge material
eave depth
```

输出：

```text
VoxelStructure
```

---

# 23. Tree System

树木完全作为 Voxel Structure。

TreeManager 不创建 Three.js Geometry。

流程：

```text
TreeDefinition
↓
TreeStructureFactory
↓
VoxelStructure
↓
StructurePlacer
↓
Chunk blocks
```

---

# 24. 五类植物

## Broadleaf

结构：

```text
root
trunk
3~5 primary branches
main crown
side crowns
top crown
```

避免单一扁平方块树冠。

## Pine

```text
central trunk
lower branches
middle branches
upper branches
top crown
```

提供：

- 矮壮山松
- 直立山松
- 横枝景观松

## Willow

必须严格避免：

```text
顶部一个大方块
+
下面一排等长垂直叶条
```

结构：

```text
root
crooked trunk
3~5 primary branches
irregular crown clusters
hanging leaf chains attached to branches
```

柳条：

- 起点不同
- 长度不同
- 有折线
- 有疏密
- 外围长、内部短

## Peach

```text
short trunk
2~4 branches
secondary branches
blossom clusters
```

花簇围绕枝条。

## Bamboo

```text
BambooGrove
├─ mature bamboo
├─ medium bamboo
├─ young bamboo
└─ leaf clusters
```

按“竹丛”生成，不按直线排列。

---

# 25. TreeDefinition

```ts
interface TreeDefinition {
  id: TreeType

  variants: number

  minHeight: number
  maxHeight: number

  allowedBiomes: BiomeId[]

  minSpacing: number

  factory: TreeStructureFactory
}
```

随机使用：

```text
worldSeed
chunk
local coordinate
tree type
variant
```

必须 deterministic。

---

# 26. Tree Placement

和“树如何长”完全分离。

TreePlacementSystem 只回答：

```text
这里应该种什么？
是否应该种？
密度多少？
```

判断：

- biome
- slope
- water distance
- altitude
- building occupancy
- landmark entrance
- sightline
- crown spacing
- grove density

---

# 27. Landmark System

Landmark 不只是一个建筑。

例如杭州：

```text
Hangzhou Landmark
├─ Terrain Modifier
├─ West Lake
├─ Bridge
├─ Pagoda
├─ Pavilion
├─ Garden Biome
├─ Willow Profile
├─ Peach Profile
├─ Camera Preset
└─ Poetry Anchor
```

```ts
interface LandmarkDefinition {
  id: string

  coordinate: GeoPoint

  terrainModifier?: TerrainModifier

  structures: StructurePlacement[]

  biomeOverride?: BiomeOverride

  vegetationProfile?: VegetationProfile

  cameraPreset?: CameraPreset

  poetryPlaceId: string
}
```

---

# 28. Occupancy / Sightline

从一开始就作为正式系统。

```text
OccupancyMap
EntranceClearance
SightlineMap
```

用途：

- 禁止树长到房子里
- 禁止植物挡入口
- 禁止树冠遮挡核心地标
- 相机能得到清晰构图

不要运行后扫描 Mesh BoundingBox 来推断占用。

---

# 29. Poetry Domain

诗词完全独立于 Three.js。

```text
PoetryRepository
PoetrySearchService
PlaceRepository
PlaceAggregator
PoetryNavigationService
```

Poem：

```ts
interface Poem {
  id: string
  title: string
  dynasty: string
  author: string

  placeId: string

  lines: string[]

  translation?: string
  appreciation?: string
  notes?: string[]
}
```

World 只通过 `placeId` 与 Poetry 关联。

---

# 30. Camera

```text
CameraController
├─ OrbitController
├─ FlightController
├─ FocusController
└─ CollisionResolver
```

CameraController 不知道诗词。

诗词导航只调用：

```ts
engine.focusLandmark(id)
```

CollisionResolver 通过：

```ts
WorldSampler.surfaceHeightAt()
```

避免穿山。

---

# 31. Camera Level

建议明确三个 Level：

```text
National
Regional
Local
```

National：

- Overview
- 主要标签
- Landmark Proxy

Regional：

- Detailed terrain
- city clusters
- rivers
- forests

Local：

- buildings
- detailed trees
- poetry focus
- particles
- high-detail water

---

# 32. Time / Weather / Season

EnvironmentManager：

```text
TimeOfDay
Season
Weather
```

## Time

```text
dawn
day
dusk
night
```

## Season

```text
spring
summer
autumn
winter
```

## Weather

```text
clear
rain
snow
```

统一驱动：

- light
- sky
- fog
- water
- vegetation tint
- snow
- clouds
- particles
- ambient audio

---

# 33. Color Style

仅继承旧项目的视觉方向，不继承 Shader 实现。

核心颜色：

```text
石青 #276B83
石绿 #4F8062
黛青 #263E47
宣纸白 #F2EAD8
古金 #B89A64
朱砂红 #A43D32
```

重新创建新的：

```text
Palette
Material Tokens
Biome Tint
Season Tint
Weather Tint
```

禁止在业务代码散落十六进制色值。

---

# 34. Voxel Meshing

必须从第一版就做正确。

## Face Culling

六面检测。

相邻实体方块：

```text
内部面不生成
```

## Greedy Meshing

大量相同表面合并。

## Render Layer Separate Mesh

每 Chunk：

```text
solid
cutout
translucent
effect
```

## AO

实现简单 Minecraft-style vertex AO。

这会极大提升方块山体、屋檐、树冠的层次。

---

# 35. Overview Renderer

为了全国视图：

```text
Chunk Surface Data
↓
Overview Tile
↓
全国 Overview Mesh
```

Overview 不包含：

- 完整树
- 复杂建筑
- 每个 Block

只包含：

- top surface
- macro terrain
- water
- forest tint
- landmark proxies

---

# 36. Worker

从项目第一阶段就预留。

## chunk-generator.worker

负责：

- terrain
- biome
- blocks
- river
- vegetation candidates

## chunk-mesher.worker

负责：

- face culling
- greedy mesh
- AO
- typed arrays

主线程负责：

- BufferGeometry
- GPU
- camera
- UI
- interactions

---

# 37. ResourceManager

统一加载：

- poetry data
- geo data
- land mask
- textures
- fonts
- shaders
- landmark definitions
- building definitions

提供：

```text
cache
preload
lazy load
dispose
progress
```

---

# 38. UI

React Store 保存：

```text
selectedPlaceId
selectedPoemId
search
panelState
cameraLevel
season
weather
time
quality
tourState
trailState
```

不保存：

```text
Mesh
Scene
Camera
Chunk
Material
Geometry
```

---

# 39. EngineFacade

React 唯一操作引擎的接口。

```ts
interface EngineFacade {
  focusLandmark(id: string): void

  setTime(time: TimeOfDay): void
  setSeason(season: Season): void
  setWeather(weather: Weather): void

  startTour(): void
  stopTour(): void

  showPoetTrail(poetId: string): void

  setQuality(level: Quality): void
}
```

---

# 40. Debug Tools

从第一阶段就开发。

## TreeLab

必须显示：

- Tree type
- Variant
- Seed
- Block count
- Bounds
- Crown size
- Connected component
- front/side/top view

## TerrainLab

显示：

- chunk
- block coordinate
- height
- slope
- biome
- water distance
- occupancy
- tree candidate

## ChunkDebug

显示：

- Chunk boundary
- State
- Worker status
- Mesh build time
- triangles
- block count

---

# 41. 测试

从零重写的最大优势是可以从第一天写测试。

## Block

- ID 唯一
- state rotate
- shape

## Chunk

- coordinate conversion
- negative coordinate
- edge neighbor

## Meshing

- one cube
- adjacent cubes
- greedy plane
- transparent neighbor

## Generator

相同 seed：

```text
chunk hash 相同
```

## Tree

- connected
- minY = 0
- no floating
- bounds valid
- willow leaf attached
- bamboo grove spacing

## Structure

- rotate
- mirror
- cross-chunk placement

## Landmark

- entrance free
- sightline free
- building occupancy correct

---

# 42. 推荐开发阶段

## Phase 0 — Product Spec

只从旧项目整理：

- 功能清单
- 地标清单
- 诗词数据
- 视觉规范
- 交互规范

禁止搬代码。

---

## Phase 1 — 新项目骨架

完成：

```text
React
TypeScript
Vite
Three.js
Engine
WorldCanvas
RenderLoop
Camera
UI Shell
```

页面暂时只显示空世界。

---

## Phase 2 — Voxel Core

必须完成：

```text
BlockRegistry
BlockState
Chunk
ChunkSection
World
VoxelMesher
Face Culling
Greedy Mesh
AO
```

这是整个项目的技术基座。

---

## Phase 3 — Terrain Prototype

只实现一个小地图：

```text
mountain
plain
river
water
```

验证：

- world generation
- chunk streaming
- meshing
- camera

---

## Phase 4 — China World

加入：

- China land mask
- projection
- mountains
- plateau
- rivers
- overview renderer

---

## Phase 5 — Structure Engine

加入：

- VoxelStructure
- rotate
- mirror
- cross-chunk placement
- occupancy

---

## Phase 6 — Building System

先实现：

```text
house
pavilion
pagoda
bridge
gate
wall
```

---

## Phase 7 — Tree System

实现五类植物。

重点：

```text
TreeStructureFactory
TreePlacementSystem
Biome vegetation
```

---

## Phase 8 — Landmark System

先做三个样板：

```text
杭州
庐山
长安
```

每个必须有不同：

- terrain
- building
- vegetation
- water
- camera composition

---

## Phase 9 — Poetry

加入：

- poetry data
- search
- labels
- panel
- place navigation

---

## Phase 10 — Camera / Tour / Trail

加入：

- focus
- fly
- tour
- poet trail

---

## Phase 11 — Weather / Season

加入：

- time
- rain
- snow
- season
- cloud
- fog
- particles

---

## Phase 12 — Performance

- workers
- streaming
- LOD
- quality presets
- profiling

---

# 43. 新旧项目关系

明确写入 README：

```text
Legacy poemMap3D
        │
        ├─ 功能参考
        ├─ 视觉参考
        └─ 数据参考
             │
             ▼
New poemMap3D
        │
        ├─ 不继承旧运行架构
        ├─ 不兼容旧 API
        ├─ 不迁移旧 Mesh
        ├─ 不迁移旧全局状态
        └─ 从零构建世界引擎
```

---

# 44. AI 开发时的强制规则

可以把下面这段直接作为 Codex / Claude Code / Cursor 的顶级规则：

```text
这是一个 Greenfield Rewrite。

不要尝试迁移、包装、兼容或渐进式重构旧 index.html。

旧项目只用于阅读需求、视觉风格、诗词/地点数据和交互功能。

任何旧函数、旧全局变量、旧 Mesh Builder、旧 Shader、旧 DOM 操作都不是新项目的设计约束。

所有功能必须基于新架构重新实现。

优先构建体素世界底层，而不是优先复刻 UI。

禁止直接在业务模块中 scene.add()。

禁止一个方块一个 Mesh。

禁止一棵树一个 React 组件。

禁止植物、建筑和地形使用三套不同的体素坐标。

禁止 TreeManager 直接构建 Three.js Geometry。

禁止 BuildingManager 直接操作 React。

禁止 Poetry 模块持有 Three.js Object。

所有世界对象必须归属于统一的 World / Chunk / Block / Structure 系统。

任何新增功能都必须先明确属于：
Block、Chunk、Structure、World Generation、Engine、Feature 或 UI 中的哪一层。
```

---

# 45. 最终目标

最终的《山河诗卷》应该不是：

```text
一个复杂 Three.js 页面
```

而是：

```text
一个小型 Minecraft-style
中国诗词体素世界引擎
+
React 文化内容应用
```

其中：

```text
中国地图 = World
山河 = Terrain
江河 = Water System
树木 = Structures
建筑 = Structures
城市 = Landmark Scene
诗词 = Domain Data
巡游 = Application Feature
天气 = Environment
UI = React
```

这套边界一旦建立，后续新增：

- 更多诗人
- 更多城市
- 新树种
- 新建筑
- 新诗境天气
- 新地图区域

都不会再需要修改核心引擎。
