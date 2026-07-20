import type { BufferGeometry, InstancedMesh } from 'three'
import { disposeGeometryBvh } from '../picking/geometryBvhCache'

/**
 * 为 HISM InstancedMesh 克隆 geometry，避免 RTC 实例属性在共享 geometry 上互相覆盖。
 *
 * Clones geometry for HISM InstancedMesh so RTC instance attributes do not
 * overwrite each other on shared geometries.
 */
export function cloneGeometryForHismInstancing(
  source: BufferGeometry
): BufferGeometry {
  const geometry = source.clone()
  geometry.userData.hismInstancingClone = true
  return geometry
}

/**
 * 释放 HISM 创建的 InstancedMesh GPU 资源；不 dispose 用户提供的 material。
 *
 * Releases GPU resources owned by a HISM InstancedMesh; does not dispose
 * user-provided materials.
 */
export function disposeHismInstancedMesh(mesh: InstancedMesh): void {
  mesh.parent?.remove(mesh)
  if (mesh.geometry) {
    disposeGeometryBvh(mesh.geometry)
    mesh.geometry.dispose()
  }
}
