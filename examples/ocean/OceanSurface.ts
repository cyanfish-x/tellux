import * as THREE from 'three'
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu'
import {
  abs,
  clamp,
  color,
  cos,
  float,
  Fn,
  max,
  min,
  mix,
  normalLocal,
  normalView,
  normalize,
  positionLocal,
  positionViewDirection,
  sin,
  texture,
  uint,
  uniform,
  vec2,
  vec3
} from 'three/tsl'
import { RIYUE_BAY_PRESET } from './RiyueBayPreset'
import type { LocalGridShoreSolver } from './LocalGridShoreSolver'
import type { OceanParameters } from './parameters'
import type { TerrainFieldTextures } from './TerrainFieldTextures'

export interface OceanSurfaceOptions {
  root: THREE.Object3D
  parameters: OceanParameters
  field: TerrainFieldTextures
  solver: LocalGridShoreSolver
}

export class OceanSurface {
  readonly water: THREE.Mesh
  readonly seabed: THREE.Mesh
  private readonly time = uniform(0)
  private readonly seaLevel = uniform(0)
  private readonly amplitude = uniform(0.2)
  private readonly wavelength = uniform(10)
  private readonly choppiness = uniform(1.5)
  private readonly spread = uniform(40)
  private readonly waveDirection = uniform(0)
  private readonly dispersion = uniform(1)
  private readonly ripple = uniform(0.2)
  private readonly rippleScale = uniform(0.5)
  private readonly rippleAnisotropy = uniform(0.8)
  private readonly rippleBias = uniform(0.8)
  private readonly sss = uniform(1.5)
  private readonly caustics = uniform(1)
  private readonly foamScale = uniform(1)
  private readonly foamAmount = uniform(0.6)
  private readonly lean = uniform(0.5)
  private readonly layerCount = uniform(5)
  private readonly handoverDepth = uniform(6)
  private readonly debugMode = uniform(0)
  private readonly noiseView = uniform(0)
  private readonly fieldRevision = uniform(0)
  private readonly workerMilliseconds = uniform(0)
  private readonly waterMaterial: MeshPhysicalNodeMaterial
  private readonly seabedMaterial: MeshStandardNodeMaterial

  constructor(private readonly options: OceanSurfaceOptions) {
    const extent = RIYUE_BAY_PRESET.extent
    const quality = RIYUE_BAY_PRESET.quality[options.parameters.quality]
    const width = extent.crossShoreMax - extent.crossShoreMin
    const height = extent.alongshoreMax - extent.alongshoreMin
    const centerX = (extent.crossShoreMin + extent.crossShoreMax) * 0.5
    const geometry = new THREE.PlaneGeometry(width, height, quality.surfaceSegments, quality.surfaceSegments)
    geometry.rotateX(-Math.PI / 2)
    geometry.translate(centerX, 0, 0)

    this.waterMaterial = this.createWaterMaterial()
    this.water = new THREE.Mesh(geometry, this.waterMaterial)
    this.water.name = 'RiyueBayOceanSurface'
    this.water.frustumCulled = false
    this.water.renderOrder = 20
    options.root.add(this.water)

    const bedGeometry = new THREE.PlaneGeometry(width, height, 256, 256)
    bedGeometry.rotateX(-Math.PI / 2)
    bedGeometry.translate(centerX, 0, 0)
    this.seabedMaterial = this.createSeabedMaterial()
    this.seabed = new THREE.Mesh(bedGeometry, this.seabedMaterial)
    this.seabed.name = 'RiyueBayGeneratedSeabed'
    this.seabed.frustumCulled = false
    this.seabed.renderOrder = 5
    options.root.add(this.seabed)
    this.updateParameters(options.parameters)
  }

  update(deltaSeconds: number, parameters: OceanParameters) {
    if (!parameters.pause) this.time.value += Math.max(deltaSeconds, 0)
    this.fieldRevision.value = this.options.field.revision
    this.updateParameters(parameters)
  }

