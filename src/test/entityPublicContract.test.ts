import { describe, expect, it } from 'vitest'

import type {
  IconOptions,
  PointOptions,
  PolygonOptions,
  PolylineOptions,
  SymbolOptions
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
