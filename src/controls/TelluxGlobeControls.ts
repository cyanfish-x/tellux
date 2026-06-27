import * as THREE from 'three'
import { EnvironmentControls, GlobeControls as BaseGlobeControls } from '3d-tiles-renderer'

type ControlsWithPivotMesh = BaseGlobeControls & {
  pivotMesh?: THREE.Mesh
}

export class TelluxGlobeControls extends BaseGlobeControls {
  useWebGPUCompatiblePivotMaterial() {
    const pivotMesh = (this as ControlsWithPivotMesh).pivotMesh
    if (!pivotMesh) return

    if (Array.isArray(pivotMesh.material)) {
      pivotMesh.material.forEach((material) => material.dispose())
    } else {
      pivotMesh.material?.dispose()
    }

    pivotMesh.material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.75
    })
    pivotMesh.onBeforeRender = () => {}
  }

  _updateRotation(deltaTime: number) {
    ;(
      EnvironmentControls.prototype as unknown as {
        _updateRotation(this: TelluxGlobeControls, deltaTime: number): void
      }
    )._updateRotation.call(this, deltaTime)
  }
}
