import { describe, expect, it, vi } from 'vitest'

import { createGlobe } from '../Globe'

describe('Globe.show facade', () => {
  it('keeps the user visibility intent when the surface tileset is replaced', () => {
    const surfaceGroup = { visible: true }
    const terrainGroup = { visible: true }
    let terrainTileset: { group: { visible: boolean } } | null = null
    const applyGlobeShow = vi.fn((show: boolean) => {
      surfaceGroup.visible = show && terrainTileset === null
      if (terrainTileset) terrainGroup.visible = show
    })
    const globe = createGlobe({
      tileset: { ellipsoid: {}, group: surfaceGroup },
      applyGlobeShow,
      applyGlobeOpacity: vi.fn()
    } as never)

    expect(applyGlobeShow).toHaveBeenCalledWith(true)
    expect(surfaceGroup.visible).toBe(true)

    globe.show = false
    expect(globe.show).toBe(false)
    expect(surfaceGroup.visible).toBe(false)

    terrainTileset = { group: terrainGroup }
    applyGlobeShow(globe.show)

    expect(surfaceGroup.visible).toBe(false)
    expect(terrainGroup.visible).toBe(false)

    globe.show = true
    expect(terrainGroup.visible).toBe(true)
    expect(surfaceGroup.visible).toBe(false)
  })
})

describe('Globe.opacity facade', () => {
  it('clamps opacity to 0-1 and falls back to 1 for non-finite values', () => {
    const applyGlobeOpacity = vi.fn()
    const globe = createGlobe({
      tileset: { ellipsoid: {}, group: { visible: true } },
      applyGlobeShow: vi.fn(),
      applyGlobeOpacity
    } as never)

    expect(applyGlobeOpacity).toHaveBeenCalledWith(1)
    expect(globe.opacity).toBe(1)

    globe.opacity = 0.4
    expect(globe.opacity).toBe(0.4)
    expect(applyGlobeOpacity).toHaveBeenCalledWith(0.4)

    globe.opacity = 2
    expect(globe.opacity).toBe(1)

    globe.opacity = Number.NaN
    expect(globe.opacity).toBe(1)
  })

  it('does not treat opacity 0 as show false', () => {
    const applyGlobeShow = vi.fn()
    const applyGlobeOpacity = vi.fn()
    const globe = createGlobe({
      tileset: { ellipsoid: {}, group: { visible: true } },
      applyGlobeShow,
      applyGlobeOpacity
    } as never)

    globe.opacity = 0
    expect(globe.show).toBe(true)
    expect(globe.opacity).toBe(0)
    expect(applyGlobeShow).toHaveBeenCalledTimes(1)
    expect(applyGlobeShow).toHaveBeenCalledWith(true)

    globe.show = false
    expect(globe.show).toBe(false)
    expect(globe.opacity).toBe(0)
  })

  it('notifies material changes without going through scene.surface', () => {
    const onMaterialChange = vi.fn()
    const globe = createGlobe(
      {
        tileset: { ellipsoid: {}, group: { visible: true } },
        applyGlobeShow: vi.fn(),
        applyGlobeOpacity: vi.fn()
      } as never,
      onMaterialChange
    )

    globe.material.mode = 'standard'
    globe.material.roughness = 0.5
    expect(onMaterialChange).toHaveBeenCalledTimes(2)
    expect(globe.material.mode).toBe('standard')
    expect(globe.material.roughness).toBe(0.5)
  })
})
