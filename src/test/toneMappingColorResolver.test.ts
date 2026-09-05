import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

import { EntityManager, type EntityManagerOptions } from '../entities/EntityManager'
import type { GroundClampContext } from '../entities/groundClamp'
import { ToneMappingColorResolver } from '../entities/invertToneMapping'
import { OverlayHighlighter } from '../highlight/OverlayHighlighter'
import type { Picked3DTilesFeature } from '../types'
import { PostProcessSettings } from '../scene/PostProcessSettings'
import { resolveViewerPostProcessOptions } from '../ViewerOptionsResolver'

beforeAll(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        beginPath: vi.fn(),
        arc: vi.fn(),
        closePath: vi.fn(),
        fill: vi.fn(),
        fillStyle: ''
      })
    })
  })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

function createEntityManager(
  scene: THREE.Scene,
  colorResolver: ToneMappingColorResolver,
  groundClamp: GroundClampContext | null = null
) {
  return new EntityManager({
    scene,
    toVector3: (input, target) => (
      Array.isArray(input)
        ? target.set(input[0], input[1], input[2] ?? 0)
        : target.set(input.longitude, input.latitude, input.height)
    ),
    ellipsoid: () => ({
      getCartographicToPosition: (latitude, longitude, height, target) => {
        const radius = 1 + height
        return target.set(
          Math.cos(latitude) * Math.cos(longitude) * radius,
          Math.sin(latitude) * radius,
          Math.cos(latitude) * Math.sin(longitude) * radius
        )
      },
      getCartographicToNormal: (latitude, longitude, target) => target.set(
        Math.cos(latitude) * Math.cos(longitude),
        Math.sin(latitude),
        Math.cos(latitude) * Math.sin(longitude)
      )
    }) as ReturnType<EntityManagerOptions['ellipsoid']>,
    groundClamp,
    pixelRatio: () => 1,
    resolveColor: colorResolver.resolveColor
  })
}

function collectMaterialColors(root: THREE.Object3D) {
  const colors: THREE.Color[] = []
  root.traverse((object) => {
    if (!('material' in object)) return
    const material = (object as THREE.Mesh).material
    if (Array.isArray(material)) return
    if (!('color' in material)) return
    colors.push((material as THREE.Material & { color: THREE.Color }).color.clone())
  })
  return colors
}

function createGroundClampContext(): GroundClampContext {
  return {
    root: new THREE.Group(),
    uniforms: {
      u_cameraHigh: { value: new THREE.Vector3() },
      u_cameraLow: { value: new THREE.Vector3() },
      u_viewMatrixRTE: { value: new THREE.Matrix4() },
      u_projectionMatrix: { value: new THREE.Matrix4() },
      telluxGroundDepth: { value: null },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uInverseProjection: { value: new THREE.Matrix4() }
    }
  }
}

function collectUniformColors(root: THREE.Object3D) {
  const colors: THREE.Color[] = []
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return
    const material = (object as THREE.Mesh).material
    if (Array.isArray(material) || !(material as THREE.ShaderMaterial).isShaderMaterial) return
    const color = (material as THREE.ShaderMaterial).uniforms.uColor?.value
    if (color instanceof THREE.Color) colors.push(color.clone())
  })
  return colors
}

function createPickedFeature(): Picked3DTilesFeature {
  const object = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial()
  )
  object.updateMatrixWorld(true)
  return {
    layerId: 'tiles',
    tileset: {} as Picked3DTilesFeature['tileset'],
    object,
    point: new THREE.Vector3(),
    distance: 1,
    faceIndex: 0,
    featureId: null,
    properties: {},
    cartographic: { longitude: 0, latitude: 0, height: 0 }
  }
}

function getOverlayColor(scene: THREE.Scene) {
  const material = (scene.children[0] as THREE.Mesh).material
  return (material as THREE.MeshBasicMaterial).color.clone()
}

