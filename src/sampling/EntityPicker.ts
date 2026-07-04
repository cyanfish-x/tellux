import * as THREE from 'three'
import type { PickedEntity, PickEntityOptions, ScreenPosition } from '../types'
import type { EntityManager } from '../entities/EntityManager'
import type { Entity } from '../entities/Entity'

const ENTITY_KEY = 'telluxEntity'

interface EntityPickCandidate extends PickedEntity {
  readonly screenDistance: number
}

/**
 * 实体拾取器。沿屏幕坐标发射射线，遍历实体根节点返回最近命中的实体。
 *
 * Entity picker. Casts a ray from a screen position through the entities root
 * and returns the closest hit entity.
 */
export class EntityPicker {
  private readonly coords = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()
  private readonly point = new THREE.Vector3()
  private readonly projectedPoint = new THREE.Vector3()
  private readonly screenPoint = new THREE.Vector2()
  private readonly closestScreenPoint = new THREE.Vector2()
  private readonly segmentStart = new THREE.Vector2()
  private readonly segmentEnd = new THREE.Vector2()
  private readonly pickedLinePoint = new THREE.Vector3()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly entityManager: EntityManager
  ) {}

  pick(position: ScreenPosition, options: PickEntityOptions = {}): PickedEntity | null {
    return this.pickEntities(position, options)[0] ?? null
  }

  pickEntities(position: ScreenPosition, options: PickEntityOptions = {}): PickedEntity[] {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return []

    const tolerance = Math.max(0, options.tolerance ?? 0)
    this.coords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.coords, this.camera)

    const root = this.entityManager.root
    if (!root.visible) return []
    root.updateMatrixWorld(true)

    const picked = new Map<Entity, EntityPickCandidate>()
    this.addCandidates(picked, this.pickScreenSpaceEntities(position, tolerance, width, height))

    const intersects = this.raycaster.intersectObject(root, true)
    for (const intersect of intersects) {
      if (this.isScreenSpacePickedObject(intersect.object)) continue

      const entity = this.findEntity(intersect.object)
      if (entity) {
        this.addCandidate(picked, {
          entity,
          point: intersect.point.clone(),
          distance: intersect.distance,
          screenDistance: 0
        })
      }
    }

    return Array.from(picked.values())
      .sort(comparePickCandidates)
      .map(({ entity, point, distance }) => ({ entity, point, distance }))
  }

  private pickScreenSpaceEntities(
    position: ScreenPosition,
    tolerance: number,
    width: number,
    height: number
  ): EntityPickCandidate[] {
    const picked = new Map<Entity, EntityPickCandidate>()
    const mouse = this.screenPoint.set(position.x, position.y)

    for (const entity of this.entityManager.values) {
      if (!entity.show || !entity.object3D.visible) continue

      const pointHit = this.pickPointEntity(entity, mouse, tolerance, width, height)
      this.addCandidate(picked, pointHit)

      const lineHit = this.pickPolylineEntity(entity, mouse, tolerance, width, height)
      this.addCandidate(picked, lineHit)

      const symbolHit = this.pickSymbolEntity(entity, mouse, width, height)
      this.addCandidate(picked, symbolHit)
    }

    return Array.from(picked.values())
  }

  private pickPointEntity(
    entity: Entity,
    mouse: THREE.Vector2,
    tolerance: number,
    width: number,
    height: number
  ): EntityPickCandidate | null {
    const graphic = entity.pointGraphicImpl
    if (!graphic) return null

    const worldPoint = graphic.copyPosition(this.point)
    if (!this.projectToScreen(worldPoint, this.segmentStart, width, height)) return null

    const screenDistance = mouse.distanceTo(this.segmentStart)
    if (screenDistance > graphic.visualDiameter / 2 + tolerance) return null

    return {
      entity,
      point: worldPoint.clone(),
      distance: this.camera.position.distanceTo(worldPoint),
      screenDistance
    }
  }

  private pickPolylineEntity(
    entity: Entity,
    mouse: THREE.Vector2,
    tolerance: number,
    width: number,
    height: number
  ): EntityPickCandidate | null {
    const graphic = entity.polylineGraphicImpl
    if (!graphic) return null

    let picked: EntityPickCandidate | null = null
    graphic.forEachSegment((start, end) => {
      if (!this.projectToScreen(start, this.segmentStart, width, height)) return
      if (!this.projectToScreen(end, this.segmentEnd, width, height)) return

      const t = closestPointRatioOnSegment(mouse, this.segmentStart, this.segmentEnd)
      const screenDistance = mouse.distanceTo(this.closestScreenPoint.lerpVectors(this.segmentStart, this.segmentEnd, t))
      if (screenDistance > graphic.width / 2 + tolerance) return

      this.pickedLinePoint.lerpVectors(start, end, t)
      picked = this.selectCloserCandidate(picked, {
        entity,
        point: this.pickedLinePoint.clone(),
        distance: this.camera.position.distanceTo(this.pickedLinePoint),
        screenDistance
      })
    })

    return picked
  }

  /**
   * 屏幕空间拾取 symbol（屏幕空间 billboard，几何 raycast 命中无意义，改由
   * {@link SymbolGraphic.pickScreenSpace} 在屏幕空间按 quad 矩形 + SDF alpha 判定）。
   *
   * Screen-space symbol picking. The billboard geometry is positioned in the vertex
   * shader, so a geometry raycast is meaningless; instead SymbolGraphic.pickScreenSpace
   * tests the quad rects with SDF alpha in screen space.
   */
  private pickSymbolEntity(
    entity: Entity,
    mouse: THREE.Vector2,
    width: number,
    height: number
  ): EntityPickCandidate | null {
    const graphic = entity.symbolGraphicImpl
    if (!graphic) return null
    const hit = graphic.pickScreenSpace(mouse, this.camera, width, height)
    if (!hit) return null
    return { entity, point: hit.point, distance: hit.distance, screenDistance: hit.screenDistance }
  }

  private projectToScreen(
    worldPoint: THREE.Vector3,
    target: THREE.Vector2,
    width: number,
    height: number
  ): boolean {
    this.projectedPoint.copy(worldPoint).project(this.camera)
    if (this.projectedPoint.z < -1 || this.projectedPoint.z > 1) return false

    target.set(
      (this.projectedPoint.x + 1) * 0.5 * width,
      (-this.projectedPoint.y + 1) * 0.5 * height
    )
    return true
  }

  private selectCloserCandidate(
    current: EntityPickCandidate | null,
    candidate: EntityPickCandidate | null
  ): EntityPickCandidate | null {
    if (!candidate) return current
    if (!current) return candidate
    if (candidate.distance < current.distance) return candidate
    if (candidate.distance > current.distance) return current
    return candidate.screenDistance < current.screenDistance ? candidate : current
  }

  private addCandidates(
    candidates: Map<Entity, EntityPickCandidate>,
    nextCandidates: EntityPickCandidate[]
  ) {
    nextCandidates.forEach((candidate) => this.addCandidate(candidates, candidate))
  }

  private addCandidate(
    candidates: Map<Entity, EntityPickCandidate>,
    candidate: EntityPickCandidate | null
  ) {
    if (!candidate) return
    const current = candidates.get(candidate.entity) ?? null
    candidates.set(candidate.entity, this.selectCloserCandidate(current, candidate)!)
  }

  private findEntity(object: THREE.Object3D): Entity | null {
    let current: THREE.Object3D | null = object
    while (current) {
      const entity = current.userData[ENTITY_KEY]
      if (entity) return entity as import('../entities/Entity').Entity
      current = current.parent
    }
    return null
  }

  private isScreenSpacePickedObject(object: THREE.Object3D) {
    return object.type === 'Points' || object.type === 'Line2'
  }
}

function closestPointRatioOnSegment(point: THREE.Vector2, start: THREE.Vector2, end: THREE.Vector2) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return 0

  const ratio = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
  return THREE.MathUtils.clamp(ratio, 0, 1)
}

function comparePickCandidates(a: EntityPickCandidate, b: EntityPickCandidate) {
  if (a.distance !== b.distance) return a.distance - b.distance
  return a.screenDistance - b.screenDistance
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
