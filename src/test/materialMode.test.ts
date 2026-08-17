import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  applyMaterialModeToObject,
  applySurfaceMaterialModeToObject
} from '../materials/materialMode'

describe('material mode helpers', () => {
  it('applies configured standard material values to surface materials', () => {
    const roughnessMap = new THREE.Texture()
    const metalnessMap = new THREE.Texture()
    const envMap = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({
      metalness: 0.4,
      roughness: 0.25,
      roughnessMap,
      metalnessMap,
      envMap,
      envMapIntensity: 1.5
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)

    applySurfaceMaterialModeToObject(mesh, 'standard', {
      roughness: 1,
      metalness: 0,
      useRoughnessMap: false
    })

    const surfaceMaterial = mesh.material as THREE.MeshStandardMaterial
    expect(surfaceMaterial).toBe(material)
    expect(surfaceMaterial.metalness).toBe(0)
    expect(surfaceMaterial.roughness).toBe(1)
    expect(surfaceMaterial.metalnessMap).toBeNull()
    expect(surfaceMaterial.roughnessMap).toBeNull()
    expect(surfaceMaterial.envMap).toBe(envMap)
    expect(surfaceMaterial.envMapIntensity).toBe(1.5)
  })

  it('can restore existing surface roughness maps when enabled', () => {
    const roughnessMap = new THREE.Texture()
    const metalnessMap = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({
      metalness: 0.4,
      roughness: 0.25,
      roughnessMap,
      metalnessMap
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)

    applySurfaceMaterialModeToObject(mesh, 'standard', {
      roughness: 1,
      metalness: 0,
      useRoughnessMap: false
    })
    applySurfaceMaterialModeToObject(mesh, 'standard', {
      roughness: 0.5,
      metalness: 0.2,
      useRoughnessMap: true
    })

    const surfaceMaterial = mesh.material as THREE.MeshStandardMaterial
    expect(surfaceMaterial.roughness).toBe(0.5)
    expect(surfaceMaterial.metalness).toBe(0.2)
    expect(surfaceMaterial.roughnessMap).toBe(roughnessMap)
    expect(surfaceMaterial.metalnessMap).toBe(metalnessMap)
  })

  it('preserves existing standard material inputs for non-surface content', () => {
    const roughnessMap = new THREE.Texture()
    const material = new THREE.MeshStandardMaterial({
      metalness: 0.4,
      roughness: 0.25,
      roughnessMap,
      envMapIntensity: 1.5
    })
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)

    applyMaterialModeToObject(mesh, 'standard')

    const contentMaterial = mesh.material as THREE.MeshStandardMaterial
    expect(contentMaterial).toBe(material)
    expect(contentMaterial.metalness).toBe(0.4)
    expect(contentMaterial.roughness).toBe(0.25)
    expect(contentMaterial.roughnessMap).toBe(roughnessMap)
    expect(contentMaterial.envMapIntensity).toBe(1.5)
  })

  it('keeps point cloud PointsMaterial instead of converting it to a mesh material', () => {
    const material = new THREE.PointsMaterial({
      size: 1,
      sizeAttenuation: true,
      vertexColors: true,
      toneMapped: true
    })
    const points = new THREE.Points(new THREE.BufferGeometry(), material)

    applyMaterialModeToObject(points, 'basic')

    const pointMaterial = points.material as THREE.PointsMaterial
    expect(pointMaterial).toBe(material)
    expect(pointMaterial).toBeInstanceOf(THREE.PointsMaterial)
    expect(pointMaterial.vertexColors).toBe(true)
    expect(pointMaterial.sizeAttenuation).toBe(false)
    expect(pointMaterial.toneMapped).toBe(false)
    expect(pointMaterial.size).toBeGreaterThan(1)
  })
})
