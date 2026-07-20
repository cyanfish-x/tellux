import type { BufferGeometry } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

const geometryBvhCache = new WeakMap<BufferGeometry, MeshBVH>()

/**
 * 为几何体构建或复用 MeshBVH，供 HISM 拾取加速。
 *
 * Builds or reuses a MeshBVH for a geometry to accelerate HISM picking.
 */
export function ensureGeometryBvh(geometry: BufferGeometry): MeshBVH {
  const cached = geometryBvhCache.get(geometry)
  if (cached) return cached

  const boundsTree = new MeshBVH(geometry)
  geometry.boundsTree = boundsTree
  geometryBvhCache.set(geometry, boundsTree)
  return boundsTree
}

export function disposeGeometryBvh(geometry: BufferGeometry): void {
  if (!geometryBvhCache.has(geometry)) return
  geometryBvhCache.delete(geometry)
  delete geometry.boundsTree
}

export function hasGeometryBvh(geometry: BufferGeometry): boolean {
  return geometryBvhCache.has(geometry)
}
