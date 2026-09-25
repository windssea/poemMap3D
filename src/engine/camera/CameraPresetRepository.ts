import * as THREE from 'three'
import type { WorldSampler } from '../../world/WorldSampler'
import type { CameraPose } from './CameraPose'

export interface ViewPreset {
  key: string
  name: string
  lng: number
  lat: number
  distance: number
  pitch: number
  yaw: number
}

/** 视角预设：全国与几个片区（地名 → 经纬 + 取景） */
export const VIEW_PRESETS: readonly ViewPreset[] = [
  { key: 'home', name: '全国', lng: 113.2, lat: 30.6, distance: 2700, pitch: 0.98, yaw: 0.42 },
  { key: 'jiangnan', name: '江南', lng: 119.6, lat: 30.9, distance: 560, pitch: 0.72, yaw: 0.35 },
  { key: 'sanxia', name: '三峡', lng: 110.2, lat: 31.0, distance: 460, pitch: 0.62, yaw: -0.4 },
  { key: 'changan', name: '长安', lng: 108.9, lat: 34.35, distance: 560, pitch: 0.7, yaw: -0.3 },
  { key: 'greatwall', name: '长城', lng: 116.2, lat: 40.3, distance: 640, pitch: 0.66, yaw: 0.2 },
  { key: 'frontier', name: '边塞', lng: 99.5, lat: 39.6, distance: 1300, pitch: 0.82, yaw: 0.6 },
]

export class CameraPresetRepository {
  constructor(private readonly sampler: WorldSampler) {}

  list(): readonly ViewPreset[] {
    return VIEW_PRESETS
  }

  pose(key: string): CameraPose | null {
    const v = VIEW_PRESETS.find((p) => p.key === key)
    if (!v) return null
    const c = this.sampler.project(v.lng, v.lat)
    return { target: new THREE.Vector3(c.x, this.sampler.groundHeightAt(c.x, c.z), c.z), yaw: v.yaw, pitch: v.pitch, distance: v.distance }
  }
}
