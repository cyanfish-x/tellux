import * as THREE from 'three'
import type { CartographicInput, ClampInput, EntityOptions } from '../types'
import { PointGraphic } from './PointGraphic'
import { PolylineGraphic } from './PolylineGraphic'
import { PolygonGraphic } from './PolygonGraphic'
import { GroundPolylineGraphic } from './GroundPolylineGraphic'
import { PointGraphics, PolylineGraphics, PolygonGraphics } from './EntityGraphics'
import { tagObject3DWithEntity } from '../sampling/EntityPicker'
import {
  normalizeClamp,
  type EllipsoidLike,
  type GroundClampContext,
  type PolylinePickable
} from './groundClamp'

export interface EntityContext {
  toVector3: (input: CartographicInput, target: THREE.Vector3) => THREE.Vector3
  removeEntity: (entity: Entity) => void
  /** 当地椭球（贴地几何构建用）；getter 形式以跟随 terrain 切换。 */
  ellipsoid: () => EllipsoidLike
  /** 贴地渲染依赖；无贴地 pass（如 WebGPU）时为 `null`。 */
  groundClamp: GroundClampContext | null
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
  private groundPolylineGraphic: GroundPolylineGraphic | null = null
  private groundGroup: THREE.Group | null = null
  private groundClampRoot: THREE.Group | null = null
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
      warnUnsupportedClamp(options.point.clamp, id, 'point', 'P2')
      const position = new THREE.Vector3()
      if (options.position) {
        this.context.toVector3(options.position, position)
      }
      this.pointGraphic = new PointGraphic({ position, options: options.point })
      this.root.add(this.pointGraphic.object3D)
    }

    if (options.polyline) {
      this.buildPolyline(id, options)
    }

    if (options.polygon) {
      warnUnsupportedClamp(options.polygon.clamp, id, 'polygon', 'P1')
      const worldPositions = options.polygon.positions.map((input) => {
        const target = new THREE.Vector3()
        this.context.toVector3(input, target)
        return target
      })
      this.polygonGraphic = new PolygonGraphic({ worldPositions, options: options.polygon })
      this.root.add(this.polygonGraphic.object3D)
    }
  }

  /**
   * 折线分发：贴地（`clamp` 命中且 `offset===0` 且有贴地 pass）走 GPU 深度分类
   * 的 {@link GroundPolylineGraphic}（挂到共享 groundClampRoot 下的每实体子组）；
   * 否则走普通 {@link PolylineGraphic}（挂到实体自身 root）。
   */
  private buildPolyline(id: string, options: EntityOptions) {
    const polyline = options.polyline!
    const clamp = normalizeClamp(polyline.clamp)
    const groundClamp = this.context.groundClamp

    if (clamp && clamp.offset === 0 && groundClamp) {
      this.groundPolylineGraphic = new GroundPolylineGraphic({
        positions: polyline.positions,
        options: polyline,
        ellipsoid: this.context.ellipsoid(),
        uniforms: groundClamp.uniforms
      })
      const group = new THREE.Group()
      group.name = `${id}-ground`
      group.visible = this.currentShow
      tagObject3DWithEntity(group, this)
      group.add(this.groundPolylineGraphic.object3D)
      groundClamp.root.add(group)
      this.groundGroup = group
      this.groundClampRoot = groundClamp.root
      return
    }

    if (clamp) {
      // offset>0（P4 未实现）或无贴地 pass（WebGPU）→ 降级为绝对高普通折线。
      const reason = clamp.offset !== 0 ? 'offset>0 (P4 未实现)' : '当前渲染器不支持贴地（需 WebGL）'
      console.warn(`[tellux] 实体 "${id}" 的贴地折线降级为绝对高：${reason}。`)
    }

    const worldPositions = polyline.positions.map((input) => {
      const target = new THREE.Vector3()
      this.context.toVector3(input, target)
      return target
    })
    this.polylineGraphic = new PolylineGraphic({ worldPositions, options: polyline })
    this.root.add(this.polylineGraphic.object3D)
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
    if (this.groundGroup) this.groundGroup.visible = value
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

  /** 点图形底层对象；供 EntityPicker 做屏幕空间拾取。Underlying point graphic for screen-space picking. */
  get pointGraphicImpl() {
    return this.pointGraphic
  }

  /** 折线图形句柄；未挂载时为 `null`。Polyline graphics handle, or `null`. */
  get polyline() {
    return this.polylineGraphic ? new PolylineGraphics(this.polylineGraphic) : null
  }

  /** 多边形图形句柄；未挂载时为 `null`。Polygon graphics handle, or `null`. */
  get polygon() {
    return this.polygonGraphic ? new PolygonGraphics(this.polygonGraphic) : null
  }

  /**
   * 折线图形底层对象（普通或贴地）；供 EntityManager 同步 resolution、EntityPicker
   * 屏幕空间拾取。Underlying polyline graphic (plain or ground-clamped).
   */
  get polylineGraphicImpl(): PolylinePickable | null {
    return this.polylineGraphic ?? this.groundPolylineGraphic
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
    this.groundPolylineGraphic?.dispose()
    if (this.groundGroup && this.groundClampRoot) {
      this.groundClampRoot.remove(this.groundGroup)
    }
    this.context.removeEntity(this)
  }
}

/**
 * 对暂未实现贴地的图形类型（点/面）在用户传了 `clamp` 时告警一次并降级。
 *
 * Warns once and degrades gracefully when `clamp` is set on a graphic type whose
 * clamping is not yet implemented (point / polygon).
 */
function warnUnsupportedClamp(
  clamp: ClampInput | undefined,
  id: string,
  kind: string,
  phase: string
) {
  if (normalizeClamp(clamp)) {
    console.warn(
      `[tellux] 实体 "${id}" 的${kind}贴地（clamp）暂未实现（${phase}），已按绝对高渲染。`
    )
  }
}
