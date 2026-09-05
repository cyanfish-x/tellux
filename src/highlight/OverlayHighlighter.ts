import * as THREE from 'three'
import type { ColorInput, Picked3DTilesFeature } from '../types'
import {
  resolveColor as defaultResolveColor,
  type ResolveColor
} from '../entities/invertToneMapping'

const FEATURE_ID_ATTRIBUTE_NAMES = new Set([
  '_BATCHID',
  'BATCHID',
  '_BATCH_ID',
  'BATCH_ID',
  'BATCHID_0',
  '_BATCHID_0'
])

/**
 * 3D Tiles feature 叠加几何高亮：按 featureId 抽面或整 mesh 贴膜。
 *
 * Overlay geometry highlighter for 3D Tiles features: extracts triangles by
 * featureId or clones the whole mesh as a translucent film.
 */
export class OverlayHighlighter {
  private object: THREE.Object3D | null = null
  private color: ColorInput
  private opacity: number

  constructor(
    private readonly scene: THREE.Scene,
    color: ColorInput,
    opacity: number,
    private readonly resolveColor: ResolveColor = defaultResolveColor
  ) {
    this.color = color
    this.opacity = opacity
  }

  /**
   * 更新叠加样式（下次 show 或立即刷新当前 overlay）。
   *
   * Updates overlay style (applied on next show, or immediately if visible).
   */
  setStyle(color: ColorInput, opacity: number) {
    this.color = color
    this.opacity = opacity
    if (!this.object) return
    this.object.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return
      const material = (child as THREE.Mesh).material
      if (Array.isArray(material)) return
      if ((material as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        const basic = material as THREE.MeshBasicMaterial
        basic.color.copy(this.resolveColor(color))
        basic.opacity = opacity
      }
    })
  }

  show(feature: Picked3DTilesFeature) {
    this.clear()
    if (!this.enabled) return

    const object = createHighlightObject(
      feature,
      this.color,
      this.opacity,
      this.resolveColor
    )
    if (!object) return

    this.object = object
    object.userData.telluxPickingIgnore = true
    this.scene.add(object)
  }

  clear() {
    if (!this.object) return
    this.scene.remove(this.object)
    disposeHighlightObject(this.object)
    this.object = null
  }

  /** 是否启用；由 HighlightManager 根据 highlighter.overlay.enabled 控制。 */
  enabled = true

  dispose() {
    this.clear()
  }
}

function disposeHighlightObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh || (child as THREE.LineSegments).isLineSegments) {
      const renderable = child as THREE.Mesh | THREE.LineSegments
      renderable.geometry?.dispose()
      const materials = Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]
      materials.forEach((material) => material?.dispose())
    }
  })
}

function createHighlightObject(
  feature: Picked3DTilesFeature,
  color: ColorInput,
  opacity: number,
  resolveColor: ResolveColor
) {
  const object = feature.object
  object.updateMatrixWorld(true)

  if ((object as THREE.Mesh).isMesh) {
    const mesh = object as THREE.Mesh
    const geometry =
      createFeatureGeometry(mesh, feature) ?? createWholeMeshGeometry(mesh)
    if (!geometry) return null

    const material = new THREE.MeshBasicMaterial({
      color: resolveColor(color),
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4
    })
    const overlay = new THREE.Mesh(geometry, material)
    overlay.frustumCulled = false
    overlay.renderOrder = 1000
    return overlay
  }

  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return null

  const helper = new THREE.Box3Helper(box, resolveColor(color))
  helper.userData.telluxPickingIgnore = true
  return helper
}

function createWholeMeshGeometry(mesh: THREE.Mesh) {
  const geometry = mesh.geometry?.clone()
  if (!geometry) return null
  geometry.applyMatrix4(mesh.matrixWorld)
  return geometry
}

export function createFeatureGeometry(
  mesh: THREE.Mesh,
  feature: Picked3DTilesFeature
) {
  if (feature.featureId === null) return null

  const geometry = mesh.geometry
  const position = geometry.getAttribute('position')
  const featureIdAttribute = getFeatureIdAttribute(geometry)
  if (!position || !featureIdAttribute) return null

  const index = geometry.index
  const triangleCount = index
    ? Math.floor(index.count / 3)
    : Math.floor(position.count / 3)
  const positions: number[] = []
  const vertex = new THREE.Vector3()

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = index ? index.getX(triangle * 3) : triangle * 3
    const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
    const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
    if (Math.round(featureIdAttribute.getX(a)) !== feature.featureId) continue

    pushWorldVertex(position, a, mesh.matrixWorld, vertex, positions)
    pushWorldVertex(position, b, mesh.matrixWorld, vertex, positions)
    pushWorldVertex(position, c, mesh.matrixWorld, vertex, positions)
  }

  if (positions.length === 0) return null

  const highlightGeometry = new THREE.BufferGeometry()
  highlightGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  )
  highlightGeometry.computeBoundingSphere()
  return highlightGeometry
}

function pushWorldVertex(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  index: number,
  matrixWorld: THREE.Matrix4,
  vertex: THREE.Vector3,
  target: number[]
) {
  vertex
    .set(position.getX(index), position.getY(index), position.getZ(index))
    .applyMatrix4(matrixWorld)
  target.push(vertex.x, vertex.y, vertex.z)
}

function getFeatureIdAttribute(geometry: THREE.BufferGeometry) {
  for (const key of Object.keys(geometry.attributes)) {
    const normalized = key.toUpperCase()
    if (
      FEATURE_ID_ATTRIBUTE_NAMES.has(normalized) ||
      normalized.startsWith('_FEATURE_ID_')
    ) {
      return geometry.getAttribute(key)
    }
  }
  return null
}
