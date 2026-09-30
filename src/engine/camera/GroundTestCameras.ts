import * as THREE from 'three'

/**
 * 地面人视的固定验收机位。
 *
 * 天空、日月、霞光和树冠 / 屋面 / 山体的受光，必须站在地上、略微仰视才看得准——
 * 从全国俯视图看，天只剩画面边缘一条，判断不了「昼景是否够蓝」「暮景有没有晚霞」。
 * 所以晨、昼、暮的验收一律用这里的机位：位置、朝向、视场角写死，不因时段切换重新构图。
 *
 * 眼高按项目的方块比例标定，不假设「一个单位一米」：
 *  - 普通单层房屋墙高默认 4 方块（BuildingFactory.house），大殿 5 方块；
 *    中式单层木构檐柱高约 3–3.5 米，可得一方块约 0.8 米（门洞 3 方块高 ≈ 2.4 米，与此吻合）。
 *  - 成人眼高约 1.6 米，即 2 方块；再加半格站姿余量，取 2.1。
 */
export const METERS_PER_BLOCK = 0.8
export const EYE_HEIGHT_BLOCKS = 2.1

export type GroundCameraId = 'A' | 'B'

export interface GroundCameraSpec {
  id: GroundCameraId
  /** 用途 */
  label: string
  /** 以哪个地点为原点（poetryPlaceId） */
  place: string
  /** 相对地点中心的偏移（方块） */
  dx: number
  dz: number
  /** 方位角：0 朝北，90 朝东 */
  heading: number
  /** 仰角（度），先按 8°–18° 校准 */
  pitch: number
  /** 垂直视场角（度），先按 55°–65° 校准 */
  fov: number
}

/**
 * 机位 A · Ground Sky Test：看天顶 / 中段 / 地平线的渐变、日月与光晕、晚霞的空间分布，
 *   以及天空与远山轮廓的关系。
 * 机位 B · Ground Lighting Test：看树冠顶部与外侧受光、屋面墙体的方向性照明、
 *   山体朝阳与背光面、水面与河岸，以及换时段时天空与场景光照是否一致。
 * 两个机位天空都占画面约 35%–55%，近处无遮挡整片天空的树冠 / 山壁。
 */
export const GROUND_CAMERAS: Record<GroundCameraId, GroundCameraSpec> = {
  A: { id: 'A', label: 'Ground Sky Test', place: 'huanghelou', dx: 0, dz: -84, heading: 215, pitch: 9, fov: 60 },
  B: { id: 'B', label: 'Ground Lighting Test', place: 'hangzhou', dx: 61, dz: -25, heading: 200, pitch: 10, fov: 60 },
}

/** 罗盘方位（0 北、90 东）与仰角 → 世界方向（北为 −z，东为 +x） */
export function compassDir(headingDeg: number, pitchDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const h = (headingDeg * Math.PI) / 180
  const p = (pitchDeg * Math.PI) / 180
  return out.set(Math.sin(h) * Math.cos(p), Math.sin(p), -Math.cos(h) * Math.cos(p))
}

/** 机位规格 → 眼点与注视点。groundAt 给地面顶面高度（不含树与建筑） */
export function groundCameraPose(spec: GroundCameraSpec, center: THREE.Vector3, groundAt: (x: number, z: number) => number, ahead = 48): { eye: THREE.Vector3; look: THREE.Vector3 } {
  const x = center.x + spec.dx
  const z = center.z + spec.dz
  const eye = new THREE.Vector3(x, groundAt(x, z) + EYE_HEIGHT_BLOCKS, z)
  const look = eye.clone().addScaledVector(compassDir(spec.heading, spec.pitch), ahead)
  return { eye, look }
}
