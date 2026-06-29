import * as THREE from 'three'
import type { CartographicInput, EntityOptions } from '../types'
import { Entity } from './Entity'

export interface EntityManagerOptions {
  scene: THREE.Scene
  toVector3: (input: CartographicInput, target: THREE.Vector3) => THREE.Vector3
}

/**
 * 实体集合管理器。提供 `viewer.entities` 上的增删查改接口，并维护一个
 * 挂在场景根节点下的 `THREE.Group` 容器。
 *
 * Entity collection manager. Provides the add/remove/query API exposed on
 * `viewer.entities` and owns a `THREE.Group` container attached under the
 * scene root.
 */
export class EntityManager {
  private readonly entities = new Map<string, Entity>()
  private readonly entitiesRoot = new THREE.Group()
  private nextEntityId = 0

  constructor(private readonly options: EntityManagerOptions) {
    this.entitiesRoot.name = 'tellux-entities'
    this.options.scene.add(this.entitiesRoot)
  }

  /** 实体根节点；供 EntityPicker 拾取。Entities root node, used by EntityPicker. */
  get root() {
    return this.entitiesRoot
  }

  add(options: EntityOptions): Entity {
    const id = options.id ?? this.createEntityId()
    if (this.entities.has(id)) {
      throw new Error(`Viewer: entity "${id}" already exists.`)
    }

    const entity = new Entity(id, options, {
      toVector3: this.options.toVector3,
      removeEntity: (target) => this.removeEntity(target)
    })
    this.entities.set(id, entity)
    this.entitiesRoot.add(entity.object3D)
    return entity
  }

  remove(target: string | Entity): boolean {
    const entity = typeof target === 'string' ? this.entities.get(target) : target
    if (!entity || !this.entities.has(entity.id)) return false
    entity.remove()
    return true
  }

  getById(id: string): Entity | undefined {
    return this.entities.get(id)
  }

  contains(id: string): boolean {
    return this.entities.has(id)
  }

  get values(): readonly Entity[] {
    return Array.from(this.entities.values())
  }

  removeAll() {
    Array.from(this.entities.values()).forEach((entity) => entity.remove())
  }

  update(deltaTime: number) {
    this.entities.forEach((entity) => entity.update(deltaTime))
  }

  /**
   * 同步 LineMaterial 的 resolution（绘制缓冲像素尺寸），保证折线宽度正确。
   *
   * Syncs LineMaterial resolution (drawing buffer pixel size) so polyline width
   * renders correctly.
   */
  syncResolution(width: number, height: number) {
    this.entities.forEach((entity) => {
      entity.polylineGraphicImpl?.syncResolution(width, height)
    })
  }

  dispose() {
    Array.from(this.entities.values()).forEach((entity) => entity.remove())
    this.entities.clear()
    this.options.scene.remove(this.entitiesRoot)
  }

  private removeEntity(entity: Entity) {
    if (!this.entities.has(entity.id)) return
    this.entities.delete(entity.id)
    this.entitiesRoot.remove(entity.object3D)
  }

  private createEntityId(): string {
    do {
      this.nextEntityId += 1
    } while (this.entities.has(`entity-${this.nextEntityId}`))
    return `entity-${this.nextEntityId}`
  }
}
