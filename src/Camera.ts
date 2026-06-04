import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { CAMERA_FRAME, DEFAULT_CAMERA, DEG2RAD } from './constants'

/**
 * 相机飞行动画的缓动函数。
 *
 * Camera flight easing function.
 */
export type CameraFlightEasingFunction = (time: number) => number

/**
 * 相机飞行目标位置。
 *
 * Camera flight destination.
 */
export interface CameraFlyToDestination {
  /** 目标纬度（度）。Destination latitude in degrees. */
  latitude: number
  /** 目标经度（度）。Destination longitude in degrees. */
  longitude: number
  /** 目标高度（米），默认使用当前相机高度。Destination height in meters. Defaults to the current camera height. */
  height?: number
}

/**
 * 相机姿态角。
 *
 * Camera orientation angles.
 */
export interface CameraOrientation {
  /** 航向角（度）。Heading in degrees. */
  heading?: number
  /** 俯仰角（度）。Pitch in degrees. */
  pitch?: number
  /** 翻滚角（度）。Roll in degrees. */
  roll?: number
}

/**
 * 相机飞行选项。
 *
 * Camera flight options.
 */
export interface CameraFlyToOptions {
  /** 相机最终位置。Final camera position. */
  destination: CameraFlyToDestination
  /** 相机最终姿态。Final camera orientation. */
  orientation?: CameraOrientation
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

/**
 * 立即设置相机视角的选项。
 *
 * Options for setting the camera view immediately.
 */
export interface CameraSetViewOptions {
  /** 纬度（度）。Latitude in degrees. */
  latitude: number
  /** 经度（度）。Longitude in degrees. */
  longitude: number
  /** 高度（米），默认使用当前相机高度。Height in meters. Defaults to the current camera height. */
  height?: number
  /** 航向角（度）。Heading in degrees. */
  heading?: number
  /** 俯仰角（度）。Pitch in degrees. */
  pitch?: number
  /** 翻滚角（度）。Roll in degrees. */
  roll?: number
}

interface CameraViewState {
  latitude: number
  longitude: number
  height: number
  heading: number
  pitch: number
  roll: number
}

interface CameraFlight {
  frameId: number
  cancel?: () => void
}

const DEFAULT_FLIGHT_DURATION = 3
const MIN_FLIGHT_DURATION = 1
const MAX_FLIGHT_DURATION = 6
const SCRATCH_CARTOGRAPHIC = {
  lat: 0,
  lon: 0,
  height: 0,
  azimuth: 0,
  elevation: 0,
  roll: 0
}

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

  private currentFlight: CameraFlight | null = null

  constructor(camera: THREE.PerspectiveCamera) {
    this.threeCamera = camera
  }

  /**
   * 平滑飞行到目标位置。
   *
   * 新的飞行会取消尚未完成的旧飞行。`duration` 使用秒作为单位；
   * 未传入时会根据当前视角和目标视角估算一个飞行时间。
   *
   * Smoothly flies the camera to a destination.
   *
   * A new flight cancels any unfinished previous flight. `duration` is in
   * seconds. When omitted, an estimated duration is computed from the current
   * and destination views.
   */
  flyTo(options: CameraFlyToOptions) {
    const ellipsoid = this.getEllipsoid()
    if (!ellipsoid) return

    const start = this.getCurrentView(ellipsoid)
    const target = this.resolveFlyToTarget(options, start)
    const duration = options.duration ?? this.computeFlightDuration(start, target, ellipsoid)

    this.cancelFlight()

    if (duration <= 0) {
      this.applyView(target)
      options.complete?.()
      return
    }

    const startedAt = performance.now()
    const durationMs = duration * 1000
    const easingFunction = options.easingFunction ?? easeInOutCubic
    const maximumHeight = options.maximumHeight ?? this.computeMaximumHeight(start, target, ellipsoid)

    const updateFlight = (time: number) => {
      const rawTime = clamp((time - startedAt) / durationMs, 0, 1)
      const easedTime = clamp(easingFunction(rawTime), 0, 1)

      this.applyView({
        latitude: lerp(start.latitude, target.latitude, easedTime),
        longitude: normalizeLongitude(lerp(start.longitude, target.longitude, easedTime)),
        height: interpolateHeight(start.height, target.height, maximumHeight, easedTime),
        heading: interpolateAngle(start.heading, target.heading, easedTime),
        pitch: interpolateAngle(start.pitch, target.pitch, easedTime),
        roll: interpolateAngle(start.roll, target.roll, easedTime)
      })

      if (rawTime < 1) {
        if (this.currentFlight) {
          this.currentFlight.frameId = requestAnimationFrame(updateFlight)
        }
        return
      }

      this.currentFlight = null
      this.applyView({
        ...target,
        longitude: normalizeLongitude(target.longitude)
      })
      options.complete?.()
    }

    this.currentFlight = {
      frameId: requestAnimationFrame(updateFlight),
      cancel: options.cancel
    }
  }

  /**
   * 取消当前相机飞行。
   *
   * Cancels the current camera flight.
   */
  cancelFlight() {
    const flight = this.currentFlight
    if (!flight) return

    cancelAnimationFrame(flight.frameId)
    this.currentFlight = null
    flight.cancel?.()
  }

  /**
   * 立即设置相机视角。
   *
   * Sets the camera view immediately.
   */
  setView(options: CameraSetViewOptions) {
    this.cancelFlight()
    this.applyView({
      latitude: options.latitude,
      longitude: options.longitude,
      height: options.height ?? this.getCurrentHeight() ?? DEFAULT_CAMERA.height,
      heading: options.heading ?? DEFAULT_CAMERA.heading,
      pitch: options.pitch ?? DEFAULT_CAMERA.pitch,
      roll: options.roll ?? DEFAULT_CAMERA.roll
    })
  }

