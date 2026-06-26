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
  if (material instanceof THREE.MeshBasicMaterial) {
    material.toneMapped = false
    material.needsUpdate = true
    return material
  }

  const source = material as THREE.MeshStandardMaterial
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
