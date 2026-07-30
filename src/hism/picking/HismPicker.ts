import * as THREE from 'three'
import { acceleratedRaycast } from 'three-mesh-bvh'
import { getRtcInstanceMatrixAt } from '../../rendering/applyRTCInstancing'
import type { HismPickResult } from '../../types/hism'
import type { HismLayerImpl } from '../core/HismLayer'
import { ensureGeometryBvh } from './geometryBvhCache'

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
  let closest: THREE.Intersection | null = null
  forEachRtcInstanceHit(raycaster, mesh, (hit) => {
    if (!closest || hit.distance < closest.distance) {
      closest = hit
    }
  })
  return closest
}

/**
 * 返回射线命中的全部 RTC 实例，每个实例只保留最近交点，并按距离排序。
 *
 * Returns every intersected RTC instance, keeping the nearest intersection per
 * instance and sorting the results by distance.
 */
export function intersectAllRtcInstancedMesh(
  raycaster: THREE.Raycaster,
  mesh: THREE.InstancedMesh
): THREE.Intersection[] {
  const hits: THREE.Intersection[] = []
  forEachRtcInstanceHit(raycaster, mesh, (hit) => {
    hits.push(hit)
  })
  hits.sort((a, b) => a.distance - b.distance)
  return hits
}

function forEachRtcInstanceHit(
  raycaster: THREE.Raycaster,
  mesh: THREE.InstancedMesh,
  callback: (hit: THREE.Intersection) => void
) {
  ensureGeometryBvh(mesh.geometry)

  mesh.updateWorldMatrix(true, false)
  const matrixWorld = mesh.matrixWorld

  if (mesh.boundingSphere === null) {
    mesh.computeBoundingSphere()
  }
  if (mesh.boundingSphere) {
    meshSphere.copy(mesh.boundingSphere).applyMatrix4(matrixWorld)
    if (!raycaster.ray.intersectsSphere(meshSphere)) {
      return
    }
  }

  if (mesh.geometry.boundingSphere === null) {
    mesh.geometry.computeBoundingSphere()
  }

  proxyMesh.geometry = mesh.geometry
  proxyMesh.material = mesh.material

  const previousFirstHitOnly = raycaster.firstHitOnly
  raycaster.firstHitOnly = true

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
      acceleratedRaycast.call(proxyMesh, raycaster, instanceIntersects)

      let closestForInstance: THREE.Intersection | null = null
      for (let i = 0; i < instanceIntersects.length; i += 1) {
        const hit = instanceIntersects[i]!
        hit.instanceId = instanceId
        hit.object = mesh
        if (!closestForInstance || hit.distance < closestForInstance.distance) {
          closestForInstance = hit
        }
      }
      instanceIntersects.length = 0
      if (closestForInstance) {
        callback(closestForInstance)
      }
    }
  } finally {
    instanceIntersects.length = 0
    raycaster.firstHitOnly = previousFirstHitOnly
    proxyMesh.geometry = undefined as unknown as THREE.BufferGeometry
    proxyMesh.material = undefined as unknown as THREE.Material
  }
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

/**
 * 对多个 HISM 图层执行全量拾取，每个逻辑实例只返回一次并按距离排序。
 *
 * Picks every logical HISM instance across layers once and sorts nearest-first.
 */
export function pickAllHismLayers(
  options: PickHismLayersOptions
): HismPickResult[] {
  const picked = new Map<string, HismPickResult>()
  for (const layer of options.layers) {
    if (!layer.show) continue

    for (const mesh of layer.collectVisiblePickMeshes()) {
      const intersections = intersectAllRtcInstancedMesh(options.raycaster, mesh)
      for (const hit of intersections) {
        if (hit.instanceId === undefined) continue
        const result = createHismPickResult(layer, mesh, hit)
        const key = JSON.stringify([
          result.layerId,
          result.clusterKey,
          result.archetypeIndex,
          result.instanceId
        ])
        const previous = picked.get(key)
        if (!previous || result.distance < previous.distance) {
          picked.set(key, result)
        }
      }
    }
  }

  return Array.from(picked.values()).sort((a, b) => a.distance - b.distance)
}

function createHismPickResult(
  layer: HismLayerImpl,
  mesh: THREE.InstancedMesh,
  hit: THREE.Intersection
): HismPickResult {
  return {
    layerId: layer.id,
    clusterKey: mesh.userData.hismClusterKey as string,
    archetypeIndex: mesh.userData.hismArchetypeIndex as number,
    lodIndex: mesh.userData.hismLodIndex as number,
    partIndex: mesh.userData.hismPartIndex as number,
    instanceId: hit.instanceId!,
    point: hit.point.clone(),
    distance: hit.distance
  }
}