  /**
   * 获取当前相机视角参数。
   *
   * 返回值可直接传给 {@link Camera.setView}，便于在控制台读取当前视角后，
   * 用作 Viewer 初始化时的 `camera` 配置。
   *
   * Gets the current camera view parameters.
   *
   * The returned value can be passed directly to {@link Camera.setView}, making
   * it convenient to read the current view from the console and reuse it as the
   * initial `camera` option for Viewer creation.
   */
  getState(): CameraSetViewOptions {
    const ellipsoid = this.getEllipsoid()
    if (!ellipsoid) {
      return {
        latitude: DEFAULT_CAMERA.latitude,
        longitude: DEFAULT_CAMERA.longitude,
        height: DEFAULT_CAMERA.height,
        heading: DEFAULT_CAMERA.heading,
        pitch: DEFAULT_CAMERA.pitch,
        roll: DEFAULT_CAMERA.roll
      }
    }

    return this.getCurrentView(ellipsoid)
  }

  private applyView(options: CameraViewState) {
    const ellipsoid = this.getEllipsoid()
    if (!ellipsoid) return

    ellipsoid.getObjectFrame(
      options.latitude * DEG2RAD,
      options.longitude * DEG2RAD,
      options.height,
      options.heading * DEG2RAD,
      options.pitch * DEG2RAD,
      options.roll * DEG2RAD,
      this.threeCamera.matrix,
      CAMERA_FRAME
    )
    this.threeCamera.matrix.decompose(this.threeCamera.position, this.threeCamera.quaternion, this.threeCamera.scale)
    this.threeCamera.updateMatrixWorld(true)
  }

  private getEllipsoid() {
    return (this.threeCamera.userData.tilesRenderer as TilesRenderer | undefined)?.ellipsoid
  }

  private getCurrentHeight() {
    const ellipsoid = this.getEllipsoid()
    if (!ellipsoid) return null

    return this.getCurrentView(ellipsoid).height
  }

  private getCurrentView(ellipsoid: TilesRenderer['ellipsoid']): CameraViewState {
    this.threeCamera.updateMatrix()
    const cartographic = ellipsoid.getCartographicFromObjectFrame(this.threeCamera.matrix, SCRATCH_CARTOGRAPHIC, CAMERA_FRAME)

    return {
      latitude: cartographic.lat / DEG2RAD,
      longitude: cartographic.lon / DEG2RAD,
      height: cartographic.height,
      heading: cartographic.azimuth / DEG2RAD,
      pitch: cartographic.elevation / DEG2RAD,
      roll: cartographic.roll / DEG2RAD
    }
  }

  private resolveFlyToTarget(options: CameraFlyToOptions, start: CameraViewState): CameraViewState {
    const { destination, orientation } = options
    return {
      latitude: destination.latitude,
      longitude: start.longitude + shortestAngleDelta(start.longitude, destination.longitude),
      height: destination.height ?? start.height,
      heading: orientation?.heading ?? DEFAULT_CAMERA.heading,
      pitch: orientation?.pitch ?? DEFAULT_CAMERA.pitch,
      roll: orientation?.roll ?? DEFAULT_CAMERA.roll
    }
  }

  private computeFlightDuration(start: CameraViewState, target: CameraViewState, ellipsoid: TilesRenderer['ellipsoid']) {
    const radius = Math.max(ellipsoid.radius.x, ellipsoid.radius.y, ellipsoid.radius.z)
    const angularDistance = computeAngularDistance(start, target)
    const surfaceDistance = angularDistance * radius
    const heightDistance = Math.abs(target.height - start.height)
    const distanceRatio = (surfaceDistance + heightDistance) / radius

    return clamp(DEFAULT_FLIGHT_DURATION * Math.sqrt(distanceRatio), MIN_FLIGHT_DURATION, MAX_FLIGHT_DURATION)
  }

  private computeMaximumHeight(start: CameraViewState, target: CameraViewState, ellipsoid: TilesRenderer['ellipsoid']) {
    const radius = Math.max(ellipsoid.radius.x, ellipsoid.radius.y, ellipsoid.radius.z)
    const surfaceDistance = computeAngularDistance(start, target) * radius
    const baseHeight = Math.max(start.height, target.height)

    if (surfaceDistance <= 1) return baseHeight

    return baseHeight + clamp(surfaceDistance * 0.18, 0, radius * 0.35)
  }
}

function easeInOutCubic(time: number) {
  return time < 0.5 ? 4 * time * time * time : 1 - Math.pow(-2 * time + 2, 3) / 2
}

function interpolateHeight(start: number, end: number, maximumHeight: number, time: number) {
  if (maximumHeight <= Math.max(start, end)) return lerp(start, end, time)

  return lerp(lerp(start, maximumHeight, time), lerp(maximumHeight, end, time), time)
}

function interpolateAngle(start: number, end: number, time: number) {
  return start + shortestAngleDelta(start, end) * time
}

function computeAngularDistance(start: Pick<CameraViewState, 'latitude' | 'longitude'>, end: Pick<CameraViewState, 'latitude' | 'longitude'>) {
  const startLatitude = start.latitude * DEG2RAD
  const endLatitude = end.latitude * DEG2RAD
  const latitudeDelta = (end.latitude - start.latitude) * DEG2RAD
  const longitudeDelta = shortestAngleDelta(start.longitude, end.longitude) * DEG2RAD
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2

  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)))
}

function shortestAngleDelta(start: number, end: number) {
  return normalizeLongitude(end - start)
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

function lerp(start: number, end: number, time: number) {
  return start + (end - start) * time
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
