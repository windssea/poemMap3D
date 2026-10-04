import { VIEW_PRESETS } from '../engine/camera/CameraPresetRepository'
import { type DeepLinkState, encodeDeepLink, parseDeepLink, sameView } from './DeepLink'
import { Engine } from '../engine/core/Engine'
import { ISOLATION, PHASE0 } from '../engine/rendering/LightingDebug'
import { AmbientSound } from './AmbientSound'
import { ResourceManager } from '../engine/core/ResourceManager'
import { TrailDirector } from '../features/poetTrail/TrailDirector'
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
  director: TrailDirector
  resources: ResourceManager
  /** 有手工 / 名楼营造的地点（标签加框） */
  majorPlaces: ReadonlySet<string>
  sound: AmbientSound
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
  const engine = new Engine(container, { quality: s0.quality || undefined, viewRange: s0.viewRange, time: s0.time, season: s0.season, weather: s0.weather })
  engine.events.on('progress', ({ label, value }) => setLoading(label, 0.1 + value * 0.85))
  const anchors = places.all().map((p) => ({ id: p.id, name: p.name, lng: p.lng, lat: p.lat, weight: p.poemIds.length }))
  await engine.init({ landmask, anchors })

  const major = new Set<string>([...LANDMARK_CATALOG.map((d) => d.poetryPlaceId), ...engine.world.ctx.landmarks.landmarks.filter((l) => l.def.major).map((l) => l.def.poetryPlaceId)])
  const aggregator = new PlaceAggregator(places, poetry, major)
  const facade = new EngineFacadeImpl(engine, store)
  const navigation = new PoetryNavigationService(store, poetry, places, facade, (poet) => !!trails.get(poet))
  const tour = new TourService(tourData, poetry, store, facade)
  facade.tour = tour
  const director = new TrailDirector(trails, poetry, store, facade)
  facade.director = director
  const search = new PoetrySearchService(poetry, places)

  /* 接线：引擎事件 → 应用状态 */
  engine.events.on('level', (l) => store.set({ cameraLevel: l }))
  engine.events.on('select', ({ placeId }) => {
    if (store.get().tourState.active) return
    if (placeId) navigation.selectPlace(placeId, store.get().autoCamera)
  })
  engine.events.on('interact', () => {
    if (store.get().tourState.active) tour.stop()
    // 用户自己动了镜头：不再停在哪个机位、哪个视角上
    const st = store.get()
    if (st.selectedShotId || st.activeView) store.set({ selectedShotId: null, activeView: null })
  })
  /* 背景音：随季节、时辰、天气调配；上次开着的，等用户第一次点按后再出声（浏览器要求） */
  const sound = new AmbientSound()
  const syncSound = () => {
    const st = store.get()
    sound.setEnvironment(st.season, st.time, st.weather)
  }
  syncSound()
  let lastEnv = ''
  store.subscribe(() => {
    const st = store.get()
    const k = st.season + st.time + st.weather
    if (k !== lastEnv) {
      lastEnv = k
      syncSound()
    }
  })
  if (store.get().sound !== 'off') {
    const wake = () => {
      sound.setMode(store.get().sound)
      window.removeEventListener('pointerdown', wake)
    }
    window.addEventListener('pointerdown', wake)
  }
  store.set({ quality: engine.quality.quality, loading: { ready: true, label: '', progress: 1, error: null } })
  if (store.get().debug.chunks) engine.setChunkDebug(true)
  res.lazy('font-poems')
  /* 分享地址：?p=地点&poem=诗&shot=机位（时令天气 shs/shw/shm 已由应用状态读入）。启动即还原；之后地址跟着选择走——
     选地点、选诗记入浏览器历史（前进后退可回），换机位、时令天气只改写当前一条。不存在的地点、诗、机位静默忽略 */
  let applying = false
  const linkOf = (): DeepLinkState => {
    const s = store.get()
    return { place: s.selectedPlaceId, poem: s.selectedPoemId, shot: s.selectedShotId, view: s.activeView, season: s.season, weather: s.weather, time: s.time }
  }
  /**
   * 一次还原（一个导航事务，期间不写地址）：先时令天气（与地点无关，没有地点也照样还原），再诗卷（地点、诗），
   * 最后镜头——视角预设 > 地点机位 > 首页（home 为真时，没有地点也没有预设就飞回首页：后退到首页那一条）
   */
  const applyLink = (l: DeepLinkState, home: boolean): void => {
    applying = true
    try {
      if (l.season && l.season !== store.get().season) facade.setSeason(l.season)
      if (l.weather && l.weather !== store.get().weather) facade.setWeather(l.weather)
      if (l.time && l.time !== store.get().time) facade.setTime(l.time)
      const poem = l.poem ? poetry.get(l.poem) : undefined
      const place = poem?.placeId ?? (l.place && places.get(l.place) ? l.place : null)
      if (poem) navigation.selectPoem(poem.id, false)
      else navigation.selectPlace(place, false)
      const view = l.view && VIEW_PRESETS.some((v) => v.key === l.view) ? l.view : null
      if (view) facade.flyToView(view)
      else if (place && l.shot && facade.placeShots(place).some((s) => s.id === l.shot)) facade.focusShot(place, l.shot)
      else if (place) facade.focusLandmark(place)
      else if (home) {
        store.set({ activeView: null, selectedShotId: null })
        void engine.flyToView('home')
      }
    } finally {
      applying = false
    }
  }
  const startLink = parseDeepLink(location.search)
  if (startLink.place || startLink.poem || startLink.view) applyLink(startLink, false)
  let lastLink = linkOf()
  {
    const url = encodeDeepLink(lastLink, location.search)
    if (url !== location.search) history.replaceState(null, '', location.pathname + url + location.hash)
  }
  store.subscribe(() => {
    if (applying || store.get().tourState.active) return
    const cur = linkOf()
    const url = encodeDeepLink(cur, location.search)
    if (url !== location.search) {
      const path = location.pathname + url + location.hash
      if (sameView(cur, lastLink)) history.replaceState(null, '', path)
      else history.pushState(null, '', path)
    }
    lastLink = cur
  })
  window.addEventListener('popstate', () => {
    applyLink(parseDeepLink(location.search), true)
    lastLink = linkOf()
    // 还原时丢掉的（已不存在的诗、机位）从地址里拿掉，地址与画面一致
    const url = encodeDeepLink(lastLink, location.search)
    if (url !== location.search) history.replaceState(null, '', location.pathname + url + location.hash)
  })

  /* 开发调试：?shp=地点id 启动后直接飞到该地（与 shs/shw/shm 同一套地址参数）。瞬时完成，不等飞行动画——后台标签页被节流时动画走不动 */
  if (import.meta.env.DEV) {
    const param = new URLSearchParams(location.search)
    const shp = param.get('shp')
    if (shp && places.get(shp)) {
      const shot = Number(param.get('shz') ?? '1') || 1
      navigation.selectPlace(shp, false)
      /* ?shg=[距离]：落到该地后压平镜头仰视看天（任务书 §4/§10 调天空用）。
         可选 shy=方位角(弧度，西 1.57 / 东 -1.57)、shp2=俯角(默认 0.1) */
      const shg = param.get('shg')
      if (shg) {
        const dist = Number(shg) || 120
        const yaw = Number(param.get('shy') ?? '0.42')
        const pitch = Number(param.get('shp2') ?? '0.1')
        void engine.focusPlace(shp, { duration: 0.2, shot: Math.max(0.2, Math.min(8, shot)) }).then(() => {
          const v = engine.world.landmarkView(shp)
          if (v) void engine.camera.flyTo({ target: v.target.clone(), yaw, pitch, distance: dist }, { duration: 0.4 })
        })
      } else {
        facade.focusLandmark(shp, { duration: 0.2, shot: Math.max(0.2, Math.min(8, shot)) })
      }
    }
    /* ?shl=id[,id]：启动即套用 Phase 0 / A–F 隔离调试位（与 P0 截图流程配套），如 shl=fogFactor */
    const shl = param.get('shl')
    if (shl) {
      for (const k of shl.split(',')) {
        const p = [...PHASE0, ...ISOLATION].find((x) => x.id === k)
        if (p) facade.setLighting(p.patch)
      }
    }
  }
  /* 调试入口（验收截图 tools/shoot.mjs 依赖它）：只在开发服务器或地址栏带 ?debug 时挂到 window */
  if (import.meta.env.DEV || store.get().debug.chunks) (window as unknown as { __shanhe?: unknown }).__shanhe = { engine, facade, store, sound, navigation }
  return { store, facade, poetry, places, aggregator, search, navigation, tour, trails, director, resources: res, majorPlaces: major, sound }
}
