import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { HismCluster } from '../../hism/core/HismCluster'
import {
  pickAllHismLayers,
  pickHismLayers
} from '../../hism/picking/HismPicker'
import { createHismPickTraversalStats } from '../../hism/runtime/HismPickMetrics'
import { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'

function createRaycaster() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)
  return { camera, raycaster }
}

function createPickMesh(clusterKey: string, z: number) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial(),
    1
  )
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, z))
  mesh.userData.hismClusterKey = clusterKey
  mesh.userData.hismArchetypeIndex = 0
  mesh.userData.hismLodIndex = 0
  mesh.userData.hismPartIndex = 0
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('HISM cluster pick traversal', () => {
  it('rejects a cluster whose world bounds do not intersect the pick ray', () => {
    const { camera, raycaster } = createRaycaster()
    const cluster = new HismCluster({
      cellKey: 'far',
      cellSizeMeters: 10,
      archetypes: [{
        parts: [{
          geometry: new THREE.BoxGeometry(2, 2, 2),
          material: new THREE.MeshBasicMaterial()
        }]
      }],
      items: [{
        placement: {
          coordinates: [0, 0, 0],
          archetype: 0
        }
      }],
      rtcUniforms: new RTCAutoUniforms(camera),
      applyInstanceMatrix: (_coordinates, _frame, _scale, target) => {
        target.makeTranslation(1000, 0, 0)
      }
    })

    expect(cluster.collectPickCandidate(raycaster.ray)).toBeNull()
    cluster.dispose()
  })

  it('keeps transformed geometry extents inside the cluster pick bounds', () => {
    const camera = new THREE.PerspectiveCamera()
    const ray = new THREE.Ray(
      new THREE.Vector3(490, 0, 600),
      new THREE.Vector3(0, 0, -1)
    )
    const cluster = new HismCluster({
      cellKey: 'scaled',
      cellSizeMeters: 10,
      archetypes: [{
        parts: [{
          geometry: new THREE.BoxGeometry(2, 2, 2),
          material: new THREE.MeshBasicMaterial()
        }]
      }],
      items: [{
        placement: {
          coordinates: [0, 0, 0],
          archetype: 0
        }
      }],
      rtcUniforms: new RTCAutoUniforms(camera),
      applyInstanceMatrix: (_coordinates, _frame, _scale, target) => {
        target.makeScale(500, 1, 1)
      }
    })

    expect(cluster.collectPickCandidate(ray)).not.toBeNull()
    cluster.dispose()
  })

  it('prunes farther clusters for nearest picking while drill-all visits every candidate', () => {
    const { raycaster } = createRaycaster()
    const nearMesh = createPickMesh('near', 0)
    const farMesh = createPickMesh('far', -30)
    const candidates = [
      { clusterKey: 'near', distance: 0, instanceCount: 1, meshes: [nearMesh] },
      { clusterKey: 'far', distance: 20, instanceCount: 1, meshes: [farMesh] }
    ]
    const layer = {
      id: 'forest',
      show: true,
      collectPickCandidates: (
        _ray: THREE.Ray,
        stats: ReturnType<typeof createHismPickTraversalStats>
      ) => {
        stats.visibleClusters += 2
        stats.visibleInstances += 2
        stats.candidateClusters += 2
        stats.candidateInstances += 2
        stats.candidateMeshes += 2
        return candidates
      }
    }
    const nearestStats = createHismPickTraversalStats()
    const allStats = createHismPickTraversalStats()

    const nearest = pickHismLayers({
      layers: [layer as never],
      raycaster,
      stats: nearestStats
    })
    const all = pickAllHismLayers({
      layers: [layer as never],
      raycaster,
      stats: allStats
    })

    expect(nearest?.clusterKey).toBe('near')
    expect(nearestStats.visitedClusters).toBe(1)
    expect(nearestStats.testedMeshInstances).toBe(1)
    expect(all.map((pick) => pick.clusterKey)).toEqual(['near', 'far'])
    expect(allStats.visitedClusters).toBe(2)
    expect(allStats.testedMeshInstances).toBe(2)
  })
})
