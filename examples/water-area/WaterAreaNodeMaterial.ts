import {
  cameraViewMatrix,
  cameraWorldMatrix,
  cross,
  Discard,
  Fn,
  If,
  materialColor,
  mix,
  normalView,
  positionView,
  renderGroup,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import { MeshPhysicalNodeMaterial, type Node } from 'three/webgpu'

import { getAtmosphereContext } from '@takram/three-atmosphere/webgpu'

import { waterAreaMask } from './wrapWaterAreaNodeMaterial'
import {
  createWaterAreaNormalTexture,
  type WaterAreaNormalTextures
} from './WaterAreaNormalTexture'
import {
  DEFAULT_WATER_AREA_APPEARANCE,
  normalizeWaterAreaAppearance,
  type WaterAreaAppearance,
  type ResolvedWaterAreaAppearance,
  type WaterAreaAppearanceOptions
} from './WaterAreaAppearance'
import {
  DEFAULT_WATER_AREA_WAVE_ORIGIN,
  createWaterAreaWaveFrame,
  type WaterAreaWaveFrame
} from './WaterAreaWaveFrame'

const DEFAULT_WAVE_FRAME = createWaterAreaWaveFrame(
  DEFAULT_WATER_AREA_WAVE_ORIGIN.longitude,
  DEFAULT_WATER_AREA_WAVE_ORIGIN.latitude
)
const DEGREES_TO_RADIANS = Math.PI / 180

function createFallbackWaterAreaNormalTextures(): WaterAreaNormalTextures {
  return [
    createWaterAreaNormalTexture(),
    createWaterAreaNormalTexture()
  ]
}

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

export class WaterAreaEffect implements WaterAreaAppearance {
  readonly weightNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.show ? 1 : 0
  )
  readonly maskNode = waterAreaMask.mul(this.weightNode)
  readonly colorNode = uniform(
    new Color(DEFAULT_WATER_AREA_APPEARANCE.color)
  )
  readonly colorMixNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.colorMix
  )
  readonly roughnessNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.roughness
  )
  readonly waveStrengthNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.waveStrength
  )
  readonly waveScaleNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.waveScale
  )
  readonly waveSpeedNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.waveSpeed
  )
  readonly waveDirectionNode = uniform(
    DEFAULT_WATER_AREA_APPEARANCE.waveDirection
  )
  readonly originViewNode
  readonly eastECEFNode
  readonly northECEFNode
  readonly normalTextures: WaterAreaNormalTextures

  constructor(
    options: WaterAreaAppearanceOptions = {},
    readonly waveFrame: WaterAreaWaveFrame = DEFAULT_WAVE_FRAME,
    normalTextures = createFallbackWaterAreaNormalTextures()
  ) {
    const originECEF = waveFrame.originECEF.clone()
    this.originViewNode = uniform(new Vector3())
      .setGroup(renderGroup)
      .onRenderUpdate((frame, self) => {
        self.value
          .copy(originECEF)
          .applyMatrix4(frame.camera.matrixWorldInverse)
      })
    this.eastECEFNode = uniform(waveFrame.eastECEF.clone())
    this.northECEFNode = uniform(waveFrame.northECEF.clone())
    this.normalTextures = normalTextures
    this.assign(options)
  }

  get show(): boolean {
    return this.weightNode.value > 0
  }

  set show(value: boolean) {
    this.weightNode.value = value ? 1 : 0
  }

  get color(): string {
    return `#${this.colorNode.value.getHexString()}`
  }

  set color(value: string) {
    const next = normalizeWaterAreaAppearance({ color: value }).color
    this.colorNode.value.set(next)
  }

  get colorMix(): number {
    return this.colorMixNode.value
  }

  set colorMix(value: number) {
    this.colorMixNode.value = normalizeWaterAreaAppearance({
      colorMix: value
    }).colorMix
  }

  get roughness(): number {
    return this.roughnessNode.value
  }

  set roughness(value: number) {
    this.roughnessNode.value = normalizeWaterAreaAppearance({
      roughness: value
    }).roughness
  }

  get waveStrength(): number {
    return this.waveStrengthNode.value
  }

  set waveStrength(value: number) {
    this.waveStrengthNode.value = normalizeWaterAreaAppearance({
      waveStrength: value
    }).waveStrength
  }

  get waveScale(): number {
    return this.waveScaleNode.value
  }

  set waveScale(value: number) {
    this.waveScaleNode.value = normalizeWaterAreaAppearance({
      waveScale: value
    }).waveScale
  }

  get waveSpeed(): number {
    return this.waveSpeedNode.value
  }

  set waveSpeed(value: number) {
    this.waveSpeedNode.value = normalizeWaterAreaAppearance({
      waveSpeed: value
    }).waveSpeed
  }

  get waveDirection(): number {
    return this.waveDirectionNode.value
  }

  set waveDirection(value: number) {
    this.waveDirectionNode.value = normalizeWaterAreaAppearance({
      waveDirection: value
    }).waveDirection
  }

  assign(options: WaterAreaAppearanceOptions): void {
    const next = normalizeWaterAreaAppearance({
      ...this.toJSON(),
      ...options
    })
    this.show = next.show
    this.color = next.color
    this.colorMix = next.colorMix
    this.roughness = next.roughness
    this.waveStrength = next.waveStrength
    this.waveScale = next.waveScale
    this.waveSpeed = next.waveSpeed
    this.waveDirection = next.waveDirection
  }

  toJSON(): ResolvedWaterAreaAppearance {
    return {
      show: this.show,
      color: this.color,
      colorMix: this.colorMix,
      roughness: this.roughness,
      waveStrength: this.waveStrength,
      waveScale: this.waveScale,
      waveSpeed: this.waveSpeed,
      waveDirection: this.waveDirection
    }
  }

  dispose(): void {
    for (const normalTexture of this.normalTextures) {
      normalTexture.dispose()
    }
  }
}

