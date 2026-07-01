import * as THREE from 'three'
import type { ColorInput, PolygonOptions } from '../types'
import { resolveColor } from './invertToneMapping'

interface PolygonGraphicOptions {
  worldPositions: THREE.Vector3[]
  options: PolygonOptions
}

/**
 * 多边形图形。平面多边形用 ShapeGeometry，拉伸体用 ExtrudeGeometry，
 * 材质为不受光的 MeshBasicMaterial；可选描边用 EdgesGeometry + LineSegments。
 *
 * Polygon graphics. Flat polygons use ShapeGeometry, extruded bodies use
 * ExtrudeGeometry, with an unlit MeshBasicMaterial; optional outline is drawn
 * with EdgesGeometry and LineSegments.
 */
export class PolygonGraphic {
  readonly object3D: THREE.Object3D
  private readonly material: THREE.MeshBasicMaterial | null
  private readonly outlineMaterial: THREE.LineBasicMaterial | null
  private readonly outline: THREE.LineSegments | null
  private readonly baseGeometry: THREE.BufferGeometry

  constructor({ worldPositions, options }: PolygonGraphicOptions) {
    const showFill = options.fill ?? true
    // 几何始终构建：填充和描边都依赖它。Frame 把局部几何对齐到第一顶点切平面。
    // Geometry is always built: both fill and outline depend on it. The frame
    // aligns local geometry to the tangent plane at the first vertex.
    const { geometry, frame } = buildPolygonGeometry(worldPositions, options)
    this.baseGeometry = geometry
    const root = new THREE.Group()

    this.material = showFill
      ? new THREE.MeshBasicMaterial({
          color: resolveColor(options.color),
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide
        })
      : null
    if (this.material) {
      const fillMesh = new THREE.Mesh(geometry, this.material)
      fillMesh.matrixAutoUpdate = false
      fillMesh.matrix.copy(frame)
      root.add(fillMesh)
    }

    if (options.outline) {
      const outlineGeometry = new THREE.EdgesGeometry(geometry, 1)
      this.outlineMaterial = new THREE.LineBasicMaterial({
        color: resolveColor(options.outlineColor),
        transparent: true,
        depthWrite: false
      })
      this.outline = new THREE.LineSegments(outlineGeometry, this.outlineMaterial)
      this.outline.matrixAutoUpdate = false
      this.outline.matrix.copy(frame)
      root.add(this.outline)
    } else {
      this.outlineMaterial = null
      this.outline = null
    }

    this.object3D = root
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
  }

  get color(): number {
    return this.material?.color.getHex() ?? 0xffffff
  }

  get outlineColor(): number {
    return this.outlineMaterial?.color.getHex() ?? this.color
  }

  setColor(color: ColorInput) {
    this.material?.color.set(resolveColor(color))
  }

  setOutlineColor(color: ColorInput) {
    this.outlineMaterial?.color.set(resolveColor(color))
  }

  dispose() {
    // baseGeometry 是 fill 和 outline 边的来源；outline 用的是派生的
    // EdgesGeometry（单独对象），需各自释放。
    // baseGeometry feeds both fill and outline; the outline uses a derived
    // EdgesGeometry (separate object) that must be disposed independently.
    this.baseGeometry.dispose()
    this.outline?.geometry.dispose()
    this.material?.dispose()
    this.outlineMaterial?.dispose()
  }
}

interface PolygonGeometryResult {
  geometry: THREE.BufferGeometry
  frame: THREE.Matrix4
}

function buildPolygonGeometry(worldPositions: THREE.Vector3[], options: PolygonOptions): PolygonGeometryResult {
  if (worldPositions.length < 3) {
    throw new Error('PolygonGraphic: at least 3 positions are required.')
  }

  // 在第一个顶点处建立当地平面坐标系：法线指向球面外（地心向外的法线），
  // 使多边形平面贴合球面切平面。frame 的原点落在第一个世界顶点上。
  const origin = worldPositions[0]
  const normal = origin.clone().normalize()
  const tangent = new THREE.Vector3()
  findTangent(normal, tangent)
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent)

  const rotation = new THREE.Matrix4().makeBasis(tangent, bitangent, normal)
  const frame = new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z),
    rotation
  )
  const frameInverse = frame.clone().invert()

  // 把世界顶点投影到当地平面，并减去第一点的局部坐标，使 Shape 以局部原点居中。
  const localOrigin = worldPositions[0].clone().applyMatrix4(frameInverse)
  const shape = new THREE.Shape()
  worldPositions.forEach((position, index) => {
    const local = position.clone().applyMatrix4(frameInverse).sub(localOrigin)
    if (index === 0) {
      shape.moveTo(local.x, local.y)
    } else {
      shape.lineTo(local.x, local.y)
    }
  })
  shape.closePath()

  // Shape / ExtrudeGeometry 的 z 默认为 0；底面统一平移到当地 height。
  const height = options.height ?? 0
  const extrudeHeight = options.extrudeHeight
  let geometry: THREE.BufferGeometry
  if (extrudeHeight !== undefined && extrudeHeight > height) {
    geometry = new THREE.ExtrudeGeometry(shape, {
      depth: extrudeHeight - height,
      bevelEnabled: false
    })
    geometry.translate(0, 0, height)
  } else {
    geometry = new THREE.ShapeGeometry(shape)
    geometry.translate(0, 0, height)
  }

  return { geometry, frame }
}

function findTangent(normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  // 选取与世界某轴叉乘得到的不平行切向量。
  const reference = Math.abs(normal.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  return target.crossVectors(normal, reference).normalize()
}
