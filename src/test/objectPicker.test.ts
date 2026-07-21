import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ObjectPicker } from '../sampling/ObjectPicker'

function createPicker(scene: THREE.Scene, canvas = { clientWidth: 100, clientHeight: 100 }) {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return new ObjectPicker(canvas as HTMLCanvasElement, camera, scene)
}

describe('ObjectPicker', () => {
  it('picks the closest mesh in the scene', () => {
    const scene = new THREE.Scene()
    const near = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    near.position.set(0, 0, 0)
    const far = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    far.position.set(0, 0, -3)
    scene.add(near, far)
    scene.updateMatrixWorld(true)

    const picker = createPicker(scene)
    const hit = picker.pick({ x: 50, y: 50 })
    expect(hit).not.toBeNull()
    expect(hit!.object).toBe(near)
  })

  it('scopes picking to a root and skips telluxPickingIgnore', () => {
    const scene = new THREE.Scene()
    const root = new THREE.Group()
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    root.add(mesh)
    const ignored = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial()
    )
    ignored.userData.telluxPickingIgnore = true
    scene.add(root, ignored)
    scene.updateMatrixWorld(true)

    const picker = createPicker(scene)
    expect(picker.pick({ x: 50, y: 50 }, root)?.object).toBe(mesh)
    expect(picker.pick({ x: 50, y: 50 }, ignored)).toBeNull()
  })
})
