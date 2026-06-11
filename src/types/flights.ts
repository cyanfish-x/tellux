import type { Object3D } from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'
import type { CameraFlightEasingFunction } from '../Camera'
import type { CartographicCoordinates } from './spatial'

/**
 * Viewer 目标飞行支持的目标类型。
 *
 * 经纬高点位会直接作为目标点；Three.js 模型和 3D Tiles 会使用包围体中心作为目标点。
 *
 * Target types supported by Viewer target flights.
 *
 * Cartographic points are used directly; Three.js models and 3D Tiles use their
 * bounding-volume center as the target point.
 */
export type FlyToTargetTarget = CartographicCoordinates | Object3D | TilesRenderer

/**
 * 相机相对目标点的偏移。
 *
 * `heading` 和 `pitch` 定义相机看向目标时的方向，`distance` 定义相机到目标点的距离。
 *
 * Camera offset relative to a target point.
 *
 * `heading` and `pitch` define the view direction toward the target, and
 * `distance` defines the camera-to-target distance.
 */
export interface FlyToTargetOffset {
  /** 相机看向目标时的航向角（度），默认 `0`。Heading while viewing the target in degrees. Defaults to `0`. */
  heading?: number
  /** 相机看向目标时的俯仰角（度），默认 `-30`。Pitch while viewing the target in degrees. Defaults to `-30`. */
  pitch?: number
  /** 相机到目标点的距离（米）。Distance from the camera to the target point in meters. */
  distance?: number
  /** 相机看向目标时的翻滚角（度），默认 `0`。Roll while viewing the target in degrees. Defaults to `0`. */
  roll?: number
}

/**
 * 飞行到目标点、模型或 3D Tiles 的配置。
 *
 * Viewer 会根据目标和偏移计算相机最终位置，并让相机最终看向目标点。
 *
 * Options for flying to a point, model, or 3D Tiles target.
 *
 * Viewer computes the final camera position from the target and offset, and the
 * camera ends the flight looking at the target point.
 */
export interface FlyToTargetOptions extends FlyToTargetOffset {
  /** 飞行持续时间（秒）。Flight duration in seconds. */
  duration?: number
  /** 飞行最高高度（米），用于形成弧线飞行路径。Maximum flight height in meters, used to form an arced path. */
  maximumHeight?: number
  /** 飞行完成时调用。Called when the flight completes. */
  complete?: () => void
  /** 飞行被新飞行、立即定位或用户交互取消时调用。Called when the flight is cancelled by a new flight, immediate view change, or user input. */
  cancel?: () => void
  /** 控制飞行时间插值的缓动函数。Easing function that controls flight time interpolation. */
  easingFunction?: CameraFlightEasingFunction
}
