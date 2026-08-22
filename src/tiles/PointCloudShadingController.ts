import * as THREE from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'
import {
  applyPointCloudMaterialStyle,
  DEFAULT_POINT_CLOUD_PIXEL_SIZE
} from '../materials/materialMode'
import {
  resolvePointCloudShading,
  type PointCloudShadingOptions,
  type ResolvedPointCloudShading
} from '../types/pointCloudShading'
import { PointCloudShading } from './PointCloudShading'
import type { PointCloudColorTransform } from './PointCloudColorTransform'

/** Tile shape used by 3d-tiles-renderer processTileModel (subset). */
type PointCloudTile = {
  geometricError: number
  traversal?: {
    distanceFromCamera?: number
  }
}

type TrackedPoints = {
  points: THREE.Points
  tile: PointCloudTile
}

export type PointCloudEdlAggregate = {
  enabled: boolean
  strength: number
  radius: number
}

export interface PointCloudShadingControllerOptions {
  initial?: PointCloudShadingOptions | null
  getCamera: () => THREE.PerspectiveCamera
  getViewportSize: () => THREE.Vector2
  getErrorTarget: () => number
  colorTransform?: PointCloudColorTransform
  onEdlChange?: () => void
}

/**
 * 点云着色控制器：挂 tileset plugin，驱动 attenuation / normalShading 状态，
 * 并向后处理聚合 EDL 状态。
 *
 * Point-cloud shading controller: tileset plugin for attenuation / normalShading
 * state, and aggregates EDL state for post-processing.
 */
export class PointCloudShadingController {
  readonly priority = -5
  readonly shading: PointCloudShading

  private readonly tracked: TrackedPoints[] = []
  private readonly state: ResolvedPointCloudShading
  private disposed = false

  constructor(private readonly options: PointCloudShadingControllerOptions) {
    this.state = resolvePointCloudShading(options.initial)
    this.shading = new PointCloudShading(this.state, () => {
      this.reapplyAll()
      this.options.onEdlChange?.()
    })
  }

  processTileModel(scene: THREE.Object3D, tile: PointCloudTile) {
    if (this.disposed) return

    const size = this.computePointSize(tile)
    applyPointCloudMaterialStyle(scene, { size })
    this.options.colorTransform?.apply(scene)
    this.applyNormalShadingState(scene)
    this.trackPoints(scene, tile)
  }

  /**
   * 每帧刷新 attenuation 点大小（相机距离变化时）。
   *
   * Refreshes attenuated point sizes each frame as camera distance changes.
   */
  update() {
    if (this.disposed) return

    for (let i = this.tracked.length - 1; i >= 0; i--) {
      if (!this.tracked[i].points.parent) {
        this.tracked.splice(i, 1)
      }
    }

    if (!this.state.attenuation) return

    for (const entry of this.tracked) {
      const size = this.computePointSize(entry.tile)
      this.applySizeToPoints(entry.points, size)
    }
  }

  getEdlState(): PointCloudEdlAggregate {
    return {
      enabled: this.state.eyeDomeLighting,
      strength: this.state.eyeDomeLightingStrength,
      radius: this.state.eyeDomeLightingRadius
    }
  }

  dispose() {
    this.disposed = true
    this.tracked.length = 0
  }

  private reapplyAll() {
    const seen = new Set<THREE.Object3D>()
    for (const entry of this.tracked) {
      if (!entry.points.parent) continue
      const root = entry.points
      if (seen.has(root)) continue
      seen.add(root)
      const size = this.state.attenuation
        ? this.computePointSize(entry.tile)
        : DEFAULT_POINT_CLOUD_PIXEL_SIZE
      this.applySizeToPoints(entry.points, size)
      this.applyNormalShadingState(entry.points)
    }
  }

  private trackPoints(scene: THREE.Object3D, tile: PointCloudTile) {
    scene.traverse((object) => {
      if (!(object as THREE.Points).isPoints) return
      this.tracked.push({ points: object as THREE.Points, tile })
    })
  }

