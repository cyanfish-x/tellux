import * as THREE from 'three'
import type { EntityOptions, LonLatHeightLike } from '../types'
import { Entity, getEntityPickGraphics } from './Entity'
import type { EllipsoidLike, GroundClampContext } from './groundClamp'
import { resolveColor, type ResolveColor } from './invertToneMapping'

export interface EntityManagerOptions {
  scene: THREE.Scene
  toVector3: (input: LonLatHeightLike, target: THREE.Vector3) => THREE.Vector3
  /** 当地椭球 getter（贴地几何构建用）。 */
  ellipsoid: () => EllipsoidLike
  /** 贴地渲染依赖；无贴地 pass（如 WebGPU）时为 `null`。 */
  groundClamp: GroundClampContext | null
  /** 渲染器像素比 getter（symbol 像素尺寸 / 文字 SDF 超采样用）。 */
  pixelRatio: () => number
  /**
   * 当前 Viewer 的实体颜色解析函数；未提供时使用默认 AgX / exposure 1。
   *
   * Entity color resolver for the current Viewer. Defaults to AgX / exposure 1.
   */
  resolveColor?: ResolveColor
}

export function syncEntityManagerResolution(
  manager: EntityManager,
  width: number,
  height: number,
  pixelRatio: number
) {
  entityManagerResolution.get(manager)?.(width, height, pixelRatio)
}

const entityManagerResolution = new WeakMap<
  EntityManager,
  (width: number, height: number, pixelRatio: number) => void
>()

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
  private lastWidth = 0
  private lastHeight = 0
  private lastPixelRatio = 1

  constructor(private readonly options: EntityManagerOptions) {
    this.entitiesRoot.name = 'tellux-entities'
    this.options.scene.add(this.entitiesRoot)
    entityManagerResolution.set(this, (width, height, pixelRatio) => {
      this.lastWidth = width
      this.lastHeight = height
      this.lastPixelRatio = pixelRatio
      this.entities.forEach((entity) => {
        const graphics = getEntityPickGraphics(entity)
        graphics?.polyline?.syncResolution(width, height)
        graphics?.symbol?.syncResolution(width, height, pixelRatio)
      })
    })
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
      removeEntity: (target) => this.removeEntity(target),
      ellipsoid: this.options.ellipsoid,
      groundClamp: this.options.groundClamp,
      pixelRatio: this.options.pixelRatio,
      resolveColor: this.options.resolveColor ?? resolveColor
    })
    this.entities.set(id, entity)
    this.entitiesRoot.add(entity.object3D)
    // 把当前分辨率 / 像素比推给新实体，确保 add 后无需等 resize 即正确渲染。
    // Push current resolution / pixel ratio so the new entity renders correctly
    // without waiting for a resize.
    if (this.lastWidth > 0) {
      const graphics = getEntityPickGraphics(entity)
      graphics?.polyline?.syncResolution(this.lastWidth, this.lastHeight)
      graphics?.symbol?.syncResolution(this.lastWidth, this.lastHeight, this.lastPixelRatio)
    }
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

  /** 重新解析已有实体颜色。Re-resolves colors for existing entities. */
  refreshColors() {
    this.entities.forEach((entity) => entity.refreshColors())
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
