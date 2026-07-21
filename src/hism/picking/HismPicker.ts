import * as THREE from 'three'
import { acceleratedRaycast } from 'three-mesh-bvh'
import { getRtcInstanceMatrixAt } from '../../rendering/applyRTCInstancing'
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

const instanceLocalMatrix = new THREE.Matrix4()
const instanceWorldMatrix = new THREE.Matrix4()
const instanceSphere = new THREE.Sphere()
const meshSphere = new THREE.Sphere()
const proxyMesh = new THREE.Mesh()
const instanceIntersects: THREE.Intersection[] = []

/**
 * 对 RTC InstancedMesh 做射线拾取：用 `positionHigh/Low` 还原 ECEF 平移后再求交。
 *
 * Raycasts an RTC InstancedMesh by reconstructing ECEF translation from
 * `positionHigh/Low` before testing each instance.
 */
export function intersectRtcInstancedMesh(
  raycaster: THREE.Raycaster,
  mesh: THREE.InstancedMesh
): THREE.Intersection | null {
  ensureAcceleratedRaycast()
  ensureGeometryBvh(mesh.geometry)

  mesh.updateWorldMatrix(true, false)
  const matrixWorld = mesh.matrixWorld

  if (mesh.boundingSphere === null) {
    mesh.computeBoundingSphere()
  }
  if (mesh.boundingSphere) {
    meshSphere.copy(mesh.boundingSphere).applyMatrix4(matrixWorld)
    if (!raycaster.ray.intersectsSphere(meshSphere)) {
      return null
    }
  }

  if (mesh.geometry.boundingSphere === null) {
    mesh.geometry.computeBoundingSphere()
  }

  proxyMesh.geometry = mesh.geometry
  proxyMesh.material = mesh.material

  const previousFirstHitOnly = raycaster.firstHitOnly
  raycaster.firstHitOnly = true

  let closest: THREE.Intersection | null = null

  try {
    for (let instanceId = 0; instanceId < mesh.count; instanceId += 1) {
      getRtcInstanceMatrixAt(mesh, instanceId, instanceLocalMatrix)
      instanceWorldMatrix.multiplyMatrices(matrixWorld, instanceLocalMatrix)

      if (mesh.geometry.boundingSphere) {
        instanceSphere
          .copy(mesh.geometry.boundingSphere)
          .applyMatrix4(instanceWorldMatrix)
        if (!raycaster.ray.intersectsSphere(instanceSphere)) {
          continue
        }
      }

      proxyMesh.matrixWorld = instanceWorldMatrix
      proxyMesh.raycast(raycaster, instanceIntersects)

      for (let i = 0; i < instanceIntersects.length; i += 1) {
        const hit = instanceIntersects[i]!
        hit.instanceId = instanceId
        hit.object = mesh
        if (!closest || hit.distance < closest.distance) {
          closest = hit
        }
      }
      instanceIntersects.length = 0
    }
  } finally {
    raycaster.firstHitOnly = previousFirstHitOnly
    proxyMesh.geometry = undefined as unknown as THREE.BufferGeometry
    proxyMesh.material = undefined as unknown as THREE.Material
  }

  return closest
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
      const hit = intersectRtcInstancedMesh(options.raycaster, mesh)
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
