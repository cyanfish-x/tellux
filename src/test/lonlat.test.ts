import { describe, expect, it } from 'vitest'

import { hasExplicitHeight, isLonLatPointList, readLonLat, readLonLatHeight } from '../lonlat'

describe('lonlat helpers', () => {
  it('treats a two-number tuple as a single point, not a list', () => {
    expect(isLonLatPointList([120, 30])).toBe(false)
    expect(isLonLatPointList([[120, 30]])).toBe(true)
    expect(isLonLatPointList([])).toBe(true)
    expect(isLonLatPointList({ longitude: 120, latitude: 30 })).toBe(false)
  })

  it('reads longitude and latitude from objects and tuples', () => {
    expect(readLonLat([120, 30])).toEqual({ longitude: 120, latitude: 30 })
    expect(readLonLat({ longitude: 121, latitude: 31, height: 12 })).toEqual({
      longitude: 121,
      latitude: 31
    })
    expect(readLonLatHeight([120, 30, 8])).toEqual({
      longitude: 120,
      latitude: 30,
      height: 8
    })
  })

  it('detects explicit height for camera destinations', () => {
    expect(hasExplicitHeight([120, 30])).toBe(false)
    expect(hasExplicitHeight([120, 30, 10])).toBe(true)
    expect(hasExplicitHeight({ longitude: 120, latitude: 30 })).toBe(false)
    expect(hasExplicitHeight({ longitude: 120, latitude: 30, height: 10 })).toBe(true)
  })
})
