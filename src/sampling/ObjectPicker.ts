import * as THREE from 'three'
import type { PickedObject, PickObjectOptions, ScreenPosition } from '../types'

/**
 * 通用 Object3D 拾取器：沿屏幕射线求交，返回最近命中（可限定根节点）。
 *
 * Generic Object3D picker: casts a screen ray and returns the closest hit
 * (optionally scoped to a root).
 */
export class ObjectPicker {
  private readonly coords = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly defaultRoot: THREE.Object3D
  ) {}

  pick(
    position: ScreenPosition,
    root: THREE.Object3D = this.defaultRoot,
    options: PickObjectOptions = {}
  ): PickedObject | null {
    return this.pickObjects(position, root, options)[0] ?? null
  }

  pickObjects(
    position: ScreenPosition,
    root: THREE.Object3D = this.defaultRoot,
    options: PickObjectOptions = {}
  ): PickedObject[] {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return []

    this.coords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.coords, this.camera)

    if (!root.visible) return []
    root.updateMatrixWorld(true)

    const recursive = options.recursive !== false
    const intersects = this.raycaster.intersectObject(root, recursive)

    const results: PickedObject[] = []
    for (const hit of intersects) {
      if (shouldIgnorePickObject(hit.object)) continue
      results.push({
        object: hit.object,
        point: hit.point.clone(),
        distance: hit.distance,
        faceIndex: hit.faceIndex ?? null
      })
    }
    return results
  }
}

function shouldIgnorePickObject(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (current.userData.telluxPickingIgnore) return true
    current = current.parent
  }
  return false
}
