import type * as THREE from 'three'

/** 每帧传给各系统的上下文 */
export interface FrameContext {
  /** 本帧时长（秒，已限幅） */
  dt: number
  /** 引擎启动以来的秒数 */
  time: number
  frame: number
  camera: THREE.PerspectiveCamera
  /** 镜头焦点（世界渲染坐标） */
  focus: THREE.Vector3
  /** 镜头到焦点的距离 */
  distance: number
}

/** 可被渲染循环驱动的系统 */
export interface FrameSystem {
  update(ctx: FrameContext): void
}
