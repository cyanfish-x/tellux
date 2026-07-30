import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { TilesetFeaturePicker } from '../sampling/TilesetFeaturePicker'

function createMesh(z: number, name: string) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial()
  )
  mesh.position.z = z
  mesh.name = name
  Object.assign(mesh, {
    batchTable: {
      count: 1,
      getDataFromId: () => ({ name })
    }
  })
  return mesh
}

function createPicker() {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 10)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)

  const group = new THREE.Group()
  group.add(createMesh(0, 'near'))
  group.add(createMesh(-5, 'far'))
  const tileset = {
    group,
    ellipsoid: {
      getPositionToCartographic: (
        point: THREE.Vector3,
        target: { lat: number; lon: number; height: number }
      ) => {
        target.lat = point.y
        target.lon = point.x
        target.height = point.z
        return target
      }
    }
  }
  const tilesets = {
    loadedSceneTilesetEntries: [{ id: 'city', tileset }]
  }
  const canvas = {
    clientWidth: 100,
    clientHeight: 100
  } as HTMLCanvasElement

  return new TilesetFeaturePicker(canvas, camera, tilesets as never)
}

describe('TilesetFeaturePicker.pickAll', () => {
  it('returns each tiles feature once and sorts nearest-first', () => {
    const picker = createPicker()

    const hits = picker.pickAll({ x: 50, y: 50 })

    expect(hits).toHaveLength(2)
    expect(hits.map((hit) => hit.object.name)).toEqual(['near', 'far'])
    expect(hits.map((hit) => hit.featureId)).toEqual([0, 0])
    expect(hits[0].distance).toBeLessThan(hits[1].distance)
  })
})
