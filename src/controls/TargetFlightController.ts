import * as THREE from 'three'
import { TilesRenderer } from '3d-tiles-renderer'
import { Camera } from '../Camera'
import { CAMERA_FRAME, DEG2RAD, RAD2DEG } from '../constants'
import type { TilesetManager } from '../tiles/TilesetManager'
import type { FlyToTargetOptions, FlyToTargetTarget } from '../types'

export interface TargetFlightControllerOptions {
  camera: Camera
  tilesets: TilesetManager
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

  constructor(private readonly options: TargetFlightControllerOptions) {}

  flyToTarget(target: FlyToTargetTarget, options: FlyToTargetOptions) {
    if (this.applyTargetFlight(target, options)) return

    if (target instanceof TilesRenderer) {
      const handleRootLoaded = () => {
        target.removeEventListener('load-root-tileset', handleRootLoaded)
        this.applyTargetFlight(target, options)
      }

      target.addEventListener('load-root-tileset', handleRootLoaded)
    }
  }

  private applyTargetFlight(target: FlyToTargetTarget, options: FlyToTargetOptions) {
    const resolvedTarget = this.resolveFlyToTarget(target)
    if (!resolvedTarget) return false

    const ellipsoid = this.options.tilesets.tileset.ellipsoid
    const targetCartographic = ellipsoid.getPositionToCartographic(
      resolvedTarget.center,
      this.targetCartographicScratch
    )
    const distance = options.distance ?? Math.max(resolvedTarget.radius * 2.8, 500)
    const heading = options.heading ?? 0
    const pitch = options.pitch ?? -30
    const roll = options.roll ?? 0

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

    this.options.tilesets.tileset.ellipsoid.getCartographicToPosition(
      target.latitude * DEG2RAD,
      target.longitude * DEG2RAD,
      target.height,
      this.targetCenter
    )
    return {
      center: this.targetCenter,
      radius: 1
    }
  }
}
