import * as THREE from 'three'
import type { CartographicInput, EntityOptions } from '../types'
import { PointGraphic } from './PointGraphic'
import { PolylineGraphic } from './PolylineGraphic'
import { PolygonGraphic } from './PolygonGraphic'
import { GroundPolylineGraphic } from './GroundPolylineGraphic'
import { GroundPolygonGraphic } from './GroundPolygonGraphic'
import { SymbolGraphic } from './SymbolGraphic'
import { PointGraphics, PolylineGraphics, PolygonGraphics, SymbolGraphics } from './EntityGraphics'
import { tagObject3DWithEntity } from '../sampling/EntityPicker'
import type {
  EllipsoidLike,
  GroundClampContext,
  PolylinePickable
} from './groundClamp'
import {
  resolveColor as defaultResolveColor,
  type ResolveColor
} from './invertToneMapping'

export interface EntityPickGraphics {
  readonly point: PointGraphic | null
  readonly polyline: PolylinePickable | null
  readonly symbol: SymbolGraphic | null
}

const entityPickGraphics = new WeakMap<Entity, EntityPickGraphics>()

export function getEntityPickGraphics(entity: Entity): EntityPickGraphics | undefined {
  return entityPickGraphics.get(entity)
}

export interface EntityContext {
  toVector3: (input: CartographicInput, target: THREE.Vector3) => THREE.Vector3
  removeEntity: (entity: Entity) => void
  /** 当地椭球（贴地几何构建用）；getter 形式以跟随 terrain 切换。 */
  ellipsoid: () => EllipsoidLike
  /** 贴地渲染依赖；无贴地 pass（如 WebGPU）时为 `null`。 */
  groundClamp: GroundClampContext | null
  /** 渲染器像素比 getter（symbol 像素尺寸 / 文字 SDF 超采样用）。 */
  pixelRatio: () => number
  /**
   * 当前 Viewer 的实体颜色解析函数；未提供时使用默认解析器。
   *
   * Entity color resolver for the current Viewer. Uses the default resolver when omitted.
   */
  resolveColor?: ResolveColor
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
  private groundPolygonGraphic: GroundPolygonGraphic | null = null
  private symbolGraphic: SymbolGraphic | null = null
  private groundGroup: THREE.Group | null = null
  private groundClampRoot: THREE.Group | null = null
  private currentPosition: CartographicInput | undefined
  private currentShow: boolean
  private isRemoved = false
  private readonly resolveColor: ResolveColor

  constructor(
    id: string,
    options: EntityOptions,
    private readonly context: EntityContext
  ) {
    this.resolveColor = this.context.resolveColor ?? defaultResolveColor
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
      this.pointGraphic = new PointGraphic({
        position,
        options: options.point,
        resolveColor: this.resolveColor
      })
      this.root.add(this.pointGraphic.object3D)
    }

    if (options.polyline) {
      this.buildPolyline(id, options)
    }

    if (options.polygon) {
      this.buildPolygon(id, options)
    }

    if (options.symbol) {
      const position = new THREE.Vector3()
      if (options.position) {
        this.context.toVector3(options.position, position)
      }
      this.symbolGraphic = new SymbolGraphic({
        position,
        options: options.symbol,
        pixelRatio: this.context.pixelRatio()
      })
      this.root.add(this.symbolGraphic.object3D)
    }

