import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_POINT_CLOUD_SHADING,
  resolvePointCloudShading
} from '../types/pointCloudShading'
import {
  PointCloudShadingController,
  aggregatePointCloudEdl
} from '../tiles/PointCloudShadingController'
import { PointCloudColorTransform } from '../tiles/PointCloudColorTransform'

describe('resolvePointCloudShading', () => {
  it('uses Tellux defaults that differ from Cesium eyeDomeLighting default', () => {
    const resolved = resolvePointCloudShading()
    expect(resolved).toEqual(DEFAULT_POINT_CLOUD_SHADING)
    expect(resolved.attenuation).toBe(false)
    expect(resolved.eyeDomeLighting).toBe(false)
    expect(resolved.normalShading).toBe(true)
    expect(resolved.geometricErrorScale).toBe(1)
  })

  it('merges partial options without inventing Cesium EDL-on default', () => {
    const resolved = resolvePointCloudShading({
      attenuation: true,
      geometricErrorScale: 2,
      maximumAttenuation: 12
    })
    expect(resolved.attenuation).toBe(true)
    expect(resolved.geometricErrorScale).toBe(2)
    expect(resolved.maximumAttenuation).toBe(12)
    expect(resolved.eyeDomeLighting).toBe(false)
  })
})

describe('PointCloudShadingController', () => {
  it('writes larger aPointSize when attenuation is enabled for nearby high-error tiles', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1e8)
    camera.position.set(0, 0, 0)
    const viewport = new THREE.Vector2(800, 600)
    const controller = new PointCloudShadingController({
      initial: {
        attenuation: true,
        geometricErrorScale: 1,
        maximumAttenuation: 32
      },
      getCamera: () => camera,
      getViewportSize: () => viewport,
      getErrorTarget: () => 16
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial())
    const root = new THREE.Group()
    root.add(points)

    controller.processTileModel(root, {
      geometricError: 40,
      traversal: { distanceFromCamera: 200 }
    })

    const pointSize = geometry.getAttribute('aPointSize')
    expect(pointSize).toBeDefined()
    expect(pointSize!.getX(0)).toBeGreaterThan(4)
    expect(pointSize!.getX(0)).toBeLessThanOrEqual(32)
  })

  it('disables data normals when normalShading is false', () => {
    const camera = new THREE.PerspectiveCamera()
    const controller = new PointCloudShadingController({
      initial: { normalShading: false },
      getCamera: () => camera,
      getViewportSize: () => new THREE.Vector2(800, 600),
      getErrorTarget: () => 16
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0]), 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial())
    const root = new THREE.Group()
    root.add(points)

    controller.processTileModel(root, { geometricError: 1 })

    expect(geometry.getAttribute('aTelluxPointNormalEnabled')?.getX(0)).toBe(0)
    expect(geometry.getAttribute('aTelluxPointEnvLit')).toBeUndefined()
  })

  it('enables data normals only when normalShading is true and normals exist', () => {
    const camera = new THREE.PerspectiveCamera()
    const controller = new PointCloudShadingController({
      initial: { normalShading: true },
      getCamera: () => camera,
      getViewportSize: () => new THREE.Vector2(800, 600),
      getErrorTarget: () => 16
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0]), 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial())
    const root = new THREE.Group()
    root.add(points)

    controller.processTileModel(root, { geometricError: 1 })

    expect(geometry.getAttribute('aTelluxPointNormalEnabled')?.getX(0)).toBe(1)
    expect(geometry.getAttribute('aTelluxPointEnvLit')).toBeUndefined()
  })

  it('keeps points unlit when the geometry has no normals', () => {
    const camera = new THREE.PerspectiveCamera()
    const controller = new PointCloudShadingController({
      initial: { normalShading: true },
      getCamera: () => camera,
      getViewportSize: () => new THREE.Vector2(800, 600),
      getErrorTarget: () => 16
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    const points = new THREE.Points(geometry, new THREE.PointsMaterial())
    const root = new THREE.Group()
    root.add(points)

    controller.processTileModel(root, { geometricError: 1 })

    expect(geometry.getAttribute('aTelluxPointNormalEnabled')?.getX(0)).toBe(0)
    expect(geometry.getAttribute('aTelluxPointEnvLit')).toBeUndefined()
  })

  it('attaches the display-color transform while processing colored points', () => {
    const camera = new THREE.PerspectiveCamera()
    const colorTransform = new PointCloudColorTransform(() => ({
      toneMapping: THREE.AgXToneMapping,
      exposure: 5
    }))
    const controller = new PointCloudShadingController({
      getCamera: () => camera,
      getViewportSize: () => new THREE.Vector2(800, 600),
      getErrorTarget: () => 16,
      colorTransform
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Uint8Array([64, 128, 192]), 3, true)
    )
    const material = new THREE.PointsMaterial({ vertexColors: true })
    const points = new THREE.Points(geometry, material)

    controller.processTileModel(points, { geometricError: 1 })

    expect(material.customProgramCacheKey()).toContain('tellux-point-color-transform')
    colorTransform.dispose()
  })
})

describe('aggregatePointCloudEdl', () => {
  it('enables when any controller enables EDL and takes max strength/radius', () => {
    const camera = new THREE.PerspectiveCamera()
    const make = (options: {
      eyeDomeLighting?: boolean
      eyeDomeLightingStrength?: number
      eyeDomeLightingRadius?: number
    }) =>
      new PointCloudShadingController({
        initial: options,
        getCamera: () => camera,
        getViewportSize: () => new THREE.Vector2(1, 1),
        getErrorTarget: () => 16
      })

    const off = make({ eyeDomeLighting: false })
    const a = make({
      eyeDomeLighting: true,
      eyeDomeLightingStrength: 0.5,
      eyeDomeLightingRadius: 2
    })
    const b = make({
      eyeDomeLighting: true,
      eyeDomeLightingStrength: 1.5,
      eyeDomeLightingRadius: 1
    })

    expect(aggregatePointCloudEdl([off])).toEqual({
      enabled: false,
      strength: 1,
      radius: 1
    })
    expect(aggregatePointCloudEdl([off, a, b])).toEqual({
      enabled: true,
      strength: 1.5,
      radius: 2
    })
  })
})