  updateParameters(parameters: OceanParameters) {
    this.seaLevel.value = parameters.seaLevel
    this.amplitude.value = parameters.amplitude
    this.wavelength.value = parameters.wavelength
    this.choppiness.value = parameters.choppiness
    this.spread.value = parameters.spread * Math.PI / 180
    this.waveDirection.value = parameters.waveDir * Math.PI / 180
    this.dispersion.value = parameters.dispersion
    this.ripple.value = parameters.ripple
    this.rippleScale.value = parameters.rippleScale
    this.rippleAnisotropy.value = parameters.rippleAniso
    this.rippleBias.value = parameters.rippleBias
    this.sss.value = parameters.sss
    this.caustics.value = parameters.caustics
    this.foamScale.value = parameters.foamScale
    this.foamAmount.value = parameters.foam
    this.lean.value = parameters.lean
    this.layerCount.value = parameters.layers
    this.handoverDepth.value = parameters.handoverDepth
    this.debugMode.value = debugModeIndex(parameters.debugField)
    this.noiseView.value = parameters.noiseView ? 1 : 0
    this.waterMaterial.wireframe = parameters.wireframe
  }

  setWorkerMilliseconds(milliseconds: number) {
    this.workerMilliseconds.value = milliseconds
  }

  dispose() {
    this.options.root.remove(this.water, this.seabed)
    this.water.geometry.dispose()
    this.seabed.geometry.dispose()
    this.waterMaterial.dispose()
    this.seabedMaterial.dispose()
  }

