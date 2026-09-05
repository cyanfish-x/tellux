import type { Ellipsoid } from '3d-tiles-renderer'
import type { Object3D } from 'three'
import type { TelluxGlobeControls } from './TelluxGlobeControls'

/**
 * `viewer.controls` 的公开类型。实现仍是 {@link TelluxGlobeControls}，
 * 但公开面只承诺下列成员；其余请走 {@link ViewerControls.raw}。
 *
 * Public type of `viewer.controls`. The runtime object is still
 * {@link TelluxGlobeControls}, but only the members below are part of the
 * Tellux contract; everything else goes through {@link ViewerControls.raw}.
 */
export interface ViewerControls {
  /** 是否响应指针交互。Whether pointer interaction is enabled. */
  enabled: boolean
  /** 是否启用阻尼。Whether damping is enabled. */
  enableDamping: boolean
  /** 阻尼系数。Damping factor. */
  dampingFactor: number
  /**
   * 是否启用离地高度约束。与 `camera.allowUnderground` 联动。
   *
   * Whether the minimum-height constraint is enabled. Linked with
   * `camera.allowUnderground`.
   */
  adjustHeight: boolean
  /** 最小相机距离（米）。Minimum camera distance in meters. */
  minDistance: number
  /** 最大相机距离（米）。Maximum camera distance in meters. */
  maxDistance: number
  /** 最小俯仰（弧度）。Minimum pitch in radians. */
  minAltitude: number
  /** 最大俯仰（弧度）。Maximum pitch in radians. */
  maxAltitude: number
  /** 旋转速度。Rotation speed. */
  rotationSpeed: number
  /** 缩放速度。Zoom speed. */
  zoomSpeed: number
  addEventListener(
    type: 'change' | 'start' | 'end',
    listener: (event: object) => void
  ): void
  removeEventListener(
    type: 'change' | 'start' | 'end',
    listener: (event: object) => void
  ): void
  update(deltaTime?: number): void
  attach(domElement: HTMLElement): void
  detach(): void
  dispose(): void
  setEllipsoid(ellipsoid: Ellipsoid | null, ellipsoidGroup: Object3D | null): void
  /**
   * 完整控制器对象。与 `viewer.controls` 是**同一个实例**
   *（`viewer.controls.raw === viewer.controls`），只是换成未收窄的类型。
   *
   * Full controls object. This is the **same instance** as `viewer.controls`
   * (`viewer.controls.raw === viewer.controls`), viewed through the un-narrowed type.
   */
  readonly raw: TelluxGlobeControls
}
