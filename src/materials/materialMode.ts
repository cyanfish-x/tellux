import * as THREE from 'three'

export type RenderMaterialMode = 'basic' | 'standard'

export interface SurfaceMaterialOptions {
  roughness: number
  metalness: number
  useRoughnessMap: boolean
}

const SURFACE_ORIGINAL_ROUGHNESS_MAP = Symbol('tellux.surface.originalRoughnessMap')
const SURFACE_ORIGINAL_METALNESS_MAP = Symbol('tellux.surface.originalMetalnessMap')

export function applyMaterialModeToObject(root: THREE.Object3D, mode: RenderMaterialMode) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.material) return

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => toMaterialMode(material, mode))
      : toMaterialMode(mesh.material, mode)
  })
}

export function applyBasicMaterialToObject(root: THREE.Object3D) {
  applyMaterialModeToObject(root, 'basic')
}

export function applySurfaceMaterialModeToObject(
  root: THREE.Object3D,
  mode: RenderMaterialMode,
  options: SurfaceMaterialOptions
) {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.material) return

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => toSurfaceMaterialMode(material, mode, options))
      : toSurfaceMaterialMode(mesh.material, mode, options)
  })
}

function toMaterialMode(material: THREE.Material, mode: RenderMaterialMode) {
  return mode === 'standard'
    ? toStandardMaterial(material)
    : toBasicMaterial(material)
}

function toSurfaceMaterialMode(
  material: THREE.Material,
  mode: RenderMaterialMode,
  options: SurfaceMaterialOptions
) {
  if (mode === 'basic') return toBasicMaterial(material)

  const standard = toStandardMaterial(material)
  if (standard instanceof THREE.MeshStandardMaterial) {
    applySurfaceStandardMaterialOptions(standard, options)
    standard.needsUpdate = true
  }
  return standard
}

function applySurfaceStandardMaterialOptions(
  material: THREE.MeshStandardMaterial,
  options: SurfaceMaterialOptions
) {
  const storedMaps = material as THREE.MeshStandardMaterial & {
    [SURFACE_ORIGINAL_ROUGHNESS_MAP]?: THREE.Texture | null
    [SURFACE_ORIGINAL_METALNESS_MAP]?: THREE.Texture | null
  }

  if (!Object.prototype.hasOwnProperty.call(storedMaps, SURFACE_ORIGINAL_ROUGHNESS_MAP)) {
    storedMaps[SURFACE_ORIGINAL_ROUGHNESS_MAP] = material.roughnessMap
  }
  if (!Object.prototype.hasOwnProperty.call(storedMaps, SURFACE_ORIGINAL_METALNESS_MAP)) {
    storedMaps[SURFACE_ORIGINAL_METALNESS_MAP] = material.metalnessMap
  }

  material.roughness = options.roughness
  material.metalness = options.metalness
  material.roughnessMap = options.useRoughnessMap
    ? storedMaps[SURFACE_ORIGINAL_ROUGHNESS_MAP] ?? null
    : null
  material.metalnessMap = options.useRoughnessMap
    ? storedMaps[SURFACE_ORIGINAL_METALNESS_MAP] ?? null
    : null
}

function toStandardMaterial(material: THREE.Material) {
  if (material instanceof THREE.PointsMaterial) {
    stylePointCloudMaterial(material)
    return material
  }
  if (material instanceof THREE.MeshStandardMaterial) return material
  if (!(material instanceof THREE.MeshBasicMaterial)) return material

  const lit = new THREE.MeshStandardMaterial({
    color: material.color,
    map: material.map,
    alphaMap: material.alphaMap,
    aoMap: material.aoMap,
    envMap: material.envMap,
    lightMap: material.lightMap,
    metalness: 0,
    roughness: 1
  })
  copyMaterialState(material, lit)
  lit.toneMapped = true
  lit.needsUpdate = true
  material.dispose()
  return lit
}

function toBasicMaterial(material: THREE.Material) {
  if (material instanceof THREE.PointsMaterial) {
    stylePointCloudMaterial(material)
    return material
  }

  if (material instanceof THREE.MeshBasicMaterial) {
    material.toneMapped = false
    material.needsUpdate = true
    return material
  }

  if (!(material instanceof THREE.MeshStandardMaterial)) {
    return material
  }

  const source = material
  const basic = new THREE.MeshBasicMaterial({
    color: source.color ?? new THREE.Color(1, 1, 1),
    map: source.map ?? null,
    alphaMap: source.alphaMap ?? null,
    aoMap: source.aoMap ?? null,
    envMap: source.envMap ?? null,
    lightMap: source.lightMap ?? null
  })
  basic.wireframe = 'wireframe' in source ? Boolean(source.wireframe) : false
  copyMaterialState(material, basic)
  basic.toneMapped = false
  basic.needsUpdate = true
  material.dispose()
  return basic
}