  private createWaterMaterial() {
    const material = new MeshPhysicalNodeMaterial({
      transparent: true,
      opacity: 0.97,
      roughness: 0.18,
      metalness: 0,
      transmission: 0,
      thickness: 1.2,
      ior: 1.333,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
      depthWrite: true,
      side: THREE.DoubleSide
    })
    const extent = RIYUE_BAY_PRESET.extent
    const fieldUv = vec2(
      positionLocal.x.sub(extent.crossShoreMin).div(extent.crossShoreMax - extent.crossShoreMin),
      positionLocal.z.sub(extent.alongshoreMin).div(extent.alongshoreMax - extent.alongshoreMin)
    )
    const valid = texture(this.options.field.validity, fieldUv).r.greaterThan(0.5)
    const water = texture(this.options.field.shoreSdf, fieldUv).r.lessThan(1.5)
    material.maskNode = valid.and(water.or(this.debugMode.greaterThan(0.5)))
    const crossShoreEdge = min(fieldUv.x, float(1).sub(fieldUv.x))
      .mul(extent.crossShoreMax - extent.crossShoreMin)
    const alongshoreEdge = min(fieldUv.y, float(1).sub(fieldUv.y))
      .mul(extent.alongshoreMax - extent.alongshoreMin)
    const edgeFade = clamp(min(crossShoreEdge, alongshoreEdge).div(64), 0, 1)
    material.opacityNode = this.debugMode.greaterThan(0.5).select(1, mix(0.55, 0.97, edgeFade))

    const local = positionLocal
    const sampleWaves = Fn(([position]) => {
      const waveHeight = float(0).toVar()
      const slopeX = float(0).toVar()
      const slopeZ = float(0).toVar()
      for (let layer = 0; layer < 5; layer += 1) {
        const enabled = this.layerCount.greaterThan(float(layer + 0.5))
        const scale = Math.pow(1.72, layer)
        const angle = this.waveDirection.add(this.spread.mul((layer - 2) / 4))
        const direction = vec2(sin(angle), cos(angle))
        const waveNumber = float(Math.PI * 2 * scale).div(this.wavelength)
        const phase = position.xz.dot(direction).mul(waveNumber)
          .add(this.time.mul(float(Math.sqrt(9.81 * Math.PI * 2) * Math.sqrt(scale)).div(this.wavelength.sqrt())).mul(this.dispersion))
        const layerAmplitude = enabled.select(this.amplitude.div(scale), 0)
        waveHeight.addAssign(sin(phase).mul(layerAmplitude))
        slopeX.addAssign(cos(phase).mul(layerAmplitude).mul(waveNumber).mul(direction.x))
        slopeZ.addAssign(cos(phase).mul(layerAmplitude).mul(waveNumber).mul(direction.y))
      }
      return vec3(waveHeight, slopeX, slopeZ)
    })
    const wave = sampleWaves(local)
    const shoreDistance = abs(texture(this.options.field.shoreSdf, fieldUv).r)
    const shallowGain = clamp(float(1).add(float(8).sub(texture(this.options.field.bedHeight, fieldUv).r.negate()).mul(0.035)), 1, 1.8)
    const ripplePhase = local.x.mul(mix(1.7, 0.72, this.rippleAnisotropy))
      .add(local.z.mul(mix(1.23, 2.05, this.rippleAnisotropy)))
      .mul(this.rippleScale)
      .add(this.time.mul(3))
    const rippleWave = sin(ripplePhase)
    const biasedRipple = mix(rippleWave, rippleWave.mul(abs(rippleWave)), this.rippleBias)
    const ripples = biasedRipple.mul(this.ripple)
      .mul(clamp(shoreDistance.div(24), 0, 1))
    const stateX = uint(clamp(fieldUv.x, 0, 0.999999).mul(this.options.solver.width))
    const stateY = uint(clamp(fieldUv.y, 0, 0.999999).mul(this.options.solver.height))
    const state = this.options.solver.state.element(stateY.mul(uint(this.options.solver.width)).add(stateX))
    const terrainDepth = this.seaLevel.sub(texture(this.options.field.bedHeight, fieldUv).r)
    const shallowWeight = clamp(float(1).sub(terrainDepth.div(this.handoverDepth)), 0, 1)
    const limitedShoreResponse = clamp(
      texture(this.options.field.bedHeight, fieldUv).r.add(state.x).sub(this.seaLevel),
      -0.08,
      0.08
    )
    const height = this.seaLevel
      .add(wave.x.mul(shallowGain))
      .add(ripples)
      .add(limitedShoreResponse.mul(shallowWeight).mul(0.25))
    material.positionNode = vec3(
      local.x.add(wave.y.mul(this.choppiness).mul(0.08)),
      height,
      local.z.add(wave.z.mul(this.choppiness).mul(0.08))
    )
    material.normalNode = normalize(
      vec3(
        wave.y.negate().mul(0.24)
          .sub(cos(ripplePhase).mul(this.ripple).mul(this.rippleScale).mul(0.32)),
        1,
        wave.z.negate().mul(0.24)
          .sub(cos(ripplePhase).mul(this.ripple).mul(this.rippleScale).mul(0.22))
      )
        .add(normalLocal.mul(0.04))
    )

    const waterDepth = texture(this.options.field.bedHeight, fieldUv).r.negate().add(this.seaLevel)
    const depthFactor = clamp(waterDepth.div(14), 0, 1)
    const baseWater = mix(color(0x227f91), color(0x03273f), depthFactor)
    const nearShore = clamp(float(1).sub(shoreDistance.div(140)), 0, 1)
    const breakZone = clamp(float(1).sub(terrainDepth.div(1.75)), 0, 1)
    const crest = clamp(abs(wave.x).sub(this.amplitude.mul(0.88)).mul(4), 0, 1)
      .mul(this.sss).mul(this.foamAmount).mul(nearShore).mul(breakZone)
    const seawardDistance = max(texture(this.options.field.shoreSdf, fieldUv).r.negate(), 0)
    const breakerOffset = sin(local.z.mul(0.025).sub(this.time.mul(0.8)))
      .mul(3).add(10).add(wave.x.mul(this.lean).mul(4))
    const breakerBand = clamp(float(1).sub(abs(seawardDistance.sub(breakerOffset)).div(7)), 0, 1)
      .mul(breakZone).mul(this.foamAmount)
    const foamDetail = sin(local.x.mul(0.31).add(local.z.mul(0.27)).add(this.time.mul(1.4)))
      .mul(sin(local.x.mul(0.13).sub(local.z.mul(0.37)).sub(this.time)))
      .mul(0.22).add(0.78)
    const foam = clamp(
      state.w.mul(this.foamScale).mul(nearShore).mul(0.06)
        .add(crest.mul(shallowGain))
        .add(breakerBand.mul(foamDetail)),
      0,
      1
    )
    const fresnel = clamp(float(1).sub(abs(normalView.dot(positionViewDirection))), 0, 1).pow(3)
    const reflectedWater = mix(baseWater, color(0x8bbdce), fresnel.mul(0.38))
    const visualColor = mix(reflectedWater, color(0xeaf4ef), foam)
    const heightDebug = mix(color(0x10355a), color(0xffd166), clamp(texture(this.options.field.height, fieldUv).r.add(8).div(56), 0, 1))
    const landDebug = texture(this.options.field.landMask, fieldUv).r.greaterThan(0.5)
      .select(color(0xd9a441), color(0x126fa3))
    const sdfDebug = mix(color(0x1676ae), color(0xe6ad46), clamp(texture(this.options.field.shoreSdf, fieldUv).r.div(100).add(0.5), 0, 1))
    const depthDebug = mix(color(0xe7d7a3), color(0x052e5c), depthFactor)
    const velocityDebug = mix(
      color(0x11233b),
      color(0xff4d6d),
      clamp(abs(state.y).add(abs(state.z)).div(max(state.x, 0.01)).div(5), 0, 1)
    )
    const foamDebug = mix(color(0x122333), color(0xffffff), clamp(state.w, 0, 1))
    const revisionDebug = mix(
      color(0x4338ca),
      color(0x22d3a7),
      sin(this.fieldRevision.mul(0.7)).mul(0.5).add(0.5)
    )
    const timingDebug = mix(
      color(0x22c55e),
      color(0xef4444),
      clamp(this.workerMilliseconds.div(350), 0, 1)
    )
    const debugColor = this.debugMode.equal(1).select(heightDebug,
      this.debugMode.equal(2).select(landDebug,
        this.debugMode.equal(3).select(sdfDebug,
          this.debugMode.equal(4).select(depthDebug,
            this.debugMode.equal(5).select(velocityDebug,
              this.debugMode.equal(6).select(foamDebug,
                this.debugMode.equal(7).select(revisionDebug, timingDebug)))))))
    const noise = sin(local.x.mul(0.19).add(this.time))
      .mul(sin(local.z.mul(0.23).sub(this.time.mul(0.7))))
      .mul(0.5).add(0.5)
    const storageLifetimeSentinel = this.options.solver.storageNodes[1].element(0).x
      .add(this.options.solver.storageNodes[2].element(0).x).mul(0)
    material.colorNode = this.noiseView.greaterThan(0.5).select(
      mix(color(0x07111b), color(0xd8fbff), noise),
      this.debugMode.greaterThan(0.5).select(debugColor, visualColor)
    ).add(storageLifetimeSentinel)
    material.roughnessNode = mix(float(0.12), float(0.42), foam)
    return material
  }

