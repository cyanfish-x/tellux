import * as THREE from 'three'
import {
  createEncodedCartesian3,
  encodeCartesian3
} from '../utils/EncodedCartesian3'

/**
 * 维护一组相机相关的 RTC uniform，每帧由外部调用 `update()` 刷新。
 *
 * 同一相机下的所有 RTC 实例化 mesh 应共享同一份 `RTCAutoUniforms`，让 Three.js
 * 在 uniform 去重时合并上传。uniform 命名刻意避开 Three.js 内置的 `viewMatrix`
 * / `projectionMatrix`，防止与内置冲突。
 *
 * - `u_cameraHigh` / `u_cameraLow`：相机 ECEF 位置的高/低拆分。
 * - `u_viewMatrixRTE`：相机 `matrixWorldInverse` 去掉平移列，仅保留旋转，把世界
 *   空间的"相对眼点"位置变到眼空间。
 * - `u_projectionMatrix`：与 Three.js 内置 projectionMatrix 同值，但 material
 *   onBeforeCompile 注入的 uniform 不会被内置 uniform 自动覆盖，需显式提供。
 */
export class RTCAutoUniforms {
  readonly uniforms: Readonly<{
    u_cameraHigh: THREE.IUniform<THREE.Vector3>
    u_cameraLow: THREE.IUniform<THREE.Vector3>
    u_viewMatrixRTE: THREE.IUniform<THREE.Matrix4>
    u_projectionMatrix: THREE.IUniform<THREE.Matrix4>
  }>

  private readonly scratchEncoded = createEncodedCartesian3()

  constructor(private readonly camera: THREE.Camera) {
    this.uniforms = {
      u_cameraHigh: { value: new THREE.Vector3() },
      u_cameraLow: { value: new THREE.Vector3() },
      u_viewMatrixRTE: { value: new THREE.Matrix4() },
      u_projectionMatrix: { value: new THREE.Matrix4() }
    }
  }

  /**
   * 在渲染循环里调用，把当前相机的位置/姿态编码到 uniform。
   *
   * 必须在 Three.js 渲染前调用——若挂在 `mesh.onBeforeRender` 上也行，但放到
   * per-frame loop 一次性更新可避免多个 mesh 重复算。
   */
  update(): void {
    const camera = this.camera
    camera.updateMatrixWorld()
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert()

    encodeCartesian3(camera.position, this.scratchEncoded)
    this.uniforms.u_cameraHigh.value.copy(this.scratchEncoded.high)
    this.uniforms.u_cameraLow.value.copy(this.scratchEncoded.low)

    const viewRTE = this.uniforms.u_viewMatrixRTE.value
    viewRTE.copy(camera.matrixWorldInverse)
    const e = viewRTE.elements
    e[12] = 0
    e[13] = 0
    e[14] = 0
    e[15] = 1

    if (camera instanceof THREE.PerspectiveCamera) {
      this.uniforms.u_projectionMatrix.value.copy(camera.projectionMatrix)
    }
  }
}
