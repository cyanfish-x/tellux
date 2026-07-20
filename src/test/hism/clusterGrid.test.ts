import { describe, expect, it } from 'vitest'
import {
  cartographicOffsetMeters,
  clusterCellKeyFromCartographic,
  createClusterCellBounds,
  createClusterCellKey,
  resolveClusterReference
} from '../../hism/spatial/clusterGrid'

describe('spatialCluster', () => {
  it('creates stable cell keys for nearby points', () => {
    const reference = { longitude: 103.56, latitude: 31.01 }
    const first = clusterCellKeyFromCartographic(
      reference,
      103.5605,
      31.0105,
      512
    )
    const second = clusterCellKeyFromCartographic(
      reference,
      103.5606,
      31.0106,
      512
    )

    expect(first).toBe(second)
  })

  it('splits distant points into different cells', () => {
    const reference = { longitude: 103.56, latitude: 31.01 }
    const near = clusterCellKeyFromCartographic(reference, 103.5605, 31.0105, 256)
    const far = clusterCellKeyFromCartographic(reference, 103.58, 31.02, 256)

    expect(near).not.toBe(far)
  })

  it('computes reference from centroid', () => {
    expect(
      resolveClusterReference([103, 105], [31, 33])
    ).toEqual({
      longitude: 104,
      latitude: 32
    })
  })

  it('builds cell bounds from key', () => {
    expect(createClusterCellBounds('1:2', 512)).toEqual({
      key: '1:2',
      eastMin: 512,
      northMin: 1024,
      eastMax: 1024,
      northMax: 1536
    })
  })

  it('maps east/north offsets to cell keys', () => {
    expect(createClusterCellKey(600, -50, 512)).toBe('1:-1')
    expect(
      cartographicOffsetMeters(103.56, 31.01, 103.5605, 31.0105).east
    ).toBeGreaterThan(0)
  })
})
