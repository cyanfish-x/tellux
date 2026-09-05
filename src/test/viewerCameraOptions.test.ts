import { describe, expect, it } from 'vitest'

import { DEFAULT_CAMERA } from '../constants'
import { resolveViewerCameraOptions } from '../ViewerOptionsResolver'

describe('resolveViewerCameraOptions', () => {
  it('keeps the default destination when only projection is provided', () => {
    const options = resolveViewerCameraOptions({
      projection: { far: 50_000_000 }
    })

    expect(options.destination).toEqual(DEFAULT_CAMERA.destination)
    expect(options.orientation).toEqual(DEFAULT_CAMERA.orientation)
    expect(options.projection.fov).toBe(DEFAULT_CAMERA.projection.fov)
    expect(options.projection.far).toBe(50_000_000)
  })

  it('reads a destination tuple with required height', () => {
    const options = resolveViewerCameraOptions({
      destination: [139.8, 35.6812, 1200],
      orientation: { heading: 45 }
    })

    expect(options.destination).toEqual({
      longitude: 139.8,
      latitude: 35.6812,
      height: 1200
    })
    expect(options.orientation.heading).toBe(45)
    expect(options.orientation.pitch).toBe(DEFAULT_CAMERA.orientation.pitch)
  })
})
