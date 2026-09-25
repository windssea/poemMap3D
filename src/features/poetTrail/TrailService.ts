export interface TrailStop {
  year: string
  place: string
  lng: number
  lat: number
  note: string
}

export interface PoetTrail {
  poet: string
  years: string
  color: string
  stops: TrailStop[]
}

export interface TrailData {
  version: number
  trails: PoetTrail[]
}

/** 诗人足迹仓库 */
export class TrailRepository {
  private readonly map = new Map<string, PoetTrail>()

  constructor(data: TrailData) {
    for (const t of data.trails) this.map.set(t.poet, t)
  }

  get(poet: string): PoetTrail | undefined {
    return this.map.get(poet)
  }

  all(): PoetTrail[] {
    return [...this.map.values()]
  }
}

/** 足迹的取景：包住全部站点的中心与距离 */
export function trailFraming(t: PoetTrail, project: (lng: number, lat: number) => { x: number; z: number }): { x: number; z: number; distance: number } {
  const pts = t.stops.map((s) => project(s.lng, s.lat))
  const minX = Math.min(...pts.map((p) => p.x))
  const maxX = Math.max(...pts.map((p) => p.x))
  const minZ = Math.min(...pts.map((p) => p.z))
  const maxZ = Math.max(...pts.map((p) => p.z))
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, distance: Math.max(500, Math.max(maxX - minX, maxZ - minZ) * 1.25) }
}
