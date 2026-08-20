import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { copyTerrainSurface } from './TerrainCoastAdapter'

describe('copyTerrainSurface', () => {
  it('copies only the first geometry group without detaching Tellux buffers', () => {
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      1, 0, 1,
      0, 0, 1,
      0, -5, 0
    ])
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([
      0, 0, 1, 0, 1, 1, 0, 1, 0, 0
    ]), 2))
    geometry.setIndex([0, 1, 2, 0, 2, 3, 0, 4, 1])
    geometry.addGroup(0, 6)
    geometry.addGroup(6, 3)
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    mesh.position.y = 5
    const model = new THREE.Group().add(mesh)
    model.updateMatrixWorld(true)

    const copied = copyTerrainSurface(model, new THREE.Matrix4())

    expect(copied).not.toBeNull()
    expect([...copied!.indices]).toEqual([0, 1, 2, 0, 2, 3])
    expect(copied!.positions).not.toBe(positions)
    expect(copied!.matrix[13]).toBe(5)
    expect(positions.byteLength).toBeGreaterThan(0)
  })
})
