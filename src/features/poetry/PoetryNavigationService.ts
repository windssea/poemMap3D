import type { AppStore } from '../../app/AppStore'
import type { PlaceRepository, PoetryRepository } from './PoetryRepository'

/** 引擎侧只暴露「聚焦某地标」，导航服务不持有任何 Three.js 对象 */
export interface FocusPort {
  focusLandmark(id: string): void
  showPoetTrail(poet: string): void
}

/** 诗词导航：选地点 → 展开诗目并聚焦；选诗 → 展开诗卷；选诗人 → 有足迹就显示足迹 */
export class PoetryNavigationService {
  constructor(
    private readonly store: AppStore,
    private readonly poetry: PoetryRepository,
    private readonly places: PlaceRepository,
    private readonly focus: FocusPort,
    private readonly hasTrail: (poet: string) => boolean,
  ) {}

  selectPlace(placeId: string | null, fly = true): void {
    if (!placeId) {
      this.store.set({ selectedPlaceId: null, selectedPoemId: null, panelState: 'none' })
      return
    }
    if (fly) this.focus.focusLandmark(placeId)
    // 一处只有一首：直接展卷；多首先列诗目
    const only = this.places.get(placeId)?.poemIds
    if (only && only.length === 1) this.store.set({ selectedPlaceId: placeId, selectedPoemId: only[0], panelState: 'poem' })
    else this.store.set({ selectedPlaceId: placeId, selectedPoemId: null, panelState: 'place' })
  }

  selectPoem(poemId: string, fly = true): void {
    const p = this.poetry.get(poemId)
    if (!p) return
    const sameePlace = this.store.get().selectedPlaceId === p.placeId
    this.store.set({ selectedPlaceId: p.placeId, selectedPoemId: poemId, panelState: 'poem' })
    if (fly && !sameePlace) this.focus.focusLandmark(p.placeId)
  }

  selectAuthor(name: string): void {
    if (this.hasTrail(name)) {
      this.focus.showPoetTrail(name)
      return
    }
    const first = this.poetry.poemsBy(name)[0]
    if (first) this.selectPoem(first.id)
  }

  closePanel(): void {
    const s = this.store.get()
    const many = (s.selectedPlaceId && this.places.get(s.selectedPlaceId)?.poemIds.length) || 0
    if (s.panelState === 'poem' && many > 1) this.store.set({ panelState: 'place', selectedPoemId: null })
    else this.store.set({ panelState: 'none', selectedPlaceId: null })
  }
}
