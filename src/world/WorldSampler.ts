import { BIOME_NAMES_ZH } from './biome/BiomeId'
import type { GeoPoint } from './coordinate/GeoProjection'
import { getProjection } from './coordinate/GeoProjection'
import type { WorldContext } from './generation/WorldContext'
import type { TerrainSample } from './terrain/TerrainSample'
import type { World } from './World'

/**
 * 世界查询：镜头避山、标签落地、调试取样都从这里拿高度，不去读任何业务模块内部变量。
 * 已加载区块用真实方块高度（含树与建筑），未加载处用生成函数直接取样。
 */
export class WorldSampler {
  constructor(
    private readonly ctx: WorldContext,
    private readonly world: World,
  ) {}

  /** 最高方块顶面（含水面、树、建筑）；用于镜头碰撞 */
  surfaceHeightAt(x: number, z: number): number {
    const bx = Math.floor(x)
    const bz = Math.floor(z)
    const loaded = this.world.loadedHeightAt(bx, bz)
    if (loaded >= 0) return loaded + 1
    return this.ctx.terrain.surfaceHeightAt(bx, bz, true) + 1
  }

  /** 地面顶面（不含树、建筑） */
  groundHeightAt(x: number, z: number): number {
    return this.ctx.terrain.surfaceHeightAt(Math.floor(x), Math.floor(z), true) + 1
  }

  sample(x: number, z: number): TerrainSample {
    return this.ctx.terrain.sample(Math.floor(x), Math.floor(z))
  }

  geo(x: number, z: number): GeoPoint {
    return getProjection().unproject(x, z)
  }

  project(lng: number, lat: number): { x: number; z: number } {
    return getProjection().project(lng, lat)
  }

  biomeName(id: number): string {
    return BIOME_NAMES_ZH[id] ?? ''
  }
}
