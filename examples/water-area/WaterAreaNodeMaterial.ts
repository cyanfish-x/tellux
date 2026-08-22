import {
  cameraViewMatrix,
  cameraWorldMatrix,
  color,
  Discard,
  Fn,
  If,
  materialColor,
  mix,
  normalView,
  positionView,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import { MeshPhysicalNodeMaterial, type Node } from 'three/webgpu'

import { getAtmosphereContext } from '@takram/three-atmosphere/webgpu'

import { waterAreaMask } from './wrapWaterAreaNodeMaterial'

const positionECEF = Fn((builder) => {
  const { matrixWorldToECEF } = getAtmosphereContext(builder)
  return matrixWorldToECEF
    .mul(cameraWorldMatrix)
    .mul(vec4(positionView, 1)).xyz
})()

const ellipsoidNormalECEF = Fn((builder) => {
  const { ellipsoid } = getAtmosphereContext(builder)
  return positionECEF.div(vec3(ellipsoid.radii).pow2()).normalize()
})()

const ellipsoidNormalView = Fn((builder) => {
  const { matrixECEFToWorld } = getAtmosphereContext(builder)
  return cameraViewMatrix
    .mul(matrixECEFToWorld)
    .mul(vec4(ellipsoidNormalECEF, 0)).xyz.normalize()
})()

export class WaterAreaEffect {
  readonly weightNode = uniform(1)
  readonly maskNode = waterAreaMask.mul(this.weightNode)

  get show(): boolean {
    return this.weightNode.value > 0
  }

  set show(value: boolean) {
    this.weightNode.value = value ? 1 : 0
  }
}

export class WaterAreaNodeMaterial extends MeshPhysicalNodeMaterial {
  override ior = 1.33
  override metalness = 0
  readonly waterAreaEffect: WaterAreaEffect
  private readonly waterAreaNormalNode: Node

  constructor(waterAreaEffect = new WaterAreaEffect()) {
    super()
    this.waterAreaEffect = waterAreaEffect
    const effectMask = waterAreaEffect.maskNode
    this.colorNode = mix(
      // Three's MaterialNode declaration does not currently expose the full
      // TSL node extension surface even though it is a vec4 node at runtime.
      materialColor as any,
      color(0x020514),
      effectMask.mul(0.8)
    )
    this.roughnessNode = mix(1, 0.35, effectMask)
    this.specularIntensityNode = mix(0, 1, effectMask)
    this.waterAreaNormalNode = mix(
      normalView,
      ellipsoidNormalView,
      effectMask
    )
    this.castShadowNode = Fn(() => {
      If(effectMask.greaterThan(0), () => {
        Discard()
      })
      return vec4(0, 0, 0, 1)
    })()
  }

  override setupNormal(): Node {
    return this.waterAreaNormalNode
  }
}