describe('ToneMappingColorResolver Viewer isolation', () => {
  it('keeps two resolver states independent', () => {
    const first = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 2
    })
    const second = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 8
    })

    const firstBefore = first.resolveColor('#ff0000')
    const secondBefore = second.resolveColor('#ff0000')

    first.setState({
      toneMapping: THREE.AgXToneMapping,
      exposure: 4
    })

    expect(first.resolveColor('#ff0000').r).toBeCloseTo(firstBefore.r / 2)
    expect(second.resolveColor('#ff0000')).toEqual(secondBefore)
  })

  it('refreshes existing entity materials without changing another manager', () => {
    const firstResolver = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 2
    })
    const secondResolver = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 8
    })
    const firstManager = createEntityManager(new THREE.Scene(), firstResolver)
    const secondManager = createEntityManager(new THREE.Scene(), secondResolver)
    const firstEntity = firstManager.add({
      position: [0, 0, 0],
      point: {
        color: '#38bdf8',
        outlineColor: '#ff0000',
        outlineWidth: 2
      },
      polyline: {
        positions: [[1, 0, 0], [1, 1, 0]],
        color: '#00ff00'
      },
      polygon: {
        positions: [[2, 0, 0], [2, 1, 0], [2, 1, 1]],
        color: '#ffd166',
        outline: true,
        outlineColor: '#f472b6'
      }
    })
    const secondEntity = secondManager.add({
      position: [0, 0, 0],
      point: {
        color: '#38bdf8',
        outlineColor: '#ff0000',
        outlineWidth: 2
      },
      polyline: {
        positions: [[1, 0, 0], [1, 1, 0]],
        color: '#00ff00'
      },
      polygon: {
        positions: [[2, 0, 0], [2, 1, 0], [2, 1, 1]],
        color: '#ffd166',
        outline: true,
        outlineColor: '#f472b6'
      }
    })
    const firstBefore = collectMaterialColors(firstEntity.object3D)
    const secondBefore = collectMaterialColors(secondEntity.object3D)

    firstResolver.setState({
      toneMapping: THREE.AgXToneMapping,
      exposure: 4
    })
    firstManager.refreshColors()

    const firstAfter = collectMaterialColors(firstEntity.object3D)
    const secondAfter = collectMaterialColors(secondEntity.object3D)
    expect(firstAfter).toHaveLength(firstBefore.length)
    firstAfter.forEach((color, index) => {
      expect(color).not.toEqual(firstBefore[index])
    })
    expect(secondAfter).toEqual(secondBefore)
  })

  it('refreshes ground-clamped graphic uniforms', () => {
    const resolver = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 2
    })
    const groundClamp = createGroundClampContext()
    const manager = createEntityManager(new THREE.Scene(), resolver, groundClamp)
    manager.add({
      polyline: {
        positions: [[0, 0, 0], [0.01, 0.01, 0]],
        color: '#00ff00',
        clamp: true
      },
      polygon: {
        positions: [[0, 0, 0], [0.01, 0, 0], [0.01, 0.01, 0]],
        color: '#ffd166',
        clamp: true
      }
    })
    const before = collectUniformColors(groundClamp.root)

    resolver.setState({
      toneMapping: THREE.AgXToneMapping,
      exposure: 4
    })
    manager.refreshColors()

    const after = collectUniformColors(groundClamp.root)
    expect(after).toHaveLength(2)
    after.forEach((color, index) => {
      expect(color).not.toEqual(before[index])
    })
  })

  it('keeps highlight colors scoped to their resolver', () => {
    const firstResolver = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 2
    })
    const secondResolver = new ToneMappingColorResolver({
      toneMapping: THREE.AgXToneMapping,
      exposure: 8
    })
    const firstScene = new THREE.Scene()
    const secondScene = new THREE.Scene()
    const first = new OverlayHighlighter(
      firstScene,
      '#7cff5b',
      0.55,
      firstResolver.resolveColor
    )
    const second = new OverlayHighlighter(
      secondScene,
      '#7cff5b',
      0.55,
      secondResolver.resolveColor
    )
    const feature = createPickedFeature()
    first.show(feature)
    second.show(feature)
    const firstBefore = getOverlayColor(firstScene)
    const secondBefore = getOverlayColor(secondScene)

    expect(firstBefore).not.toEqual(secondBefore)

    firstResolver.setState({
      toneMapping: THREE.AgXToneMapping,
      exposure: 4
    })
    first.setStyle('#7cff5b', 0.55)

    expect(getOverlayColor(firstScene)).not.toEqual(firstBefore)
    expect(getOverlayColor(secondScene)).toEqual(secondBefore)
  })

  it('refreshes existing Viewer colors when exposure changes', () => {
    const setState = vi.fn()
    const refreshColors = vi.fn()
    const renderer = {
      toneMapping: THREE.AgXToneMapping,
      toneMappingExposure: 2
    }
    const postProcess = new PostProcessSettings(
      resolveViewerPostProcessOptions({ toneMappingExposure: 2 }),
      () => {},
      (exposure) => {
        renderer.toneMappingExposure = exposure
        setState({
          toneMapping: renderer.toneMapping,
          exposure
        })
        refreshColors()
      }
    )

    postProcess.toneMappingExposure = 4

    expect(postProcess.toneMappingExposure).toBe(4)
    expect(renderer.toneMappingExposure).toBe(4)
    expect(setState).toHaveBeenCalledWith({
      toneMapping: THREE.AgXToneMapping,
      exposure: 4
    })
    expect(refreshColors).toHaveBeenCalledOnce()
  })
})
