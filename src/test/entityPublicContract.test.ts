import { describe, expect, it } from 'vitest'

import type {
  GraphicOutlineOptions,
  IconOptions,
  PointOptions,
  PolygonOptions,
  PolygonOutlineOptions,
  PolylineOptions,
  SymbolOptions,
  TextOptions
} from '../types'

type Assert<T extends true> = T
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false
type OmitsKey<T, K extends PropertyKey> = K extends keyof T ? false : true

type _PointOmitsUnsupportedClamp = Assert<OmitsKey<PointOptions, 'clamp'>>
type _SymbolOmitsUnsupportedClamp = Assert<OmitsKey<SymbolOptions, 'clamp'>>
type _IconOmitsUnsupportedSizeInMeters = Assert<OmitsKey<IconOptions, 'sizeInMeters'>>
type _PolylineClampIsBoolean = Assert<Equal<PolylineOptions['clamp'], boolean | undefined>>
type _PolygonClampIsBoolean = Assert<Equal<PolygonOptions['clamp'], boolean | undefined>>
type _PointOutlineIsObject = Assert<Equal<PointOptions['outline'], GraphicOutlineOptions | undefined>>
type _PolygonOutlineIsObject = Assert<Equal<PolygonOptions['outline'], PolygonOutlineOptions | undefined>>
type _TextUsesColor = Assert<OmitsKey<TextOptions, 'fillColor'>>
type _PointOmitsFlatOutline = Assert<OmitsKey<PointOptions, 'outlineWidth'>>

describe('entity public contract', () => {
  it('keeps the supported ground-clamp API boolean-only', () => {
    const polyline: PolylineOptions = {
      positions: [],
      clamp: true
    }
    const polygon: PolygonOptions = {
      positions: [],
      clamp: true
    }

    expect(polyline.clamp).toBe(true)
    expect(polygon.clamp).toBe(true)
  })
})
