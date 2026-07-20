import * as THREE from 'three'

const projectionScreenMatrix = new THREE.Matrix4()
const sharedFrustum = new THREE.Frustum()

/**
 * 根据相机矩阵更新视锥体。
 *
 * Updates a frustum from the camera matrices.
 */
export function updateFrustumFromCamera(
  camera: THREE.Camera,
  target: THREE.Frustum = sharedFrustum
): THREE.Frustum {
  camera.updateMatrixWorld()
  projectionScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  )
  target.setFromProjectionMatrix(projectionScreenMatrix)
  return target
}

export function intersectsSphere(
  frustum: THREE.Frustum,
  sphere: THREE.Sphere
): boolean {
  return frustum.intersectsSphere(sphere)
}
