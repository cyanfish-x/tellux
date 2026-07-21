import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import type { Picked3DTilesFeature } from '../../types'
import {
  createFeatureGeometry,
  OverlayHighlighter
} from '../../highlight/OverlayHighlighter'
import { resolveHighlightTarget } from '../../highlight/HighlightManager'
import { HighlightManager } from '../../highlight/HighlightManager'
import { HighlightSettings } from '../../scene/HighlightSettings'
import type { ResolvedSceneOptions } from '../../scene/SceneOptions'

function createResolvedHighlight(): ResolvedSceneOptions['highlight'] {
  return {
    outline: {
      enabled: true,
      color: '#7cff5b',
      hiddenColor: '#7cff5b',
      edgeStrength: 1.5,
      xray: true
    },
    overlay: {
      enabled: true,
      color: '#7cff5b',
      opacity: 0.55,
      hoverColor: '#38bdf8',
      hoverOpacity: 0.42
    }
  }
}

function createBatchMesh(featureId: number) {
  const geometry = new THREE.BufferGeometry()
  // two triangles: first feature 1, second feature 2
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0
  ])
  const batchIds = new Float32Array([1, 1, 1, 2, 2, 2])
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('_BATCHID', new THREE.BufferAttribute(batchIds, 1))
  geometry.setIndex([0, 1, 2, 3, 4, 5])
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  mesh.updateMatrixWorld(true)
  return mesh
}

function createFeature(
  mesh: THREE.Mesh,
  featureId: number
): Picked3DTilesFeature {
  return {
    layerId: 'layer-1',
    tileset: {} as Picked3DTilesFeature['tileset'],
    object: mesh,
    point: new THREE.Vector3(),
    distance: 1,
    faceIndex: 0,
    featureId,
    properties: {},
    cartographic: { longitude: 0, latitude: 0, height: 0 }
  }
}

describe('resolveHighlightTarget', () => {
  it('accepts Object3D and tiles feature shortcuts', () => {
    const mesh = new THREE.Mesh()
    const feature = createFeature(mesh, 1)
    expect(resolveHighlightTarget(mesh)?.kind).toBe('object')
    expect(resolveHighlightTarget(feature)?.kind).toBe('tilesFeature')
    expect(
      resolveHighlightTarget({ type: 'object', object: mesh })?.kind
    ).toBe('object')
  })
})

describe('OverlayHighlighter', () => {
  it('extracts only matching feature triangles', () => {
    const mesh = createBatchMesh(1)
    const feature = createFeature(mesh, 1)
    const geometry = createFeatureGeometry(mesh, feature)
    expect(geometry).not.toBeNull()
    expect(geometry!.getAttribute('position').count).toBe(3)
  })

  it('adds and clears overlay mesh on the scene', () => {
    const scene = new THREE.Scene()
    const highlighter = new OverlayHighlighter(scene, '#7cff5b', 0.55)
    const mesh = createBatchMesh(1)
    highlighter.show(createFeature(mesh, 1))
    expect(scene.children.length).toBe(1)
    highlighter.clear()
    expect(scene.children.length).toBe(0)
  })
})

describe('HighlightManager routing', () => {
  it('routes Object3D to outline selection and tiles feature to overlay', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const settings = new HighlightSettings(createResolvedHighlight(), () => {})
    const manager = new HighlightManager({
      scene,
      camera,
      settings,
      webglOutlineAvailable: true
    })

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    manager.set(mesh)
    expect(manager.outlineEffect?.selection.has(mesh)).toBe(true)
    expect(scene.children.length).toBe(0)

    const group = new THREE.Group()
    const childMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    )
    group.add(childMesh)
    manager.set(group)
    expect(manager.outlineEffect?.selection.has(group)).toBe(false)
    expect(manager.outlineEffect?.selection.has(childMesh)).toBe(true)
    expect(childMesh.layers.isEnabled(manager.outlineEffect!.selection.layer)).toBe(
      true
    )

    const batchMesh = createBatchMesh(1)
    manager.set(createFeature(batchMesh, 1))
    expect(manager.outlineEffect?.selection.size).toBe(0)
    expect(scene.children.length).toBe(1)

    manager.clear()
    expect(scene.children.length).toBe(0)
    manager.dispose()
  })
})