function createWaterAreaNormalNode(effect: WaterAreaEffect): Node {
  const macroNormalTextureNode = texture(effect.normalTextures[0])
  const detailNormalTextureNode = texture(effect.normalTextures[1])
  const eastView = cameraViewMatrix
    .mul(vec4(effect.eastECEFNode, 0)).xyz.normalize()
  const northView = cameraViewMatrix
    .mul(vec4(effect.northECEFNode, 0)).xyz.normalize()
  const relativeView = positionView.sub(effect.originViewNode)
  const positionENU = vec2(
    relativeView.dot(eastView),
    relativeView.dot(northView)
  )
  const directionRadians = effect.waveDirectionNode.mul(
    DEGREES_TO_RADIANS
  )
  const direction = vec2(
    directionRadians.sin(),
    directionRadians.cos()
  )
  const perpendicular = vec2(direction.y.negate(), direction.x)
  const macroPosition = vec2(
    positionENU.dot(perpendicular),
    positionENU.dot(direction)
  )
  const detailDirection = vec2(
    directionRadians.add(1.37).sin(),
    directionRadians.add(1.37).cos()
  )
  const detailPerpendicular = vec2(
    detailDirection.y.negate(),
    detailDirection.x
  )
  const detailPosition = vec2(
    positionENU.dot(detailPerpendicular),
    positionENU.dot(detailDirection)
  )
  const animationTime = time.mul(effect.waveSpeedNode)
  const macroUV = macroPosition
    .div(effect.waveScaleNode.mul(1400))
    .add(direction.mul(animationTime.mul(0.018)))
  const detailUV = detailPosition
    .div(effect.waveScaleNode.mul(180))
    .add(detailDirection.mul(animationTime.mul(-0.043)))
  const macroNormal = macroNormalTextureNode
    .sample(macroUV)
    .xyz.mul(2)
    .sub(1)
  const detailNormal = detailNormalTextureNode
    .sample(detailUV)
    .xyz.mul(2)
    .sub(1)
  const distance = positionView.length()
  const macroFade = smoothstep(160_000, 650_000, distance).oneMinus()
  const detailFade = smoothstep(30_000, 180_000, distance).oneMinus()
  const slope = macroNormal.xy
    .mul(macroFade.mul(0.48))
    .add(detailNormal.xy.mul(detailFade.mul(0.2)))
    .mul(effect.waveStrengthNode)
  const tangentNormal = vec3(slope, 1).normalize()
  const upView = ellipsoidNormalView
  const tangentEast = eastView
    .sub(upView.mul(eastView.dot(upView)))
    .normalize()
  const tangentNorth = cross(upView, tangentEast).normalize()
  return tangentEast
    .mul(tangentNormal.x)
    .add(tangentNorth.mul(tangentNormal.y))
    .add(upView.mul(tangentNormal.z))
    .normalize()
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
      waterAreaEffect.colorNode,
      effectMask.mul(waterAreaEffect.colorMixNode)
    )
    this.roughnessNode = mix(
      1,
      waterAreaEffect.roughnessNode,
      effectMask
    )
    this.specularIntensityNode = mix(0, 1, effectMask)
    this.waterAreaNormalNode = mix(
      normalView,
      createWaterAreaNormalNode(waterAreaEffect),
      effectMask
    ).normalize()
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
