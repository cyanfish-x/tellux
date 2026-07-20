import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  disposeGeometryBvh,
  ensureGeometryBvh,
  hasGeometryBvh
} from '../../hism/picking/geometryBvhCache'

describe('geometryBvhCache', () => {
  it('builds and caches geometry bvh', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const first = ensureGeometryBvh(geometry)
    const second = ensureGeometryBvh(geometry)
    expect(first).toBe(second)
    expect(hasGeometryBvh(geometry)).toBe(true)
    disposeGeometryBvh(geometry)
    expect(hasGeometryBvh(geometry)).toBe(false)
  })
})
