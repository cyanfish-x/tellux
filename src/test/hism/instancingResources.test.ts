import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import {
  cloneGeometryForHismInstancing,
  disposeHismInstancedMesh
} from '../../hism/core/instancingResources'

describe('instancingResources', () => {
  it('clones geometry independently for RTC attributes', () => {
    const source = new THREE.BoxGeometry(1, 1, 1)
    const first = cloneGeometryForHismInstancing(source)
    const second = cloneGeometryForHismInstancing(source)

    expect(first).not.toBe(source)
    expect(second).not.toBe(first)
    expect(first.userData.hismInstancingClone).toBe(true)
  })

  it('disposes cloned geometry without touching material', () => {
    const geometry = cloneGeometryForHismInstancing(new THREE.BoxGeometry(1, 1, 1))
    const material = new THREE.MeshBasicMaterial()
    const mesh = new THREE.InstancedMesh(geometry, material, 1)
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeMaterial = vi.spyOn(material, 'dispose')

    disposeHismInstancedMesh(mesh)

    expect(disposeGeometry).toHaveBeenCalled()
    expect(disposeMaterial).not.toHaveBeenCalled()
  })
})
