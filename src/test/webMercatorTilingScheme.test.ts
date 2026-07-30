import { describe, expect, it } from 'vitest'

import { WebMercatorTilingScheme } from '../tiles/WebMercatorTilingScheme'

describe('WebMercatorTilingScheme', () => {
  it('returns the full Web Mercator cartographic extent', () => {
    const tiling = new WebMercatorTilingScheme()
    const [west, south, east, north] = tiling.getContentBounds()

    expect(west).toBeCloseTo(-Math.PI)
    expect(east).toBeCloseTo(Math.PI)
    expect(south).toBeCloseTo(-1.4844222297453324)
    expect(north).toBeCloseTo(1.4844222297453324)
  })

  it('maps quadtree tile coordinates to cartographic bounds', () => {
    const tiling = new WebMercatorTilingScheme()
    const [west, south, east, north] = tiling.getTileBounds(1, 1, 1)

    expect(west).toBeCloseTo(0)
    expect(south).toBeCloseTo(0)
    expect(east).toBeCloseTo(Math.PI)
    expect(north).toBeCloseTo(1.4844222297453324)
  })
})
