import { WMTSTilesOverlay } from '3d-tiles-renderer/plugins'
import * as THREE from 'three'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { ImageryOverlayFactory } from '../tiles/ImageryOverlayFactory'

beforeAll(() => {
  vi.stubGlobal('location', { href: 'http://localhost/' })
})

function createFactory() {
  return new ImageryOverlayFactory({
    renderer: {} as never,
    transparentOverlayTexture: new THREE.Texture()
  })
}

describe('ImageryOverlayFactory WMTS overlays', () => {
  it('creates a WMTSTilesOverlay for tianditu-style wmts source config', () => {
    const factory = createFactory()
    const overlay = factory.createOverlay({
      type: 'wmts',
      url: 'http://example.test/img_w/wmts',
      layer: 'img',
      tileMatrixSet: 'w',
      style: 'default',
      format: 'tiles',
      projection: 'EPSG:3857',
      levels: 18
    })

    expect(overlay).not.toBeNull()
    expect(overlay).toBeInstanceOf(WMTSTilesOverlay)
  })

  it('converts EPSG:4326 contentBoundingBox from degrees to radians', () => {
    const factory = createFactory()
    const overlay = factory.createOverlay({
      type: 'wmts',
      url: 'http://example.test/wmts',
      layer: 'img',
      tileMatrixSet: 'w',
      projection: 'EPSG:4326',
      contentBoundingBox: [-180, -90, 180, 90]
    })

    const imageSource = (overlay as { imageSource?: { contentBoundingBox?: number[] } }).imageSource
    expect(imageSource?.contentBoundingBox?.[0]).toBeCloseTo(-Math.PI)
    expect(imageSource?.contentBoundingBox?.[1]).toBeCloseTo(-Math.PI / 2)
    expect(imageSource?.contentBoundingBox?.[2]).toBeCloseTo(Math.PI)
    expect(imageSource?.contentBoundingBox?.[3]).toBeCloseTo(Math.PI / 2)
  })

  it('converts EPSG:3857 contentBoundingBox from web mercator meters to radians', () => {
    const factory = createFactory()
    const halfEarth = 6378137 * Math.PI
    const overlay = factory.createOverlay({
      type: 'wmts',
      url: 'http://example.test/wmts',
      layer: 'img',
      tileMatrixSet: 'w',
      projection: 'EPSG:3857',
      contentBoundingBox: [-halfEarth, -halfEarth, halfEarth, halfEarth]
    })

    const imageSource = (overlay as { imageSource?: { contentBoundingBox?: number[] } }).imageSource
    expect(imageSource?.contentBoundingBox?.[0]).toBeCloseTo(-Math.PI)
    expect(imageSource?.contentBoundingBox?.[2]).toBeCloseTo(Math.PI)
  })

  it('passes preprocessURL and dimensions through to the overlay', () => {
    const factory = createFactory()
    const preprocessURL = (url: string) => {
      const next = new URL(url)
      next.searchParams.set('tk', 'test-token')
      return next.toString()
    }

    const overlay = factory.createOverlay({
      type: 'wmts',
      url: 'http://example.test/wmts',
      layer: 'img',
      tileMatrixSet: 'w',
      dimensions: { TIME: '2024-01-01' },
      preprocessURL
    })

    expect(overlay?.preprocessURL).toBe(preprocessURL)
    const imageSource = (overlay as { imageSource?: { dimensions?: Record<string, string | number> } }).imageSource
    expect(imageSource?.dimensions).toEqual({ TIME: '2024-01-01' })
  })
})
