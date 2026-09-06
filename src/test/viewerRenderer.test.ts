import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { EntityManager, syncEntityManagerResolution } from '../entities/EntityManager'
import { getEntityPickGraphics } from '../entities/Entity'
import { createViewerRenderer } from '../rendering/ViewerRenderer'

describe('ViewerRenderer.resolutionScale', () => {
  it('writes pixel ratio through the facade and triggers the resize path', () => {
    const setPixelRatio = vi.fn()
    const resize = vi.fn()
    let scale = 1
    const renderer = createViewerRenderer({} as never, {
      getResolutionScale: () => scale,
      setResolutionScale: (value) => {
        scale = value
        setPixelRatio(value)
        resize()
      }
    })

    renderer.resolutionScale = 1.5

    expect(renderer.resolutionScale).toBe(1.5)
    expect(setPixelRatio).toHaveBeenCalledWith(1.5)
    expect(resize).toHaveBeenCalledOnce()
  })

  it('pushes the new pixel ratio into entity syncResolution', () => {
    const manager = new EntityManager({
      scene: new THREE.Scene(),
      toVector3: (_input, target) => target.set(0, 0, 0),
      ellipsoid: () => ({
        getCartographicToPosition: (
          _latitude: number,
          _longitude: number,
          _height: number,
          target: THREE.Vector3
        ) => target.set(1, 0, 0),
        getCartographicToNormal: (
          _latitude: number,
          _longitude: number,
          target: THREE.Vector3
        ) => target.set(0, 0, 1)
      }) as never,
      groundClamp: null,
      pixelRatio: () => 1
    })
    const entity = manager.add({
      id: 'line',
      polyline: {
        positions: [[0, 0, 0], [1, 0, 0]]
      }
    })
    const polyline = getEntityPickGraphics(entity)?.polyline
    const syncResolution = vi.spyOn(polyline!, 'syncResolution')

    syncEntityManagerResolution(manager, 800, 600, 1.5)

    expect(syncResolution).toHaveBeenCalledWith(800, 600)
    manager.dispose()
  })
})
