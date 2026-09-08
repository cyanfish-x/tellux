import * as THREE from 'three'
import { context } from 'three/tsl'
import { type Node, type WebGPURenderer } from 'three/webgpu'
import {
  AerialPerspectiveNode,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  SkyNode,
  StarsNode,
  aerialPerspective,
  sky
} from '@takram/three-atmosphere/webgpu'
import {
  getECIToECEFRotationMatrix,
  getMoonFixedToECIRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import { Ellipsoid } from '@takram/three-geospatial'

import type { AtmosphereRuntimeState, CloudRuntimeState } from './AtmosphereRuntimeState'
import { getTelluxAssetUrl } from '../config'
import type { TelluxWebGPURenderer } from './RendererAdapter'
import { normalizeAtmosphereRuntimeState } from '../scene/SceneValueNormalization'
import type { AtmosphereLightingMode } from '../types'
import { AtmosphereTextureLoader } from './AtmosphereTextureLoader'
import { scaleSunLightIntensity } from './photometric'
import type { WebGPUPostProcessingGraph } from './WebGPUPostProcessingManager'

type WebGPUNode = Node
type AtmosphereParameterNodeInput<T> = {
  value?: T
  node?: AtmosphereParameterNodeInput<T>
}
type AtmosphereParameterNodeValues = Record<string, AtmosphereParameterNodeInput<unknown>>
type AtmosphereParametersNodeWithValues = {
  node?: {
    values?: AtmosphereParameterNodeValues
  }
}
type AerialPerspectiveNodeWithCompatibleSky = AerialPerspectiveNode & {
  skyNode?: WebGPUNode | null
}

type LightNodeLibrary = WebGPURenderer['library'] & {
  addLight?: (lightNodeClass: typeof AtmosphereLightNode, lightClass: typeof AtmosphereLight) => void
}

// WebGPU StarsNode consumes physical luminance, whereas Tellux exposes the
// existing display-space multiplier used by the WebGL StarsMaterial. Compensate
// for the atmosphere luminance normalization so intensity: 1 remains visible.
const WEBGPU_STARS_VISUAL_LUMINANCE = 10
const FALLBACK_WEBGPU_STARS_INTENSITY_SCALE = 800_000

const DEFAULT_NIGHT_TRANSITION_RANGE: [number, number] = [-0.08, 0.05]

export class WebGPUAtmosphereManager {
  readonly atmosphereContext = new AtmosphereContext()
  readonly sunLightSource = new AtmosphereLight(1, 'sun')
  readonly moonLightSource = new AtmosphereLight(1, 'moon')

  private readonly aerialPerspectiveNode: AerialPerspectiveNode
  private readonly skyNode: SkyNode
  private readonly outputNode: WebGPUNode
  private readonly baseSolarIrradiance = new THREE.Vector3()
  private readonly baseRayleighScattering = new THREE.Vector3()
  private readonly baseMieScattering = new THREE.Vector3()
  private readonly baseMieExtinction = new THREE.Vector3()
  private readonly baseAbsorptionExtinction = new THREE.Vector3()
  private readonly sunDirection = new THREE.Vector3()
  private readonly moonDirection = new THREE.Vector3()
  private readonly inertialToECEFMatrix = new THREE.Matrix4()
  private readonly moonFixedToECIMatrix = new THREE.Matrix4()
  private readonly cameraPosition = new THREE.Vector3()
  private readonly cameraSurfaceNormal = new THREE.Vector3()
  private readonly textureLoader = new AtmosphereTextureLoader()
  private lightSourceScene: THREE.Scene | null = null
  private currentShowAtmosphere = true
  private currentLightingMode: AtmosphereLightingMode = 'post-process'
  private currentSunLight = true
  private currentSkyLight = true
  private currentNightFactor = 0
  private currentNightTransitionRange: [number, number] = [...DEFAULT_NIGHT_TRANSITION_RANGE]
  private currentStarsVisible = true
  private currentStarsIntensity = FALLBACK_WEBGPU_STARS_INTENSITY_SCALE
  private currentStarsPointSize = 1
  private starsReady = false
  private isStarsLoading = false
  private isDisposed = false

  constructor(
    private readonly postProcessing: WebGPUPostProcessingGraph,
    private readonly renderer: TelluxWebGPURenderer,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.registerAtmosphereLightNode()

    this.atmosphereContext.camera = camera
    this.captureAtmosphereDefaults()
    const scenePass = this.postProcessing.scenePass
    scenePass.contextNode = this.createAtmosphereContextNode()
    this.skyNode = sky() as unknown as SkyNode
    // SkyNode creates its default StarsNode with an upstream URL. Keep it out
    // of the graph until Tellux has replaced it with the configured local asset.
    // Source: https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/packages/atmosphere/src/webgpu/SkyNode.ts
    this.skyNode.showStars = false
    this.aerialPerspectiveNode = aerialPerspective(
      scenePass,
      scenePass.getTextureNode('depth'),
      null
    )
    const aerialPerspectiveNode = this.aerialPerspectiveNode as AerialPerspectiveNodeWithCompatibleSky
    aerialPerspectiveNode.skyNode = this.skyNode as unknown as WebGPUNode
    this.outputNode = this.withAtmosphereContext(this.aerialPerspectiveNode)
    this.postProcessing.setSceneCompositor(this.outputNode)

    this.sunLightSource.visible = false
    this.moonLightSource.visible = false
  }

  addLightSourcesTo(scene: THREE.Scene) {
    if (this.lightSourceScene === scene) return

    this.removeLightSourcesFromScene()
    this.lightSourceScene = scene
    scene.add(this.sunLightSource)
    scene.add(this.sunLightSource.target)
    scene.add(this.moonLightSource)
    scene.add(this.moonLightSource.target)
  }

  applyAtmosphereState(state: AtmosphereRuntimeState) {
    state = normalizeAtmosphereRuntimeState(state)
    this.atmosphereContext.correctAltitude = state.correctAltitude
    this.atmosphereContext.showGround = state.ground
    this.aerialPerspectiveNode.correctGeometricError = state.correctGeometricError
    this.aerialPerspectiveNode.transmittance = state.transmittance
    this.aerialPerspectiveNode.inscattering = state.inscatter
    this.aerialPerspectiveNode.lighting = state.lightingMode === 'post-process'
    this.aerialPerspectiveNode.moonScattering = state.night.enabled && state.night.moonLight
    this.skyNode.showSun = state.sun
    this.skyNode.showMoon = state.moon
    this.skyNode.showStars = false
    this.skyNode.moonScattering = state.night.enabled && state.night.moonLight
    this.skyNode.sunNode.angularRadius.value = THREE.MathUtils.clamp(
      this.toFinite(state.sunAngularRadius, 0.004675),
      0,
      0.1
    )
    this.skyNode.moonNode.angularRadius.value = THREE.MathUtils.clamp(
      this.toFinite(state.moonAngularRadius, 0.0045),
      0,
      0.1
    )
    this.skyNode.moonNode.intensity.value = Math.max(0, this.toFinite(state.lunarRadianceScale, 1))
    this.currentStarsVisible = state.starsVisible
    this.currentStarsIntensity =
      Math.max(0, this.toFinite(state.starsIntensity, 1)) * this.getWebGPUStarsIntensityScale()
    this.currentStarsPointSize = Math.max(0, this.toFinite(state.starsPointSize, 1))
    this.syncStarsState()
    this.applyAtmosphereParameters(state)
    this.applyLightingMode(state.lightingMode, state.sunLight, state.skyLight)
    this.sunLightSource.intensity = Math.max(
      0,
      this.toFinite(scaleSunLightIntensity(state.sunLightIntensity, state.photometric), 1)
    )
    this.currentNightTransitionRange = [...state.night.transitionRange]
    this.moonLightSource.intensity = state.night.enabled && state.night.moonLight
      ? Math.max(0, this.toFinite(state.night.moonLightIntensity, 0.18))
      : 0
    this.markPipelineDirty()
  }

  applyCloudsState(_state: CloudRuntimeState) {}

  setAtmosphereVisible(visible: boolean) {
    if (this.currentShowAtmosphere === visible) return

    this.currentShowAtmosphere = visible
    this.syncLightSourceVisibility()
    this.postProcessing.setSceneCompositor(visible ? this.outputNode : null)
  }

  setPostProcessMaterialLights(_enabled: boolean) {}

  getNightFactor() {
    return this.currentNightFactor
  }

  /**
   * 设置 Three.js 世界到 ECEF 的变换。
   *
   * Sets the Three.js world-to-ECEF transform.
   */
  setWorldToECEFMatrix(matrix: THREE.Matrix4) {
    this.atmosphereContext.matrixWorldToECEF.value.copy(matrix)
  }

  loadTextures() {
    if (this.isDisposed || this.isStarsLoading || this.starsReady) return

    this.isStarsLoading = true
    this.textureLoader.loadBuffer(getTelluxAssetUrl('stars'), (buffer) => {
      if (this.isDisposed) return

      const previousStarsNode = this.skyNode.starsNode
      this.skyNode.starsNode = new StarsNode(buffer)
      previousStarsNode.dispose()
      this.starsReady = true
      this.isStarsLoading = false
      this.syncStarsState()
      this.markPipelineDirty()
    })
  }

  updateSunDirection(currentTime: Date) {
    getSunDirectionECEF(currentTime, this.sunDirection)
    getMoonDirectionECEF(currentTime, this.moonDirection)
    this.atmosphereContext.sunDirectionECEF.value.copy(this.sunDirection)
    this.atmosphereContext.moonDirectionECEF.value.copy(this.moonDirection)
    this.atmosphereContext.matrixECIToECEF.value.copy(
      getECIToECEFRotationMatrix(currentTime, this.inertialToECEFMatrix)
    )
    this.atmosphereContext.matrixMoonFixedToECEF.value.multiplyMatrices(
      this.atmosphereContext.matrixECIToECEF.value,
      getMoonFixedToECIRotationMatrix(currentTime, this.moonFixedToECIMatrix)
    )
    this.sunLightSource.target.position.set(0, 0, 0)
    this.moonLightSource.target.position.set(0, 0, 0)
  }

  updateLightSources() {
    this.camera.getWorldPosition(this.sunLightSource.target.position)
    this.moonLightSource.target.position.copy(this.sunLightSource.target.position)
    this.sunLightSource.target.updateMatrixWorld(true)
    this.moonLightSource.target.updateMatrixWorld(true)
    this.updateNightFactor()
  }

  private updateNightFactor() {
    this.camera.getWorldPosition(this.cameraPosition)
    this.cameraPosition.applyMatrix4(this.atmosphereContext.matrixWorldToECEF.value)
    if (this.cameraPosition.lengthSq() === 0) {
      this.currentNightFactor = 0
      return
    }

    Ellipsoid.WGS84.getSurfaceNormal(this.cameraPosition, this.cameraSurfaceNormal)
    const sunAltitude = this.cameraSurfaceNormal.dot(this.sunDirection)
    const nightEnd = Math.min(this.currentNightTransitionRange[0], this.currentNightTransitionRange[1])
    const dayStart = Math.max(this.currentNightTransitionRange[0], this.currentNightTransitionRange[1])
    this.currentNightFactor = 1 - THREE.MathUtils.smoothstep(sunAltitude, nightEnd, dayStart)
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.postProcessing.setSceneCompositor(null)
    this.removeLightSourcesFromScene()
    this.textureLoader.dispose()
    this.skyNode.starsNode.dispose()
    this.aerialPerspectiveNode.dispose()
    this.atmosphereContext.dispose()
  }

  private applyLightingMode(mode: AtmosphereLightingMode, sunLight: boolean, skyLight: boolean) {
    this.currentLightingMode = mode
    this.currentSunLight = sunLight
    this.currentSkyLight = skyLight
    this.syncLightSourceVisibility()
  }

  private syncLightSourceVisibility() {
    const useLightSources = this.currentShowAtmosphere && this.currentLightingMode === 'light-source'
    this.sunLightSource.visible = useLightSources && this.currentSunLight
    this.sunLightSource.direct.value = useLightSources && this.currentSunLight
    this.sunLightSource.indirect.value = useLightSources && this.currentSkyLight
    this.moonLightSource.visible = useLightSources && this.moonLightSource.intensity > 0
    this.moonLightSource.direct.value = useLightSources && this.moonLightSource.intensity > 0
    this.moonLightSource.indirect.value = false
  }

  private syncStarsState() {
    this.skyNode.starsNode.intensity.value = this.currentStarsIntensity
    this.skyNode.starsNode.pointSize.value = this.currentStarsPointSize
    this.skyNode.showStars = this.starsReady && this.currentStarsVisible
  }

  private getWebGPUStarsIntensityScale() {
    const luminanceScale = this.atmosphereContext.parameters.luminanceScale
    if (Number.isFinite(luminanceScale) && luminanceScale > 0) {
      return WEBGPU_STARS_VISUAL_LUMINANCE / luminanceScale
    }
    return FALLBACK_WEBGPU_STARS_INTENSITY_SCALE
  }

  private withAtmosphereContext(node: unknown): WebGPUNode {
    return context(node as WebGPUNode, this.createAtmosphereContext()) as WebGPUNode
  }

  private createAtmosphereContextNode(): WebGPUPostProcessingGraph['scenePass']['contextNode'] {
    return context(this.createAtmosphereContext()) as WebGPUPostProcessingGraph['scenePass']['contextNode']
  }

  private createAtmosphereContext() {
    return { getAtmosphere: () => this.atmosphereContext }
  }

  private markPipelineDirty() {
    this.postProcessing.invalidate()
  }

  private registerAtmosphereLightNode() {
    const library = this.renderer.library as LightNodeLibrary
    library.addLight?.(AtmosphereLightNode, AtmosphereLight)
  }

  private captureAtmosphereDefaults() {
    const { parameters } = this.atmosphereContext
    this.baseSolarIrradiance.copy(parameters.solarIrradiance)
    this.baseRayleighScattering.copy(parameters.rayleighScattering)
    this.baseMieScattering.copy(parameters.mieScattering)
    this.baseMieExtinction.copy(parameters.mieExtinction)
    this.baseAbsorptionExtinction.copy(parameters.absorptionExtinction)
  }

  private applyAtmosphereParameters(state: AtmosphereRuntimeState) {
    const { parameters } = this.atmosphereContext
    const sunAngularRadius = THREE.MathUtils.clamp(this.toFinite(state.sunAngularRadius, 0.004675), 0, 0.1)

    parameters.solarIrradiance
      .copy(this.baseSolarIrradiance)
      .multiplyScalar(Math.max(0, this.toFinite(state.solarIrradianceScale, 1)))
    parameters.sunAngularRadius = sunAngularRadius
    parameters.rayleighScattering
      .copy(this.baseRayleighScattering)
      .multiplyScalar(Math.max(0, this.toFinite(state.rayleighScatteringScale, 1)))
    parameters.mieScattering
      .copy(this.baseMieScattering)
      .multiplyScalar(Math.max(0, this.toFinite(state.mieScatteringScale, 1)))
    parameters.mieExtinction
      .copy(this.baseMieExtinction)
      .multiplyScalar(Math.max(0, this.toFinite(state.mieExtinctionScale, 1)))
    parameters.miePhaseFunctionG = THREE.MathUtils.clamp(
      this.toFinite(state.miePhaseFunctionG, 0.8),
      -0.99,
      0.99
    )
    parameters.absorptionExtinction
      .copy(this.baseAbsorptionExtinction)
      .multiplyScalar(Math.max(0, this.toFinite(state.absorptionExtinctionScale, 1)))
    parameters.groundAlbedo.setScalar(THREE.MathUtils.clamp(this.toFinite(state.groundAlbedo, 0.3), 0, 1))
    parameters.update()

    this.syncAtmosphereParameterNode('solarIrradiance', parameters.solarIrradiance)
    this.syncAtmosphereParameterNode('sunAngularRadius', parameters.sunAngularRadius)
    this.syncAtmosphereParameterNode('rayleighScattering', parameters.rayleighScattering)
    this.syncAtmosphereParameterNode('mieScattering', parameters.mieScattering)
    this.syncAtmosphereParameterNode('mieExtinction', parameters.mieExtinction)
    this.syncAtmosphereParameterNode('miePhaseFunctionG', parameters.miePhaseFunctionG)
    this.syncAtmosphereParameterNode('absorptionExtinction', parameters.absorptionExtinction)
    this.syncAtmosphereParameterNode('groundAlbedo', parameters.groundAlbedo)
    this.atmosphereContext.lutNode.needsUpdate = true
  }

  private syncAtmosphereParameterNode(name: string, value: number | THREE.Vector3) {
    const values = (this.atmosphereContext.parametersNode as AtmosphereParametersNodeWithValues).node?.values
    const input = values?.[name]
    if (!input) return

    this.writeAtmosphereParameterNodeInput(input, value)
  }

  private writeAtmosphereParameterNodeInput(
    input: AtmosphereParameterNodeInput<unknown>,
    value: number | THREE.Vector3
  ): boolean {
    if ('value' in input) {
      if (typeof value === 'number') {
        input.value = value
      } else if (this.isCopyableValue(input.value)) {
        input.value.copy(value)
      } else {
        input.value = value.clone()
      }
      this.markNodeInputDirty(input)
      return true
    }

    return input.node ? this.writeAtmosphereParameterNodeInput(input.node, value) : false
  }

  private isCopyableValue(value: unknown): value is THREE.Vector3 {
    return value instanceof THREE.Vector3
  }

  private markNodeInputDirty(input: AtmosphereParameterNodeInput<unknown>) {
    ;(input as { needsUpdate?: boolean }).needsUpdate = true
  }

  private removeLightSourcesFromScene() {
    if (!this.lightSourceScene) return

    this.lightSourceScene.remove(this.sunLightSource)
    this.lightSourceScene.remove(this.sunLightSource.target)
    this.lightSourceScene.remove(this.moonLightSource)
    this.lightSourceScene.remove(this.moonLightSource.target)
    this.lightSourceScene = null
  }

  private toFinite(value: number, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }
}
