import { describe, expect, it } from 'vitest'

import { rasterizeTerrainPage } from './terrainRasterizer'

describe('rasterizeTerrainPage', () => {
  it('rasterizes only the surface index group and applies the mesh-to-ocean transform', () => {
    const result = rasterizeTerrainPage({
      size: 5,
      positions: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        1, 0, 1,
        0, 0, 1,
        0, -100, 0
      ]),
      uvs: new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1,
        0, 0
      ]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 0, 4, 1]),
      indexStart: 0,
      indexCount: 6,
      matrix: [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 10, 0, 1
      ]
    })

    expect([...result.validity]).toEqual(new Array(25).fill(1))
    expect([...result.heights]).toEqual(new Array(25).fill(10))
  })
})