/**
 * 3D Tiles 点云默认按屏幕像素大小绘制。
 *
 * Three.js 默认 `size = 1` 且 `sizeAttenuation = true`，在地球尺度下点会被缩成
 * 几乎看不见；Cesium 官方点云则用屏幕空间尺寸，所以远看仍能成面。
 *
 * Point cloud tiles default to a constant screen-pixel size.
 *
 * Three.js defaults (`size = 1`, `sizeAttenuation = true`) shrink points to
 * nearly nothing at globe scale. Cesium-style point clouds stay visible by
 * using screen-space size.
 */
export const DEFAULT_POINT_CLOUD_PIXEL_SIZE = 4

export function applyPointCloudMaterialStyle(
  root: THREE.Object3D,
  options: { size?: number } = {}
) {
  const size = options.size ?? DEFAULT_POINT_CLOUD_PIXEL_SIZE
  root.traverse((object) => {
    if (!(object as THREE.Points).isPoints) return

    // 把屏幕像素点大小写入 aPointSize：NormalPass 用它识别 Tellux 点云并对齐点大小。
    const points = object as THREE.Points
    const geometry = points.geometry as THREE.BufferGeometry
    const position = geometry.getAttribute('position')
    if (position) {
      const pointSize = geometry.getAttribute('aPointSize')
      if (!pointSize || pointSize.count !== position.count || pointSize.getX(0) !== size) {
        const array = new Float32Array(position.count)
        array.fill(size)
        geometry.setAttribute('aPointSize', new THREE.BufferAttribute(array, 1))
      }
    }

    normalizePointCloudColorAttribute(geometry)

    const material = points.material
    const materials = Array.isArray(material) ? material : [material]
    for (const item of materials) {
      if (item instanceof THREE.PointsMaterial) {
        stylePointCloudMaterial(item, size, geometry)
      }
    }
  })
}

function normalizePointCloudColorAttribute(geometry: THREE.BufferGeometry) {
  const color = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!color) return

  const array = color.array
  if (
    !color.normalized &&
    (array instanceof Uint8Array || array instanceof Uint16Array)
  ) {
    color.normalized = true
    color.needsUpdate = true
  }

  // Draco / 部分加载路径偶发把 0–255 写进 Float32 且未归一化 → 着色器全饱和成白。
  if (!color.normalized && array instanceof Float32Array && array.length > 0) {
    let max = 0
    const sample = Math.min(array.length, 384)
    for (let i = 0; i < sample; i++) max = Math.max(max, array[i]!)
    if (max > 1.5) {
      for (let i = 0; i < array.length; i++) array[i]! /= 255
      color.needsUpdate = true
    }
  }
}

function stylePointCloudMaterial(
  material: THREE.PointsMaterial,
  size = DEFAULT_POINT_CLOUD_PIXEL_SIZE,
  geometry?: THREE.BufferGeometry
) {
  material.size = size
  material.sizeAttenuation = false
  material.toneMapped = false
  if (geometry?.getAttribute('color')) {
    material.vertexColors = true
  }
  material.needsUpdate = true
}

function copyMaterialState(source: THREE.Material, target: THREE.Material) {
  target.name = source.name
  target.transparent = source.transparent
  target.opacity = source.opacity
  target.alphaTest = source.alphaTest
  target.side = source.side
  target.depthTest = source.depthTest
  target.depthWrite = source.depthWrite
  target.colorWrite = source.colorWrite
  target.blending = source.blending
  target.blendSrc = source.blendSrc
  target.blendDst = source.blendDst
  target.blendEquation = source.blendEquation
  target.polygonOffset = source.polygonOffset
  target.polygonOffsetFactor = source.polygonOffsetFactor
  target.polygonOffsetUnits = source.polygonOffsetUnits
  target.toneMapped = source.toneMapped
  target.defines = source.defines ? { ...source.defines } : undefined
  target.onBeforeCompile = source.onBeforeCompile
  target.customProgramCacheKey = source.customProgramCacheKey
  target.userData = { ...source.userData }

  Object.getOwnPropertySymbols(source).forEach((symbol) => {
    ;(target as unknown as Record<symbol, unknown>)[symbol] =
      (source as unknown as Record<symbol, unknown>)[symbol]
  })
  target.needsUpdate = true
}
