import * as THREE from 'three'
import { EnvironmentControls, GlobeControls as BaseGlobeControls } from '3d-tiles-renderer'

type ControlsWithPivotMesh = BaseGlobeControls & {
  pivotMesh?: THREE.Mesh
}

export class TelluxGlobeControls extends BaseGlobeControls {
  // 解除默认视角上限：基类 maxAltitude = 0.45π（≈81°），右键向上拖动到接近地平线就被卡住，
  // 无法看向天空。此处放宽到接近天顶（留 1e-2 余量避开正上方叉积退化导致的抖动）。
  //
  // Lift the default view-angle ceiling: the base sets maxAltitude = 0.45π (≈81°), so a
  // right-drag up gets stuck near the horizon and can't look at the sky. Relax it to near
  // zenith (1e-2 margin avoids the cross-product singularity — and thus jitter — at exactly π).
  maxAltitude = Math.PI - 1e-2

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
