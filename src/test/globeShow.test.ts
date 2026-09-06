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
      applyGlobeShow
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
