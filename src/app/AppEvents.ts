import { EventBus } from '../engine/core/EventBus'

/** 应用层事件（UI ↔ 功能模块），与引擎事件分开 */
export interface AppEventMap {
  toast: { text: string }
  focusSearch: void
}

export const appEvents = new EventBus<AppEventMap>()
