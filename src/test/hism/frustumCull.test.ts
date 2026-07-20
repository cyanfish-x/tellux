import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  intersectsSphere,
  updateFrustumFromCamera
} from '../../hism/spatial/frustumCull'

describe('frustumCull', () => {
  it('updates frustum from camera and tests sphere intersection', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const frustum = updateFrustumFromCamera(camera, new THREE.Frustum())
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2)

    expect(intersectsSphere(frustum, sphere)).toBe(true)
    expect(
      intersectsSphere(frustum, new THREE.Sphere(new THREE.Vector3(0, 0, 50), 1))
    ).toBe(false)
  })
})