  private createSeabedMaterial() {
    const material = new MeshStandardNodeMaterial({
      color: 0xd2b27c,
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide
    })
    const extent = RIYUE_BAY_PRESET.extent
    const fieldUv = vec2(
      positionLocal.x.sub(extent.crossShoreMin).div(extent.crossShoreMax - extent.crossShoreMin),
      positionLocal.z.sub(extent.alongshoreMin).div(extent.alongshoreMax - extent.alongshoreMin)
    )
    const valid = texture(this.options.field.validity, fieldUv).r.greaterThan(0.5)
    const water = texture(this.options.field.landMask, fieldUv).r.lessThan(0.5)
    material.maskNode = valid.and(water)
    const bed = texture(this.options.field.bedHeight, fieldUv).r
    material.positionNode = vec3(positionLocal.x, bed, positionLocal.z)
    const causticPattern = sin(positionLocal.x.mul(0.16).add(this.time.mul(1.7)))
      .mul(sin(positionLocal.z.mul(0.19).sub(this.time.mul(1.2))))
      .abs().pow(5).mul(this.caustics)
    material.colorNode = mix(color(0xb99662), color(0xffe7a6), clamp(causticPattern.mul(0.35), 0, 1))
    return material
  }
}

function debugModeIndex(field: OceanParameters['debugField']) {
  return {
    none: 0,
    height: 1,
    landMask: 2,
    sdf: 3,
    depth: 4,
    velocity: 5,
    foam: 6,
    revision: 7,
    timing: 8
  }[field]
}
