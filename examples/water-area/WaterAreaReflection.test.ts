import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { createWaterAreaReflectionTarget } from './WaterAreaReflection'
import { createWaterAreaWaveFrame } from './WaterAreaWaveFrame'

describe('createWaterAreaReflectionTarget', () => {
  it('places the reflector on the local ellipsoid tangent plane', () => {
    const frame = createWaterAreaWaveFrame(-111.98797078872424, 70.33265443539143)
    const target = createWaterAreaReflectionTarget(frame)
    const reflectedNormal = new Vector3(0, 0, 1)
      .applyQuaternion(target.quaternion)
      .normalize()

    expect(target.position.distanceTo(frame.originECEF)).toBeCloseTo(0, 8)
    expect(reflectedNormal.dot(frame.upECEF)).toBeCloseTo(1, 8)
  })

  it('does not retain mutable references to the source frame', () => {
    const frame = createWaterAreaWaveFrame(-112.2525, 69.3782)
    const target = createWaterAreaReflectionTarget(frame)
    const originalPosition = target.position.clone()

    frame.originECEF.set(0, 0, 0)
    frame.upECEF.set(1, 0, 0)

    expect(target.position).toEqual(originalPosition)
    expect(new Vector3(0, 0, 1).applyQuaternion(target.quaternion).length()).toBeCloseTo(1)
  })
})
