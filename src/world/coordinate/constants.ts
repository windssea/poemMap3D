/** Chunk 水平边长（方块） */
export const CHUNK_SIZE = 16
export const CHUNK_SHIFT = 4
export const CHUNK_MASK = 15
/** ChunkSection 高度（方块） */
export const SECTION_HEIGHT = 16
export const SECTION_VOLUME = CHUNK_SIZE * SECTION_HEIGHT * CHUNK_SIZE
/** 世界高度（方块）；Y 取 [0, WORLD_HEIGHT) */
export const WORLD_HEIGHT = 256
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT
/** 海平面（方块 Y）：水面是 SEA_LEVEL 这一格的顶部以下 */
export const SEA_LEVEL = 40

/**
 * 逻辑方块 → Three.js 渲染坐标。
 * 所有世界对象（地形、树、建筑、地标）都在同一个方块网格上，渲染时统一乘这个比例。
 */
export const WORLD_RENDER_SCALE = 1
