import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  applyRTCInstancing,
  getRtcInstanceMatrixAt,
  setRTCMatrixAt
} from '../../rendering/applyRTCInstancing'
import { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'
import {
  intersectAllRtcInstancedMesh,
  intersectRtcInstancedMesh,
  pickAllHismLayers
} from '../../hism/picking/HismPicker'

describe('RTC HISM picking', () => {
  it('reconstructs ECEF translation from positionHigh/Low', () => {
    const camera = new THREE.PerspectiveCamera()
    const rtc = new RTCAutoUniforms(camera)
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial(), 1)
    applyRTCInstancing(mesh, rtc)

    const full = new THREE.Matrix4().makeTranslation(-1283748.39, 5317592.45, 3270124.18)
    setRTCMatrixAt(mesh, 0, full)

    const stored = new THREE.Matrix4()
    mesh.getMatrixAt(0, stored)
    expect(stored.elements[12]).toBe(0)
    expect(stored.elements[13]).toBe(0)
    expect(stored.elements[14]).toBe(0)

    const reconstructed = new THREE.Matrix4()
    getRtcInstanceMatrixAt(mesh, 0, reconstructed)
    expect(reconstructed.elements[12]).toBeCloseTo(-1283748.39, 1)
    expect(reconstructed.elements[13]).toBeCloseTo(5317592.45, 1)
    expect(reconstructed.elements[14]).toBeCloseTo(3270124.18, 1)
  })

  it('does not replace a host-provided Mesh.prototype.raycast', () => {
    const originalRaycast = THREE.Mesh.prototype.raycast
    const hostRaycast = vi.fn()
    THREE.Mesh.prototype.raycast = hostRaycast

    try {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
      camera.position.set(0, 0, 10)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      const rtc = new RTCAutoUniforms(camera)
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial(),
        1
      )
      applyRTCInstancing(mesh, rtc)
      setRTCMatrixAt(mesh, 0, new THREE.Matrix4())
      mesh.updateMatrixWorld(true)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

      const hit = intersectRtcInstancedMesh(raycaster, mesh)

      expect(hit).not.toBeNull()
      expect(THREE.Mesh.prototype.raycast).toBe(hostRaycast)
      expect(hostRaycast).not.toHaveBeenCalled()
    } finally {
      THREE.Mesh.prototype.raycast = originalRaycast
    }
  })

  it('hits an RTC instance that standard InstancedMesh.raycast misses', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1e7)
    const origin = new THREE.Vector3(-1283748.39, 5317592.45, 3270124.18)
    camera.position.copy(origin).add(new THREE.Vector3(0, 0, 40))
    camera.lookAt(origin)
    camera.updateMatrixWorld(true)

    const rtc = new RTCAutoUniforms(camera)
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial(),
      1
    )
    mesh.frustumCulled = false
    applyRTCInstancing(mesh, rtc)
    setRTCMatrixAt(mesh, 0, new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z))
    mesh.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

    const standardHits: THREE.Intersection[] = []
    mesh.raycast(raycaster, standardHits)
    expect(standardHits.length).toBe(0)

    const rtcHit = intersectRtcInstancedMesh(raycaster, mesh)
    expect(rtcHit).not.toBeNull()
    expect(rtcHit?.instanceId).toBe(0)
    expect(rtcHit?.distance).toBeGreaterThan(0)
  })

  it('returns every intersected RTC instance nearest-first', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)

    const rtc = new RTCAutoUniforms(camera)
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
      2
    )
    applyRTCInstancing(mesh, rtc)
    setRTCMatrixAt(mesh, 0, new THREE.Matrix4().makeTranslation(0, 0, 0))
    setRTCMatrixAt(mesh, 1, new THREE.Matrix4().makeTranslation(0, 0, -5))
    mesh.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

    const hits = intersectAllRtcInstancedMesh(raycaster, mesh)

    expect(hits.map((hit) => hit.instanceId)).toEqual([0, 1])
    expect(hits[0].distance).toBeLessThan(hits[1].distance)
  })

  it('deduplicates mesh parts that belong to the same logical instance', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.set(0, 0, 10)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    const rtc = new RTCAutoUniforms(camera)
    const createPart = (partIndex: number) => {
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2, 2, 2),
        new THREE.MeshBasicMaterial(),
        1
      )
      applyRTCInstancing(mesh, rtc)
      setRTCMatrixAt(mesh, 0, new THREE.Matrix4())
      Object.assign(mesh.userData, {
        hismClusterKey: '0:0',
        hismArchetypeIndex: 0,
        hismLodIndex: 0,
        hismPartIndex: partIndex
      })
      mesh.updateMatrixWorld(true)
      return mesh
    }
    const parts = [createPart(0), createPart(1)]
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

    const hits = pickAllHismLayers({
      layers: [{
        id: 'forest',
        show: true,
        collectVisiblePickMeshes: () => parts
      } as never],
      raycaster
    })

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      layerId: 'forest',
      clusterKey: '0:0',
      archetypeIndex: 0,
      instanceId: 0
    })
  })
})
