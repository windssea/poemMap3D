import { Engine } from '../engine/core/Engine'
import { ResourceManager } from '../engine/core/ResourceManager'
import { type TrailData, TrailRepository } from '../features/poetTrail/TrailService'
import { PlaceAggregator } from '../features/poetry/PlaceAggregator'
import { PoetryNavigationService } from '../features/poetry/PoetryNavigationService'
import { PlaceRepository, PoetryRepository } from '../features/poetry/PoetryRepository'
import { PoetrySearchService } from '../features/poetry/PoetrySearchService'
import type { PoetryData } from '../features/poetry/types'
import type { TourPlanData } from '../features/tour/TourPlanner'
import { TourService } from '../features/tour/TourService'
import { LANDMARK_CATALOG } from '../world/landmark/LandmarkCatalog'
import { type AppStore, appStore } from './AppStore'
import { EngineFacadeImpl } from './EngineFacade'

/** 应用服务集合（React 通过 context 取用） */
export interface AppServices {
  store: AppStore
  facade: EngineFacadeImpl
  poetry: PoetryRepository
  places: PlaceRepository
  aggregator: PlaceAggregator
  search: PoetrySearchService
  navigation: PoetryNavigationService
  tour: TourService
  trails: TrailRepository
  resources: ResourceManager
  /** 有手工 / 名楼营造的地点（标签加框） */
  majorPlaces: ReadonlySet<string>
}

/**
 * 启动：加载资源 → 建诗词领域 → 建引擎（Worker 生成世界）→ 组装外观与服务 → 接线。
 */
export async function bootstrap(container: HTMLElement): Promise<AppServices> {
  const store = appStore
  const res = new ResourceManager()
  res.register('poems', 'json', 'data/poems.json')
  res.register('tour', 'json', 'data/tour.json')
  res.register('trails', 'json', 'data/trails.json')
  res.register('landmask', 'binary', 'data/landmask.bin')
  res.register('font-ui', 'font', 'ShanheBrush|fonts/brush-ui.woff2')
  res.register('font-poems', 'font', 'ShanheBrushPoems|fonts/brush-poems.woff2')
  const setLoading = (label: string, progress: number) => store.set((s) => ({ loading: { ...s.loading, label, progress } }))

  setLoading('研墨 · 载入诗卷', 0.05)
  void res.load('font-ui').catch(() => undefined)
  const [poemsData, tourData, trailData, landmask] = (await res.preload(['poems', 'tour', 'trails', 'landmask'])) as [PoetryData, TourPlanData, TrailData, ArrayBuffer]
  const poetry = new PoetryRepository(poemsData)
  const places = new PlaceRepository(poemsData)
  const trails = new TrailRepository(trailData)

  const s0 = store.get()
  const engine = new Engine(container, { quality: s0.quality || undefined, time: s0.time, season: s0.season, weather: s0.weather })
  engine.events.on('progress', ({ label, value }) => setLoading(label, 0.1 + value * 0.85))
  const anchors = places.all().map((p) => ({ id: p.id, name: p.name, lng: p.lng, lat: p.lat, weight: p.poemIds.length }))
  await engine.init({ landmask, anchors })

  const major = new Set<string>([...LANDMARK_CATALOG.map((d) => d.poetryPlaceId), ...engine.world.ctx.landmarks.landmarks.filter((l) => l.def.major).map((l) => l.def.poetryPlaceId)])
  const aggregator = new PlaceAggregator(places, poetry, major)
  const facade = new EngineFacadeImpl(engine, store, trails)
  const navigation = new PoetryNavigationService(store, poetry, facade, (poet) => !!trails.get(poet))
  const tour = new TourService(tourData, poetry, store, facade)
  facade.tour = tour
  const search = new PoetrySearchService(poetry, places)

  /* 接线：引擎事件 → 应用状态 */
  engine.events.on('level', (l) => store.set({ cameraLevel: l }))
  engine.events.on('select', ({ placeId }) => {
    if (store.get().tourState.active) return
    if (placeId) navigation.selectPlace(placeId, false)
  })
  engine.events.on('interact', () => {
    if (store.get().tourState.active) tour.stop()
  })
  store.set({ quality: engine.quality.quality, loading: { ready: true, label: '', progress: 1, error: null } })
  if (store.get().debug.chunks) engine.setChunkDebug(true)
  res.lazy('font-poems')
  ;(window as unknown as { __shanhe?: unknown }).__shanhe = { engine, facade, store }
  return { store, facade, poetry, places, aggregator, search, navigation, tour, trails, resources: res, majorPlaces: major }
}
