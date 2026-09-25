import * as THREE from 'three'

/** 环绕式镜头姿态：目标点 + 方位角 + 俯角 + 距离（yaw 0 = 镜头在目标正南，向北看） */
export interface CameraPose {
  target: THREE.Vector3
  yaw: number
  pitch: number
  distance: number
}

export const clonePose = (p: CameraPose): CameraPose => ({ target: p.target.clone(), yaw: p.yaw, pitch: p.pitch, distance: p.distance })

export function poseToPosition(p: CameraPose, out = new THREE.Vector3()): THREE.Vector3 {
  const cp = Math.cos(p.pitch)
  return out.set(p.target.x + Math.sin(p.yaw) * cp * p.distance, p.target.y + Math.sin(p.pitch) * p.distance, p.target.z + Math.cos(p.yaw) * cp * p.distance)
}

/** 最短角差 */
export const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a))

export type CameraLevel = 'national' | 'regional' | 'local'

export const PITCH_MIN = 0.1
export const PITCH_MAX = 1.5
export const DIST_MIN = 10
export const DIST_MAX = 4200
