import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { CAMERA_FRAME, DEFAULT_CAMERA, DEG2RAD } from './constants'

/**
 * 相机控制器，提供 Cesium 风格的视角方法。
 *
 * Camera controller with Cesium-style view methods.
 */
export class Camera {
  /**
   * 底层 Three.js 透视相机。
   *
   * Underlying Three.js perspective camera.
   */
  readonly threeCamera: THREE.PerspectiveCamera

  constructor(camera: THREE.PerspectiveCamera) {
    this.threeCamera = camera
  }

  /**
   * 将相机移动到目标位置。
   *
   * 当前会立即应用目标视角；`duration` 保留给未来的动画飞行支持。
   *
   * Moves the camera to a destination.
   *
   * This currently applies the target view immediately; `duration` is reserved
   * for future animated flight support.
   */
  flyTo(options: {
    destination: {
      /** 目标纬度（度）。Destination latitude in degrees. */
      latitude: number
      /** 目标经度（度）。Destination longitude in degrees. */
      longitude: number
      /** 目标高度（米），默认使用 viewer 相机高度。Destination height in meters. Defaults to the viewer camera height. */
      height?: number
    }
    orientation?: {
      /** 航向角（度）。Heading in degrees. */
      heading?: number
      /** 俯仰角（度）。Pitch in degrees. */
      pitch?: number
      /** 翻滚角（度）。Roll in degrees. */
      roll?: number
    }
    /** 保留给未来的动画飞行支持。Reserved for future animated flight support. */
    duration?: number
  }) {
    const { destination, orientation } = options
    this.setView({
      latitude: destination.latitude,
      longitude: destination.longitude,
      height: destination.height,
      heading: orientation?.heading,
      pitch: orientation?.pitch,
      roll: orientation?.roll
    })
  }

  /**
   * 立即设置相机视角。
   *
   * Sets the camera view immediately.
   */
  setView(options: {
    /** 纬度（度）。Latitude in degrees. */
    latitude: number
    /** 经度（度）。Longitude in degrees. */
    longitude: number
    /** 高度（米），默认使用 viewer 相机高度。Height in meters. Defaults to the viewer camera height. */
    height?: number
    /** 航向角（度）。Heading in degrees. */
    heading?: number
    /** 俯仰角（度）。Pitch in degrees. */
    pitch?: number
    /** 翻滚角（度）。Roll in degrees. */
    roll?: number
  }) {
    const ellipsoid = (this.threeCamera.userData.tilesRenderer as TilesRenderer | undefined)?.ellipsoid
    if (!ellipsoid) return

    ellipsoid.getObjectFrame(
      options.latitude * DEG2RAD,
      options.longitude * DEG2RAD,
      options.height ?? DEFAULT_CAMERA.height,
      (options.heading ?? DEFAULT_CAMERA.heading) * DEG2RAD,
      (options.pitch ?? DEFAULT_CAMERA.pitch) * DEG2RAD,
      (options.roll ?? DEFAULT_CAMERA.roll) * DEG2RAD,
      this.threeCamera.matrix,
      CAMERA_FRAME
    )
    this.threeCamera.matrix.decompose(this.threeCamera.position, this.threeCamera.quaternion, this.threeCamera.scale)
  }
}