  private applyNormalShadingState(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object as THREE.Points).isPoints) return
      const points = object as THREE.Points
      const geometry = points.geometry as THREE.BufferGeometry
      const position = geometry.getAttribute('position')
      if (!position) return

      const hasNormal = Boolean(geometry.getAttribute('normal'))
      const normalEnabled = this.state.normalShading && hasNormal ? 1 : 0
      const existing = geometry.getAttribute('aTelluxPointNormalEnabled')
      if (
        existing &&
        existing.count === position.count &&
        existing.getX(0) === normalEnabled
      ) {
        return
      }

      const array = new Float32Array(position.count)
      array.fill(normalEnabled)
      geometry.setAttribute(
        'aTelluxPointNormalEnabled',
        new THREE.BufferAttribute(array, 1)
      )
    })
  }

  private applySizeToPoints(points: THREE.Points, size: number) {
    applyPointCloudMaterialStyle(points, { size })
  }

  /**
   * Tellux 屏幕像素 attenuation：
   * `min((ge * scale / distance) * depthMultiplier, maxAttenuation)`。
   * 非像素级照搬 Cesium，但语义同属 geometricError 驱动点大小。
   */
  private computePointSize(tile: PointCloudTile): number {
    if (!this.state.attenuation) {
      return DEFAULT_POINT_CLOUD_PIXEL_SIZE
    }

    const camera = this.options.getCamera()
    const viewport = this.options.getViewportSize()
    const distance = Math.max(
      tile.traversal?.distanceFromCamera ?? estimateTileDistance(tile, camera),
      1e-3
    )

    let geometricError = tile.geometricError
    if (
      (!Number.isFinite(geometricError) || geometricError <= 0) &&
      this.state.baseResolution !== undefined &&
      this.state.baseResolution > 0
    ) {
      geometricError = this.state.baseResolution
    }
    if (!Number.isFinite(geometricError) || geometricError <= 0) {
      return DEFAULT_POINT_CLOUD_PIXEL_SIZE
    }

    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    const depthMultiplier =
      viewport.y / (2 * Math.tan(Math.max(fovRad, 1e-4) / 2))
    const scaledError = geometricError * Math.max(this.state.geometricErrorScale, 0)
    const raw = (scaledError / distance) * depthMultiplier
    const maxAttenuation =
      this.state.maximumAttenuation ?? Math.max(this.options.getErrorTarget(), 1)

    return THREE.MathUtils.clamp(raw, 1, maxAttenuation)
  }
}

function estimateTileDistance(
  tile: PointCloudTile,
  camera: THREE.PerspectiveCamera
): number {
  // traversal 尚未填充时的保守回退（米级地球场景下避免除零）。
  void tile
  return Math.max(camera.position.length() * 0.02, 50)
}

/**
 * 从多个控制器聚合 EDL：任一图层开启则启用，强度/半径取开启图层中的最大。
 *
 * Aggregates EDL across controllers: enabled if any layer enables it;
 * strength/radius take the max among enabled layers.
 */
export function aggregatePointCloudEdl(
  controllers: Iterable<PointCloudShadingController>
): PointCloudEdlAggregate {
  let enabled = false
  let strength = 1
  let radius = 1

  for (const controller of controllers) {
    const state = controller.getEdlState()
    if (!state.enabled) continue
    if (!enabled) {
      enabled = true
      strength = state.strength
      radius = state.radius
    } else {
      strength = Math.max(strength, state.strength)
      radius = Math.max(radius, state.radius)
    }
  }

  return { enabled, strength, radius }
}

/**
 * 注册点云着色 plugin，并在 tileset dispose 时清理。
 *
 * Registers the shading plugin and disposes with the tileset.
 */
export function attachPointCloudShadingController(
  tileset: TilesRenderer,
  controller: PointCloudShadingController
) {
  tileset.registerPlugin(controller)
  const previousDispose = tileset.dispose.bind(tileset)
  tileset.dispose = () => {
    controller.dispose()
    previousDispose()
  }
}
