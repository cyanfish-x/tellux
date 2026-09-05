import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { Camera } from '../Camera'
import { CAMERA_FRAME, DEG2RAD, RAD2DEG } from '../constants'
import { readLonLatHeight } from '../lonlat'
import type { TilesetManager } from '../tiles/TilesetManager'
import type { FlyToTargetOptions, FlyToTargetTarget } from '../types'

export interface TargetFlightControllerOptions {
  camera: Camera
  tilesets: TilesetManager
}

type PendingRootLoadFlight = {
  target: TilesRenderer
  listener: () => void
}

export class TargetFlightController {
  private readonly targetSphere = new THREE.Sphere()
  private readonly targetBox = new THREE.Box3()
  private readonly targetCenter = new THREE.Vector3()
  private readonly targetDirection = new THREE.Vector3()
  private readonly targetEast = new THREE.Vector3()
  private readonly targetNorth = new THREE.Vector3()
  private readonly targetUp = new THREE.Vector3()
  private readonly targetCamera = new THREE.PerspectiveCamera()
  private readonly targetCartographicScratch = { lat: 0, lon: 0, height: 0, azimuth: 0, elevation: 0, roll: 0 }
  private pendingRootLoadFlight: PendingRootLoadFlight | null = null
  private isDisposed = false

  constructor(private readonly options: TargetFlightControllerOptions) {}

  flyToTarget(target: FlyToTargetTarget, options: FlyToTargetOptions) {
    if (this.isDisposed) return

    this.clearPendingRootLoadFlight()
    if (this.applyTargetFlight(target, options)) return

    if (target instanceof TilesRenderer) {
      let pending: PendingRootLoadFlight
      const handleRootLoaded = () => {
        if (this.pendingRootLoadFlight !== pending) return

        this.clearPendingRootLoadFlight()
        if (this.isDisposed) return

        this.applyTargetFlight(target, options)
      }

      pending = {
        target,
        listener: handleRootLoaded
      }
      this.pendingRootLoadFlight = pending
      target.addEventListener('load-root-tileset', handleRootLoaded)
    }
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.clearPendingRootLoadFlight()
  }

  private clearPendingRootLoadFlight() {
    const pending = this.pendingRootLoadFlight
    if (!pending) return

    pending.target.removeEventListener('load-root-tileset', pending.listener)
    this.pendingRootLoadFlight = null
  }

  private applyTargetFlight(target: FlyToTargetTarget, options: FlyToTargetOptions) {
    const resolvedTarget = this.resolveFlyToTarget(target)
    if (!resolvedTarget) return false

    const ellipsoid = this.options.tilesets.tileset.ellipsoid
    const targetCartographic = ellipsoid.getPositionToCartographic(
      resolvedTarget.center,
      this.targetCartographicScratch
    )
    const offset = options.offset ?? {}
    const distance = offset.distance ?? Math.max(resolvedTarget.radius * 2.8, 500)
    const heading = offset.heading ?? 0
    const pitch = offset.pitch ?? -30
    const roll = offset.roll ?? 0

    ellipsoid.getEastNorthUpAxes(
      targetCartographic.lat,
      targetCartographic.lon,
      this.targetEast,
      this.targetNorth,
      this.targetUp
    )

    this.targetDirection
      .copy(this.targetEast)
      .multiplyScalar(Math.sin(heading * DEG2RAD) * Math.cos(pitch * DEG2RAD))
      .addScaledVector(this.targetNorth, Math.cos(heading * DEG2RAD) * Math.cos(pitch * DEG2RAD))
      .addScaledVector(this.targetUp, Math.sin(pitch * DEG2RAD))
      .normalize()

    this.targetCamera.position
      .copy(resolvedTarget.center)
      .addScaledVector(this.targetDirection, -Math.max(distance, 1))
    this.targetCamera.up.copy(this.targetUp)
    this.targetCamera.lookAt(resolvedTarget.center)
    this.targetCamera.rotateZ(roll * DEG2RAD)
    this.targetCamera.updateMatrixWorld(true)

    const cameraCartographic = ellipsoid.getCartographicFromObjectFrame(
      this.targetCamera.matrixWorld,
      this.targetCartographicScratch,
      CAMERA_FRAME
    )

    this.options.camera.flyTo({
      destination: {
        latitude: cameraCartographic.lat * RAD2DEG,
        longitude: cameraCartographic.lon * RAD2DEG,
        height: cameraCartographic.height
      },
      orientation: {
        heading: cameraCartographic.azimuth * RAD2DEG,
        pitch: cameraCartographic.elevation * RAD2DEG,
        roll: cameraCartographic.roll * RAD2DEG
      },
      duration: options.duration,
      maximumHeight: options.maximumHeight,
      complete: options.complete,
      cancel: options.cancel,
      easingFunction: options.easingFunction
    })
    return true
  }

  private resolveFlyToTarget(target: FlyToTargetTarget) {
    if (target instanceof TilesRenderer) {
      target.group.updateMatrixWorld(true)
      if (!target.getBoundingBox(this.targetBox)) return null

      this.targetCenter
        .copy(this.targetBox.getCenter(this.targetCenter))
        .applyMatrix4(target.group.matrixWorld)
      this.targetBox.getBoundingSphere(this.targetSphere)
      return {
        center: this.targetCenter,
        radius: Math.max(this.targetSphere.radius * target.group.matrixWorld.getMaxScaleOnAxis(), 1)
      }
    }

    if (target instanceof THREE.Object3D) {
      target.updateMatrixWorld(true)
      this.targetBox.setFromObject(target)
      if (this.targetBox.isEmpty()) return null

      this.targetBox.getCenter(this.targetCenter)
      this.targetBox.getBoundingSphere(this.targetSphere)
      return {
        center: this.targetCenter,
        radius: Math.max(this.targetSphere.radius, 1)
      }
    }

    const point = readLonLatHeight(target)
    this.options.tilesets.tileset.ellipsoid.getCartographicToPosition(
      point.latitude * DEG2RAD,
      point.longitude * DEG2RAD,
      point.height,
      this.targetCenter
    )
    return {
      center: this.targetCenter,
      radius: 1
    }
  }
}