    const self = this
    entityPickGraphics.set(this, {
      get point() {
        return self.pointGraphic
      },
      get polyline() {
        return self.polylineGraphic ?? self.groundPolylineGraphic
      },
      get symbol() {
        return self.symbolGraphic
      }
    })
  }

  /**
   * 折线分发：`clamp: true` 且有贴地 pass 时走 GPU 深度分类
   * 的 {@link GroundPolylineGraphic}（挂到共享 groundClampRoot 下的每实体子组）；
   * 否则走普通 {@link PolylineGraphic}（挂到实体自身 root）。
   */
  private buildPolyline(id: string, options: EntityOptions) {
    const polyline = options.polyline!
    const clamp = polyline.clamp === true
    const groundClamp = this.context.groundClamp

    if (clamp && groundClamp) {
      this.groundPolylineGraphic = new GroundPolylineGraphic({
        positions: polyline.positions,
        options: polyline,
        ellipsoid: this.context.ellipsoid(),
        uniforms: groundClamp.uniforms,
        resolveColor: this.resolveColor
      })
      this.ensureGroundGroup(id, groundClamp.root).add(this.groundPolylineGraphic.object3D)
      return
    }

    if (clamp) {
      console.warn(`[tellux] 实体 "${id}" 的贴地折线降级为绝对高：当前渲染器不支持贴地（需 WebGL）。`)
    }

    const worldPositions = polyline.positions.map((input) => {
      const target = new THREE.Vector3()
      this.context.toVector3(input, target)
      return target
    })
    this.polylineGraphic = new PolylineGraphic({
      worldPositions,
      options: polyline,
      resolveColor: this.resolveColor
    })
    this.root.add(this.polylineGraphic.object3D)
  }

  /**
   * 多边形分发：`clamp: true` 且有贴地 pass 时走 GPU 深度分类
   * 的 {@link GroundPolygonGraphic}；否则走普通 {@link PolygonGraphic}。贴地时
   * `height` 按设计被忽略（§4.2）；`extrudeHeight` / `outline` 暂未支持，告警忽略。
   */
  private buildPolygon(id: string, options: EntityOptions) {
    const polygon = options.polygon!
    const clamp = polygon.clamp === true
    const groundClamp = this.context.groundClamp

    if (clamp && groundClamp) {
      if (polygon.extrudeHeight !== undefined) {
        console.warn(`[tellux] 实体 "${id}"：贴地面暂不支持 extrudeHeight（后续阶段），已忽略。`)
      }
      if (polygon.outline) {
        console.warn(`[tellux] 实体 "${id}"：贴地面暂不支持 outline（后续阶段），已忽略。`)
      }
      if ((polygon.fill ?? true) === false) {
        console.warn(`[tellux] 实体 "${id}"：贴地面 fill:false 且无 outline，跳过绘制。`)
        return
      }
      this.groundPolygonGraphic = new GroundPolygonGraphic({
        positions: polygon.positions,
        options: polygon,
        ellipsoid: this.context.ellipsoid(),
        uniforms: groundClamp.uniforms,
        resolveColor: this.resolveColor
      })
      this.ensureGroundGroup(id, groundClamp.root).add(this.groundPolygonGraphic.object3D)
      return
    }

    if (clamp) {
      console.warn(`[tellux] 实体 "${id}" 的贴地面降级为绝对高：当前渲染器不支持贴地（需 WebGL）。`)
    }

    const worldPositions = polygon.positions.map((input) => {
      const target = new THREE.Vector3()
      this.context.toVector3(input, target)
      return target
    })
    this.polygonGraphic = new PolygonGraphic({
      worldPositions,
      options: polygon,
      resolveColor: this.resolveColor
    })
    this.root.add(this.polygonGraphic.object3D)
  }

  /** 每实体一个的贴地子组（挂在共享 groundClampRoot 下），show/remove 与实体同步。 */
  private ensureGroundGroup(id: string, groundClampRoot: THREE.Group): THREE.Group {
    if (this.groundGroup) return this.groundGroup
    const group = new THREE.Group()
    group.name = `${id}-ground`
    group.visible = this.currentShow
    tagObject3DWithEntity(group, this)
    groundClampRoot.add(group)
    this.groundGroup = group
    this.groundClampRoot = groundClampRoot
    return group
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
    if (value && (this.pointGraphic || this.symbolGraphic)) {
      const target = new THREE.Vector3()
      this.context.toVector3(value, target)
      this.pointGraphic?.setPosition(target)
      this.symbolGraphic?.setPosition(target)
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

  /** Symbol 图形句柄；未挂载时为 `null`。Symbol graphics handle, or `null`. */
  get symbol() {
    return this.symbolGraphic ? new SymbolGraphics(this.symbolGraphic) : null
  }

  /** 自定义属性。Custom properties. */
  readonly properties: Record<string, unknown> = {}

  update(deltaTime: number) {
    if (this.isRemoved) return
    // 首期几何无动画，保留接口对齐 ModelManager.update。
    // First-phase geometry has no animation; the interface is kept to mirror ModelManager.update.
  }

  /** 重新解析所有参与主画面色调映射的颜色。Re-resolves all tone-mapped colors. */
  refreshColors() {
    this.pointGraphic?.refreshColors()
    this.polylineGraphic?.refreshColors()
    this.polygonGraphic?.refreshColors()
    this.groundPolylineGraphic?.refreshColors()
    this.groundPolygonGraphic?.refreshColors()
  }

  remove() {
    if (this.isRemoved) return
    this.isRemoved = true
    this.pointGraphic?.dispose()
    this.polylineGraphic?.dispose()
    this.polygonGraphic?.dispose()
    this.groundPolylineGraphic?.dispose()
    this.groundPolygonGraphic?.dispose()
    this.symbolGraphic?.dispose()
    if (this.groundGroup && this.groundClampRoot) {
      this.groundClampRoot.remove(this.groundGroup)
    }
    this.context.removeEntity(this)
  }
}
