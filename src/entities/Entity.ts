import * as THREE from 'three'
import type { CartographicInput, EntityOptions } from '../types'
import { PointGraphic } from './PointGraphic'
import { PolylineGraphic } from './PolylineGraphic'
import { PolygonGraphic } from './PolygonGraphic'
import { PointGraphics, PolylineGraphics, PolygonGraphics } from './EntityGraphics'
import { tagObject3DWithEntity } from '../sampling/EntityPicker'

export interface EntityContext {
  toVector3: (input: CartographicInput, target: THREE.Vector3) => THREE.Vector3
  removeEntity: (entity: Entity) => void
}

/**
 * 实体。一个实体可以挂载任意组合的点、线、面图形组件，共享同一个 id、
 * 位置和自定义属性。
 *
 * An entity may attach any combination of point, polyline and polygon graphics
 * that share the same id, position and custom properties.
 */
export class Entity {
  readonly id: string
  private root: THREE.Group
  private pointGraphic: PointGraphic | null = null
  private polylineGraphic: PolylineGraphic | null = null
  private polygonGraphic: PolygonGraphic | null = null
  private currentPosition: CartographicInput | undefined
  private currentShow: boolean
  private isRemoved = false

  constructor(
    id: string,
    options: EntityOptions,
    private readonly context: EntityContext
  ) {
    this.id = id
    this.currentShow = options.show ?? true
    this.currentPosition = options.position
    if (options.properties) {
      Object.assign(this.properties, options.properties)
    }
    this.root = new THREE.Group()
    this.root.name = id
    this.root.visible = this.currentShow
    tagObject3DWithEntity(this.root, this)

    if (options.point) {
      const position = new THREE.Vector3()
      if (options.position) {
        this.context.toVector3(options.position, position)
      }
      this.pointGraphic = new PointGraphic({ position, options: options.point })
      this.root.add(this.pointGraphic.object3D)
    }

    if (options.polyline) {
      const worldPositions = options.polyline.positions.map((input) => {
        const target = new THREE.Vector3()
        this.context.toVector3(input, target)
        return target
      })
      this.polylineGraphic = new PolylineGraphic({ worldPositions, options: options.polyline })
      this.root.add(this.polylineGraphic.object3D)
    }

    if (options.polygon) {
      const worldPositions = options.polygon.positions.map((input) => {
        const target = new THREE.Vector3()
        this.context.toVector3(input, target)
        return target
      })
      this.polygonGraphic = new PolygonGraphic({ worldPositions, options: options.polygon })
      this.root.add(this.polygonGraphic.object3D)
    }
  }

  /** 实体根 Object3D，由 EntityManager 挂到场景。Root Object3D, attached to the scene by EntityManager. */
  get object3D() {
    return this.root
  }

  get show() {
    return this.currentShow
  }

  set show(value: boolean) {
    this.currentShow = value
    this.root.visible = value
  }

  get position() {
    return this.currentPosition
  }

  set position(value: CartographicInput | undefined) {
    this.currentPosition = value
    if (value && this.pointGraphic) {
      const target = new THREE.Vector3()
      this.context.toVector3(value, target)
      this.pointGraphic.setPosition(target)
    }
  }

  /** 点图形句柄；未挂载时为 `null`。Point graphics handle, or `null`. */
  get point() {
    return this.pointGraphic ? new PointGraphics(this.pointGraphic) : null
  }

  /** 折线图形句柄；未挂载时为 `null`。Polyline graphics handle, or `null`. */
  get polyline() {
    return this.polylineGraphic ? new PolylineGraphics(this.polylineGraphic) : null
  }

  /** 多边形图形句柄；未挂载时为 `null`。Polygon graphics handle, or `null`. */
  get polygon() {
    return this.polygonGraphic ? new PolygonGraphics(this.polygonGraphic) : null
  }

  /** 折线图形底层对象；供 EntityManager 同步 resolution。Underlying polyline graphic for resolution sync. */
  get polylineGraphicImpl() {
    return this.polylineGraphic
  }

  /** 自定义属性。Custom properties. */
  readonly properties: Record<string, unknown> = {}

  update(deltaTime: number) {
    if (this.isRemoved) return
    // 首期几何无动画，保留接口对齐 ModelManager.update。
    // First-phase geometry has no animation; the interface is kept to mirror ModelManager.update.
  }

  remove() {
    if (this.isRemoved) return
    this.isRemoved = true
    this.pointGraphic?.dispose()
    this.polylineGraphic?.dispose()
    this.polygonGraphic?.dispose()
    this.context.removeEntity(this)
  }
}
