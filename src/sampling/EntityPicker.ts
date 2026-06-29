import * as THREE from 'three'
import type { PickedEntity, ScreenPosition } from '../types'
import type { EntityManager } from '../entities/EntityManager'

const ENTITY_KEY = 'telluxEntity'

/**
 * 实体拾取器。沿屏幕坐标发射射线，遍历实体根节点返回最近命中的实体。
 *
 * Entity picker. Casts a ray from a screen position through the entities root
 * and returns the closest hit entity.
 */
export class EntityPicker {
  private readonly coords = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly entityManager: EntityManager
  ) {}

  pick(position: ScreenPosition): PickedEntity | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return null

    this.coords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.coords, this.camera)

    const root = this.entityManager.root
    if (!root.visible) return null
    root.updateMatrixWorld(true)

    const intersects = this.raycaster.intersectObject(root, true)
    for (const intersect of intersects) {
      const entity = this.findEntity(intersect.object)
      if (entity) {
        return {
          entity,
          point: intersect.point.clone(),
          distance: intersect.distance
        }
      }
    }
    return null
  }

  private findEntity(object: THREE.Object3D): import('../entities/Entity').Entity | null {
    let current: THREE.Object3D | null = object
    while (current) {
      const entity = current.userData[ENTITY_KEY]
      if (entity) return entity as import('../entities/Entity').Entity
      current = current.parent
    }
    return null
  }
}

/**
 * 把实体引用标记到 Object3D，供 EntityPicker 从命中对象回溯到 Entity。
 *
 * Tags an Object3D with its owning entity so EntityPicker can resolve a hit
 * object back to the Entity.
 */
export function tagObject3DWithEntity(object: THREE.Object3D, entity: import('../entities/Entity').Entity) {
  object.userData[ENTITY_KEY] = entity
}
