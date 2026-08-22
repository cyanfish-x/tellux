import { describe, expect, it } from 'vitest'

import { classifyWaterAreaTile } from './classifyWaterAreaTile'

describe('classifyWaterAreaTile', () => {
  it('classifies a tile without water features as land', () => {
    expect(classifyWaterAreaTile(new Map())).toBe('land')
  })

  it('ignores glaciers when deciding whether a tile contains water', () => {
    expect(
      classifyWaterAreaTile(
        new Map([
          ['water_polygons', [{ numVertices: 8, props: { kind: 'glacier' } }]]
        ])
      )
    ).toBe('land')
  })

  it('classifies a rectangular ocean tile without occluders as water', () => {
    expect(
      classifyWaterAreaTile(
        new Map([['ocean', [{ numVertices: 5, props: {} }]]])
      )
    ).toBe('water')
  })

  it('keeps partial water and ocean tiles with occluders as mixed', () => {
    expect(
      classifyWaterAreaTile(
        new Map([['water_polygons', [{ numVertices: 12, props: {} }]]])
      )
    ).toBe('mixed')

    expect(
      classifyWaterAreaTile(
        new Map([
          ['ocean', [{ numVertices: 5, props: {} }]],
          ['bridges', [{ numVertices: 6, props: {} }]]
        ])
      )
    ).toBe('mixed')
  })
})
