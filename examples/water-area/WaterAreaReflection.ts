import { Object3D, Vector3 } from 'three'

import type { WaterAreaWaveFrame } from './WaterAreaWaveFrame'

const REFLECTOR_LOCAL_NORMAL = new Vector3(0, 0, 1)

/**
 * Creates an object frame whose local XY plane is tangent to WGS84 at the
 * water-area origin. Three.js ReflectorNode uses the object's local +Z axis as
 * the reflection-plane normal.
 */
export function createWaterAreaReflectionTarget(
  waveFrame: WaterAreaWaveFrame
): Object3D {
  const target = new Object3D()
  target.name = 'WaterAreaReflectionTarget'
  target.position.copy(waveFrame.originECEF)
  target.quaternion.setFromUnitVectors(
    REFLECTOR_LOCAL_NORMAL,
    waveFrame.upECEF.clone().normalize()
  )
  target.updateMatrix()
  target.updateMatrixWorld(true)
  return target
}
