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
  uniform,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import { Color, Vector3 } from 'three'
import {
  EnvironmentNode,
  MeshPhysicalNodeMaterial,
  type Node,
  type NodeBuilder
} from 'three/webgpu'

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
import type { WaterAreaOpticsOptions } from './WaterAreaOptics'
import { WaterAreaOpticsEffect } from './WaterAreaOpticsEffect'
import { WaterAreaEnvironmentNode } from './WaterAreaEnvironmentNode'
import {
  DEFAULT_WATER_AREA_WAVE_ORIGIN,
  createWaterAreaWaveFrame,
  type WaterAreaWaveFrame
} from './WaterAreaWaveFrame'
import {
  VALVE_WATER_FLOW_CYCLE,
  VALVE_WATER_FLOW_HALF_CYCLE,
  advanceValveWaterFlowPhase
} from './WaterAreaFlow'

const DEFAULT_WAVE_FRAME = createWaterAreaWaveFrame(
  DEFAULT_WATER_AREA_WAVE_ORIGIN.longitude,
  DEFAULT_WATER_AREA_WAVE_ORIGIN.latitude
)
const DEGREES_TO_RADIANS = Math.PI / 180
const VALVE_WATER_NORMAL_SCALE_METERS = 700

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
  readonly flowPhaseNode
  readonly normalTextures: WaterAreaNormalTextures
  readonly optics: WaterAreaOpticsEffect

  constructor(
    options: WaterAreaAppearanceOptions = {},
    readonly waveFrame: WaterAreaWaveFrame = DEFAULT_WAVE_FRAME,
    normalTextures = createFallbackWaterAreaNormalTextures(),
    opticsOptions: WaterAreaOpticsOptions = {}
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
    this.flowPhaseNode = uniform(0)
      .setGroup(renderGroup)
      .onRenderUpdate((frame, self) => {
        self.value = advanceValveWaterFlowPhase(
          self.value,
          frame.deltaTime,
          this.waveSpeedNode.value
        )
      })
    this.normalTextures = normalTextures
    this.optics = new WaterAreaOpticsEffect(opticsOptions, waveFrame)
    this.assign(options)
  }

  get show(): boolean {
    return this.weightNode.value > 0
  }

  set show(value: boolean) {
    this.weightNode.value = value ? 1 : 0
    this.optics.setEffectVisible(value)
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
    this.optics.dispose()
    for (const normalTexture of this.normalTextures) {
      normalTexture.dispose()
    }
  }
}

function createWaterAreaNormalNode(effect: WaterAreaEffect): Node {
  const phase0NormalTextureNode = texture(effect.normalTextures[0])
  const phase1NormalTextureNode = texture(effect.normalTextures[1])
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
  // Keep both samples half a cycle apart and crossfade between them. This
  // mirrors Three.js r184 Water2Mesh and hides the visible reset that a
  // single distorted normal sample would produce.
  // Source: https://github.com/mrdoob/three.js/blob/r184/examples/jsm/objects/Water2Mesh.js
  const phase0 = effect.flowPhaseNode
  const phase1 = effect.flowPhaseNode
    .add(VALVE_WATER_FLOW_HALF_CYCLE)
    .div(VALVE_WATER_FLOW_CYCLE)
    .fract()
    .mul(VALVE_WATER_FLOW_CYCLE)
  const phaseBlend = phase0
    .sub(VALVE_WATER_FLOW_HALF_CYCLE)
    .abs()
    .div(VALVE_WATER_FLOW_HALF_CYCLE)
  const baseUV = positionENU.div(
    effect.waveScaleNode.mul(VALVE_WATER_NORMAL_SCALE_METERS)
  )
  const phase0Normal = phase0NormalTextureNode
    .sample(baseUV.add(direction.mul(phase0)))
    .xyz.mul(2)
    .sub(1)
  const phase1Normal = phase1NormalTextureNode
    .sample(baseUV.add(direction.mul(phase1)))
    .xyz.mul(2)
    .sub(1)
  const flowNormal = mix(phase0Normal, phase1Normal, phaseBlend)
  const distance = positionView.length()
  const distanceFade = smoothstep(160_000, 650_000, distance).oneMinus()
  const slope = flowNormal.xy
    .mul(distanceFade.mul(0.62))
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
  private readonly waterAreaEnvironmentNode: WaterAreaEnvironmentNode

  constructor(waterAreaEffect = new WaterAreaEffect()) {
    super()
    this.waterAreaEffect = waterAreaEffect
    const effectMask = waterAreaEffect.maskNode
    const waterNormalNode = createWaterAreaNormalNode(waterAreaEffect)
    const optics = waterAreaEffect.optics
    // SkyEnvironmentNode returns a linear HDR PMREM node. Keep it local to
    // water fragments so scene-wide PBR materials retain their current light.
    // Source: https://github.com/takram-design-engineering/three-geospatial/blob/atmosphere%400.19.1/packages/atmosphere/src/webgpu/SkyEnvironmentNode.ts
    this.envNode = optics.environmentNode.mul(
      effectMask.mul(optics.environmentWeightNode)
    )
    this.waterAreaEnvironmentNode = new WaterAreaEnvironmentNode(
      this.envNode
    )

    // ReflectorNode renders a local tangent-plane view into a shared texture.
    // Keep a ReflectorNode clone in the graph so Three schedules the shared
    // capture, while its referenceNode follows the stable current-camera
    // texture. Offset screen UV by the animated wave normal.
    // Source: https://github.com/mrdoob/three.js/blob/r184/src/nodes/utils/ReflectorNode.js
    const reflectionOffset = waterNormalNode
      .sub(ellipsoidNormalView)
      .xy.mul(0.035)
    const reflectionSampler = optics.sampleReflection(
      optics.reflectionNode.uvNode.add(reflectionOffset)
    )
    const viewDirection = positionView.negate().normalize()
    const facing = waterNormalNode.dot(viewDirection).max(0)
    const fresnel = facing
      .oneMinus()
      .pow(5)
      .mul(0.98)
      .add(0.02)
    const reflectionContribution = reflectionSampler.rgb.mul(
      fresnel
        .mul(effectMask)
        .mul(optics.reflectionWeightNode)
    )
    this.emissiveNode = reflectionContribution
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
      waterNormalNode,
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

  override setupEnvironment(
    _builder: NodeBuilder
  ): EnvironmentNode | null {
    return this.waterAreaEnvironmentNode
  }
}
