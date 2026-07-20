import * as THREE from 'three'
import { acceleratedRaycast } from 'three-mesh-bvh'
import type { HismPickResult } from '../../types/hism'
import type { HismLayerImpl } from '../core/HismLayer'
import { ensureGeometryBvh } from './geometryBvhCache'

let raycastPatched = false

export function ensureAcceleratedRaycast(): void {
  if (raycastPatched) return
  THREE.Mesh.prototype.raycast = acceleratedRaycast
  raycastPatched = true
}

export interface PickHismLayersOptions {
  layers: Iterable<HismLayerImpl>
  raycaster: THREE.Raycaster
}

/**
 * 对多个 HISM 图层执行 BVH 加速射线拾取，返回最近命中。
 *
 * Performs BVH-accelerated ray picking across HISM layers and returns the
 * closest hit.
 */
export function pickHismLayers(
  options: PickHismLayersOptions
): HismPickResult | null {
  ensureAcceleratedRaycast()

  let closestHit: THREE.Intersection | null = null
  let closestLayer: HismLayerImpl | null = null

  for (const layer of options.layers) {
    if (!layer.show) continue

    for (const mesh of layer.collectVisiblePickMeshes()) {
      ensureGeometryBvh(mesh.geometry)
      const hits = options.raycaster.intersectObject(mesh, false)
      const hit = hits[0]
      if (!hit) continue
      if (!closestHit || hit.distance < closestHit.distance) {
        closestHit = hit
        closestLayer = layer
      }
    }
  }

  if (!closestHit || !closestLayer || closestHit.instanceId === undefined) {
    return null
  }

  const mesh = closestHit.object as THREE.InstancedMesh
  return {
    layerId: closestLayer.id,
    clusterKey: mesh.userData.hismClusterKey as string,
    archetypeIndex: mesh.userData.hismArchetypeIndex as number,
    lodIndex: mesh.userData.hismLodIndex as number,
    partIndex: mesh.userData.hismPartIndex as number,
    instanceId: closestHit.instanceId,
    point: closestHit.point.clone(),
    distance: closestHit.distance
  }
}
