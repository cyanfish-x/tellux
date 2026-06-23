import * as THREE from 'three'
import {
  CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
  CLOUD_SHAPE_TEXTURE_SIZE,
  CloudsEffect,
  type CloudsEffectChangeEvent,
  DEFAULT_LOCAL_WEATHER_URL,
  DEFAULT_SHAPE_DETAIL_URL,
  DEFAULT_SHAPE_URL,
  DEFAULT_TURBULENCE_URL
} from '@takram/three-clouds'
import {
  AerialPerspectiveEffect,
  DEFAULT_STARS_DATA_URL,
  PrecomputedTexturesGenerator,
  SkyLightProbe,
  StarsGeometry,
  StarsMaterial,
  SunDirectionalLight,
  getECIToECEFRotationMatrix,
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import { DEFAULT_STBN_URL } from '@takram/three-geospatial'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { getTelluxAssetUrl } from '../config'
import { disposeObject } from '../models/disposeObject'
import { AtmosphereTextureLoader } from './AtmosphereTextureLoader'
import {
  CLOUDS_DAY_LIGHT_FACTOR_UNIFORM,
  CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM,
  CLOUDS_NIGHT_COLOR_UNIFORM,
  CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM,
  CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM,
  INSCATTER_HORIZON_BLEND_UNIFORM,
  INSCATTER_HORIZON_RANGE_UNIFORM,
  INSCATTER_INTENSITY_UNIFORM,
  POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM,
  POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM,
  POST_PROCESS_NIGHT_COLOR_UNIFORM,
  POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM,
  POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM,
  POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM,
  STARS_DAY_LIGHT_FACTOR_UNIFORM,
  getCloudsMaterialUniform,
  getEffectUniform,
  getStarsMaterialUniform,
  patchAerialPerspectiveShader,
  patchCloudsNightLighting,
  patchStarsRendering
} from './AtmosphereShaderPatches'
import type {
  AtmosphereNightRuntimeState,
  AtmosphereRuntimeState,
  CloudRuntimeState
} from './AtmosphereRuntimeState'
import type { AtmosphereLightingMode } from '../types'

interface AtmosphereUniformValue {
  solar_irradiance: THREE.Vector3
  rayleigh_scattering: THREE.Vector3
  mie_scattering: THREE.Vector3
  mie_extinction: THREE.Vector3
  mie_phase_function_g: number
  absorption_extinction: THREE.Vector3
  ground_albedo: THREE.Color
}

const CLOUD_COMPOSITION_PROPERTIES = new Set(['atmosphereOverlay', 'atmosphereShadow', 'atmosphereShadowLength'])
const DEFAULT_NIGHT_TRANSITION_RANGE: [number, number] = [-0.08, 0.05]
const MOON_HORIZON_TRANSITION_RANGE: [number, number] = [0, 0.08]
const NIGHT_SKY_ALTITUDE_FADE_START = 80000
const NIGHT_SKY_ALTITUDE_FADE_END = 600000
const NIGHT_SKY_AMBIENT_SCALE = 0.07
const NIGHT_SKY_MOON_SCALE = 0.02
const NIGHT_SKY_MOON_GLOW_SCALE = 0.45
const NIGHT_CLOUD_AMBIENT_SCALE = 0.8
const NIGHT_CLOUD_MOON_SCALE = 1.8
const NIGHT_STARS_INTENSITY_BOOST = 2.5
const MATERIAL_ENVIRONMENT_INTENSITY = 1.35
const POST_PROCESS_MATERIAL_NIGHT_MOON_BOOST = 2.2
const POST_PROCESS_MATERIAL_NIGHT_AMBIENT_BOOST = 4
const STARS_ALTITUDE_FADE_START = 80000
const STARS_ALTITUDE_FADE_END = 600000
const DEFAULT_NIGHT_RUNTIME_STATE: AtmosphereNightRuntimeState = {
  enabled: true,
  moonLight: true,
  ambientLight: true,
  color: 0x9bbcff,
  moonLightIntensity: 0.18,
  ambientIntensity: 0.08,
  useMoonPhase: true,
  transitionRange: DEFAULT_NIGHT_TRANSITION_RANGE
}
const DEFAULT_CLOUD_COVERAGE = 0.3
const DEFAULT_CLOUD_SPEED = 0.001
const CLOUD_LAYER_OFFSETS = [0, 250]
const CLOUD_LAYER_HEIGHT_SCALES = [1, 1200 / 650]

export class AtmosphereManager {
  readonly aerialPerspectiveEffect: AerialPerspectiveEffect
  readonly cloudsEffect: CloudsEffect
  readonly stars: THREE.Points<THREE.BufferGeometry, StarsMaterial>
  readonly starsMaterial: StarsMaterial
  readonly sunLightSource: SunDirectionalLight
  readonly skyLightSource: SkyLightProbe
  readonly moonLightSource: SunDirectionalLight
  readonly nightAmbientLightSource: THREE.AmbientLight

  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private readonly materialEnvironmentGenerator: THREE.PMREMGenerator
  private readonly materialEnvironmentTarget: THREE.WebGLRenderTarget
  private readonly materialEnvironment: THREE.Texture
  private readonly textureLoader = new AtmosphereTextureLoader()
  private readonly inertialToECEFMatrix = new THREE.Matrix4()
  private readonly baseSolarIrradiance = new THREE.Vector3()
  private readonly baseRayleighScattering = new THREE.Vector3()
  private readonly baseMieScattering = new THREE.Vector3()
  private readonly baseMieExtinction = new THREE.Vector3()
  private readonly baseAbsorptionExtinction = new THREE.Vector3()
  private readonly lightPosition = new THREE.Vector3()
  private readonly sunDirection = new THREE.Vector3()
  private readonly moonDirection = new THREE.Vector3()
  private readonly cameraPositionECEF = new THREE.Vector3()
  private readonly cameraSurfaceNormal = new THREE.Vector3()
  private readonly nightColor = new THREE.Color(DEFAULT_NIGHT_RUNTIME_STATE.color)
  private baseStarsIntensity = 1
  private skyMoonVisible = true
  private nightState: AtmosphereNightRuntimeState = {
    ...DEFAULT_NIGHT_RUNTIME_STATE,
    transitionRange: [...DEFAULT_NIGHT_RUNTIME_STATE.transitionRange]
  }
  private currentLightingMode: AtmosphereLightingMode = 'post-process'
  private currentSunLight = true
  private currentSkyLight = true
  private isUsingPostProcessLighting = false
  private isUsingLightSourceLighting = false
  private isUsingMaterialLightSources = false
  private usePostProcessMaterialLights = false
  private lightSourceScene: THREE.Scene | null = null
  private previousEnvironmentIntensity: number | null = null
  private isDisposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onCompositionChange: () => void
  ) {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.camera)
    this.aerialPerspectiveEffect.sky = true
    patchAerialPerspectiveShader(this.aerialPerspectiveEffect, this.nightColor)
    this.captureAtmosphereDefaults()

    this.starsMaterial = new StarsMaterial()
    patchStarsRendering(this.starsMaterial)
    this.stars = new THREE.Points(new THREE.BufferGeometry(), this.starsMaterial)
    this.stars.frustumCulled = false

    this.sunLightSource = new SunDirectionalLight()
    this.sunLightSource.visible = false
    this.skyLightSource = new SkyLightProbe()
    this.skyLightSource.visible = false
    this.moonLightSource = new SunDirectionalLight()
    this.moonLightSource.visible = false
    this.moonLightSource.color.copy(this.nightColor)
    this.nightAmbientLightSource = new THREE.AmbientLight(this.nightColor, 0)
    this.nightAmbientLightSource.visible = false

    this.cloudsEffect = new CloudsEffect(this.camera)
    patchCloudsNightLighting(this.cloudsEffect, this.nightColor)
    this.cloudsEffect.localWeatherVelocity.set(DEFAULT_CLOUD_SPEED, 0)
    this.cloudsEffect.shadow.farScale = 0.25
    this.cloudsEffect.shadow.maxFar = 1e5
    this.cloudsEffect.shadow.cascadeCount = 2
    this.cloudsEffect.shadow.mapSize.set(512, 512)
    this.cloudsEffect.shadow.splitMode = 'practical'
    this.cloudsEffect.shadow.splitLambda = 0.71
    this.cloudsEffect.events.addEventListener('change', this.handleCloudsChange)

    this.texturesGenerator = new PrecomputedTexturesGenerator(renderer)
    this.materialEnvironmentGenerator = new THREE.PMREMGenerator(renderer)
    const materialEnvironmentScene = new RoomEnvironment()
    this.materialEnvironmentTarget = this.materialEnvironmentGenerator.fromScene(materialEnvironmentScene, 0.04)
    this.materialEnvironment = this.materialEnvironmentTarget.texture
    disposeObject(materialEnvironmentScene)
  }

  addLightSourcesTo(scene: THREE.Scene) {
    if (this.lightSourceScene === scene) return

    this.removeLightSourcesFromScene()
    this.lightSourceScene = scene
    scene.add(this.sunLightSource)
    scene.add(this.sunLightSource.target)
    scene.add(this.skyLightSource)
    scene.add(this.moonLightSource)
    scene.add(this.moonLightSource.target)
    scene.add(this.nightAmbientLightSource)
    scene.add(this.stars)
  }

  syncCloudAtmosphereComposition(cloudsVisible: boolean, atmosphereVisible: boolean) {
    if (!cloudsVisible || !atmosphereVisible) {
      this.aerialPerspectiveEffect.overlay = null
      this.aerialPerspectiveEffect.shadow = null
      this.aerialPerspectiveEffect.shadowLength = null
      return
    }

    this.aerialPerspectiveEffect.overlay = this.cloudsEffect.atmosphereOverlay
    this.aerialPerspectiveEffect.shadow = this.cloudsEffect.atmosphereShadow
    this.aerialPerspectiveEffect.shadowLength = this.cloudsEffect.atmosphereShadowLength
  }

  setPostProcessMaterialLights(enabled: boolean) {
    if (this.usePostProcessMaterialLights === enabled) return

    this.usePostProcessMaterialLights = enabled
    this.syncMaterialEnvironment()
    this.syncLightSourceVisibility()
    this.updateNightLights()
  }

  updateSunDirection(currentTime: Date) {
    const sunDirection = this.sunDirection
    const moonDirection = this.moonDirection
    getSunDirectionECEF(currentTime, sunDirection)
    getMoonDirectionECEF(currentTime, moonDirection)
    this.aerialPerspectiveEffect.sunDirection.copy(sunDirection)
    this.aerialPerspectiveEffect.moonDirection.copy(moonDirection)
    this.cloudsEffect.sunDirection.copy(sunDirection)
    this.starsMaterial.sunDirection.copy(sunDirection)
    this.stars.setRotationFromMatrix(getECIToECEFRotationMatrix(currentTime, this.inertialToECEFMatrix))
    this.sunLightSource.sunDirection.copy(sunDirection)
    this.skyLightSource.sunDirection.copy(sunDirection)
    this.moonLightSource.sunDirection.copy(moonDirection)
    this.updateNightLights()
  }

  updateLightSources() {
    this.camera.getWorldPosition(this.lightPosition)
    this.sunLightSource.target.position.copy(this.lightPosition)
    this.moonLightSource.target.position.copy(this.lightPosition)
    this.skyLightSource.position.copy(this.lightPosition)
    this.sunLightSource.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.moonLightSource.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.skyLightSource.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.starsMaterial.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.sunLightSource.target.updateMatrixWorld(true)
    this.moonLightSource.target.updateMatrixWorld(true)
    this.skyLightSource.updateMatrixWorld(true)
    this.sunLightSource.update()
    this.skyLightSource.update()
    this.updateNightLights()
  }

  applyAtmosphereState(state: AtmosphereRuntimeState) {
    this.setInscatterIntensity(state.inscatterIntensity)
    this.setInscatterHorizonBlend(state.inscatterHorizonBlend)
    this.setInscatterHorizonRange(state.inscatterHorizonRange)
    this.aerialPerspectiveEffect.correctAltitude = state.correctAltitude
    this.sunLightSource.correctAltitude = state.correctAltitude
    this.moonLightSource.correctAltitude = state.correctAltitude
    this.skyLightSource.correctAltitude = state.correctAltitude
    this.aerialPerspectiveEffect.correctGeometricError = state.correctGeometricError
    this.aerialPerspectiveEffect.transmittance = state.transmittance
    this.aerialPerspectiveEffect.inscatter = state.inscatter
    this.applyLightingMode(state.lightingMode, state.sunLight, state.skyLight)
    this.sunLightSource.intensity = Math.max(0, this.toFinite(state.sunLightIntensity, 1))
    this.skyLightSource.intensity = Math.max(0, this.toFinite(state.skyLightIntensity, 1))
    this.aerialPerspectiveEffect.sun = state.sun
    this.aerialPerspectiveEffect.moon = state.moon
    this.skyMoonVisible = state.moon
    this.aerialPerspectiveEffect.ground = state.ground
    this.aerialPerspectiveEffect.albedoScale = this.toFinite(state.albedoScale, 1)
    this.aerialPerspectiveEffect.sunAngularRadius = THREE.MathUtils.clamp(
      this.toFinite(state.sunAngularRadius, 0.004675),
      0,
      0.1
    )
    this.aerialPerspectiveEffect.moonAngularRadius = THREE.MathUtils.clamp(
      this.toFinite(state.moonAngularRadius, 0.0045),
      0,
      0.1
    )
    this.aerialPerspectiveEffect.lunarRadianceScale = Math.max(0, this.toFinite(state.lunarRadianceScale, 1))
    this.aerialPerspectiveEffect.shadowRadius = Math.max(0, this.toFinite(state.shadowRadius, 3))
    this.aerialPerspectiveEffect.shadowSampleCount = Math.round(
      THREE.MathUtils.clamp(this.toFinite(state.shadowSampleCount, 8), 1, 16)
    )
    this.stars.visible = state.starsVisible
    this.baseStarsIntensity = Math.max(0, this.toFinite(state.starsIntensity, 1))
    this.starsMaterial.intensity = this.baseStarsIntensity
    this.starsMaterial.pointSize = Math.max(0, this.toFinite(state.starsPointSize, 1))
    this.setVectorScale('solar_irradiance', this.baseSolarIrradiance, state.solarIrradianceScale)
    this.setVectorScale('rayleigh_scattering', this.baseRayleighScattering, state.rayleighScatteringScale)
    this.setVectorScale('mie_scattering', this.baseMieScattering, state.mieScatteringScale)
    this.setVectorScale('mie_extinction', this.baseMieExtinction, state.mieExtinctionScale)
    this.getAtmosphereUniform().mie_phase_function_g = THREE.MathUtils.clamp(
      this.toFinite(state.miePhaseFunctionG, 0.8),
      -0.99,
      0.99
    )
    this.setVectorScale('absorption_extinction', this.baseAbsorptionExtinction, state.absorptionExtinctionScale)
    this.getAtmosphereUniform().ground_albedo.setScalar(
      THREE.MathUtils.clamp(this.toFinite(state.groundAlbedo, 0.1), 0, 1)
    )
    this.applyNightState(state.night)
  }

  applyCloudsState(state: CloudRuntimeState) {
    if (state.quality !== undefined) {
      this.cloudsEffect.qualityPreset = state.quality
    }
    this.cloudsEffect.lightShafts = state.lightShafts
    this.cloudsEffect.coverage = this.toFinite(state.coverage, DEFAULT_CLOUD_COVERAGE)
    this.cloudsEffect.localWeatherVelocity.set(Math.max(0, this.toFinite(state.speed, DEFAULT_CLOUD_SPEED)), 0)

    CLOUD_LAYER_OFFSETS.forEach((offset, index) => {
      const layer = this.cloudsEffect.cloudLayers[index]
      if (!layer) return

      layer.altitude = this.toFinite(state.layerAltitude, 1500) + offset
      layer.height = this.toFinite(state.layerHeight, 650) * CLOUD_LAYER_HEIGHT_SCALES[index]
    })
  }

  async loadTextures() {
    try {
      const textures = await this.texturesGenerator.update()
      if (this.isDisposed) return

      Object.assign(this.aerialPerspectiveEffect, textures)
      Object.assign(this.cloudsEffect, textures)
      Object.assign(this.starsMaterial, textures)
      this.sunLightSource.transmittanceTexture = textures.transmittanceTexture
      this.moonLightSource.transmittanceTexture = textures.transmittanceTexture
      this.skyLightSource.irradianceTexture = textures.irradianceTexture

      this.loadStarsData(getTelluxAssetUrl(DEFAULT_STARS_DATA_URL))
      this.textureLoader.loadCloudTexture(getTelluxAssetUrl(DEFAULT_LOCAL_WEATHER_URL), (texture) => {
        this.cloudsEffect.localWeatherTexture = texture
      })
      this.textureLoader.loadCloudTexture(getTelluxAssetUrl(DEFAULT_TURBULENCE_URL), (texture) => {
        this.cloudsEffect.turbulenceTexture = texture
      })
      this.textureLoader.loadData3DTexture(
        getTelluxAssetUrl(DEFAULT_SHAPE_URL),
        CLOUD_SHAPE_TEXTURE_SIZE,
        (texture) => {
          this.cloudsEffect.shapeTexture = texture
        }
      )
      this.textureLoader.loadData3DTexture(
        getTelluxAssetUrl(DEFAULT_SHAPE_DETAIL_URL),
        CLOUD_SHAPE_DETAIL_TEXTURE_SIZE,
        (texture) => {
          this.cloudsEffect.shapeDetailTexture = texture
        }
      )
      this.loadSTBNTexture(getTelluxAssetUrl(DEFAULT_STBN_URL))
    } catch (error) {
      this.textureLoader.warnLoadFailure('precomputed atmosphere textures', error)
    }
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.textureLoader.dispose()
    this.cloudsEffect.events.removeEventListener('change', this.handleCloudsChange)
    this.clearMaterialEnvironment()
    this.removeLightSourcesFromScene()
    this.stars.geometry.dispose()
    this.starsMaterial.dispose()
    this.texturesGenerator.dispose({ textures: true })
    this.materialEnvironmentTarget.dispose()
    this.materialEnvironmentGenerator.dispose()
  }

  private applyLightingMode(mode: AtmosphereLightingMode, sunLight: boolean, skyLight: boolean) {
    this.currentLightingMode = mode
    this.currentSunLight = sunLight
    this.currentSkyLight = skyLight
    this.syncLightSourceVisibility()
    this.updateNightLights()
  }

  private syncLightSourceVisibility() {
    const usePostProcessLighting = this.currentLightingMode === 'post-process'
    this.isUsingPostProcessLighting = usePostProcessLighting
    this.isUsingLightSourceLighting = !usePostProcessLighting
    this.isUsingMaterialLightSources = !usePostProcessLighting || this.usePostProcessMaterialLights
    this.aerialPerspectiveEffect.sunLight = usePostProcessLighting && this.currentSunLight
    this.aerialPerspectiveEffect.skyLight = usePostProcessLighting && this.currentSkyLight
    this.sunLightSource.visible = this.isUsingMaterialLightSources && this.currentSunLight
    this.skyLightSource.visible = this.isUsingMaterialLightSources && this.currentSkyLight
  }

  private syncMaterialEnvironment() {
    if (!this.lightSourceScene) return

    if (!this.usePostProcessMaterialLights) {
      this.clearMaterialEnvironment()
      return
    }

    if (!this.lightSourceScene.environment) {
      this.lightSourceScene.environment = this.materialEnvironment
      this.previousEnvironmentIntensity = this.lightSourceScene.environmentIntensity
      this.lightSourceScene.environmentIntensity = MATERIAL_ENVIRONMENT_INTENSITY
    }
  }

  private clearMaterialEnvironment() {
    if (!this.lightSourceScene || this.lightSourceScene.environment !== this.materialEnvironment) return

    this.lightSourceScene.environment = null
    if (this.previousEnvironmentIntensity !== null) {
      this.lightSourceScene.environmentIntensity = this.previousEnvironmentIntensity
      this.previousEnvironmentIntensity = null
    }
  }

  private applyNightState(state: AtmosphereNightRuntimeState) {
    this.nightState = {
      ...state,
      transitionRange: [...state.transitionRange]
    }
    this.nightColor.set(state.color)
    this.moonLightSource.color.copy(this.nightColor)
    this.nightAmbientLightSource.color.copy(this.nightColor)
    this.setPostProcessNightColor(this.nightColor)
    this.setCloudsNightColor(this.nightColor)
    this.updateNightLights()
  }

  private updateNightLights() {
    const state = this.nightState
    const useNightLights = state.enabled && (this.isUsingLightSourceLighting || this.isUsingPostProcessLighting)
    const hasCameraPosition = this.updateCameraPositionECEF()
    const cameraHeight = hasCameraPosition ? this.getCameraHeightAboveEllipsoid() : 0
    const normal = useNightLights && hasCameraPosition ? this.getCameraSurfaceNormal() : null
    const nightFactor = normal ? this.getNightFactor(normal, state.transitionRange) : 0
    const moonFactor = normal ? this.getMoonVisibilityFactor(normal) * this.getMoonPhaseFactor(state) : 0
    const moonIntensity =
      useNightLights && state.moonLight
        ? Math.max(0, this.toFinite(state.moonLightIntensity, DEFAULT_NIGHT_RUNTIME_STATE.moonLightIntensity)) *
          nightFactor *
          moonFactor
        : 0
    const ambientIntensity =
      useNightLights && state.ambientLight
        ? Math.max(0, this.toFinite(state.ambientIntensity, DEFAULT_NIGHT_RUNTIME_STATE.ambientIntensity)) * nightFactor
        : 0

    const materialNightLightBoost =
      this.isUsingPostProcessLighting && this.usePostProcessMaterialLights
        ? POST_PROCESS_MATERIAL_NIGHT_MOON_BOOST
        : 1
    const materialNightAmbientBoost =
      this.isUsingPostProcessLighting && this.usePostProcessMaterialLights
        ? POST_PROCESS_MATERIAL_NIGHT_AMBIENT_BOOST
        : 1
    const lightSourceMoonIntensity = this.isUsingMaterialLightSources ? moonIntensity * materialNightLightBoost : 0
    const lightSourceAmbientIntensity = this.isUsingMaterialLightSources
      ? ambientIntensity * materialNightAmbientBoost
      : 0
    const postProcessMoonIntensity = this.isUsingPostProcessLighting ? moonIntensity : 0
    const postProcessAmbientIntensity = this.isUsingPostProcessLighting ? ambientIntensity : 0
    const nightSkyAltitudeFactor = normal ? this.getNightSkyAltitudeFactor(cameraHeight) : 0
    const starsAltitudeFactor = this.getStarsAltitudeFactor(cameraHeight)
    const starsVisibilityFactor = Math.max(starsAltitudeFactor, nightFactor)
    const nightSkyIntensity =
      (ambientIntensity * NIGHT_SKY_AMBIENT_SCALE + moonIntensity * NIGHT_SKY_MOON_SCALE) * nightSkyAltitudeFactor
    const nightSkyMoonGlowIntensity = this.skyMoonVisible
      ? moonIntensity * NIGHT_SKY_MOON_GLOW_SCALE * nightSkyAltitudeFactor
      : 0
    const nightCloudMoonIntensity = moonIntensity * NIGHT_CLOUD_MOON_SCALE
    const nightCloudAmbientIntensity = ambientIntensity * NIGHT_CLOUD_AMBIENT_SCALE
    const dayLightFactor = 1 - nightFactor

    this.moonLightSource.visible = lightSourceMoonIntensity > 0
    this.moonLightSource.intensity = lightSourceMoonIntensity
    this.updateMoonLightSource()
    this.nightAmbientLightSource.visible = lightSourceAmbientIntensity > 0
    this.nightAmbientLightSource.intensity = lightSourceAmbientIntensity
    this.setPostProcessNightLighting(postProcessMoonIntensity, postProcessAmbientIntensity)
    this.setPostProcessNightSkyLighting(nightSkyIntensity, nightSkyMoonGlowIntensity)
    this.setCloudsNightLighting(nightCloudMoonIntensity, nightCloudAmbientIntensity)
    this.setCloudsNightMoonDirection(this.moonDirection)
    this.setAtmosphereDayLightFactor(dayLightFactor)
    this.setCloudsDayLightFactor(dayLightFactor)
    this.setStarsDayLightFactor(dayLightFactor)
    this.starsMaterial.intensity =
      this.baseStarsIntensity * starsVisibilityFactor * (1 + nightFactor * NIGHT_STARS_INTENSITY_BOOST)
  }

  private updateMoonLightSource() {
    this.moonLightSource.color.setScalar(1)
    this.moonLightSource.update()
    this.moonLightSource.color.multiply(this.nightColor)
  }

  private updateCameraPositionECEF() {
    this.camera.getWorldPosition(this.lightPosition)
    this.cameraPositionECEF.copy(this.lightPosition).applyMatrix4(this.aerialPerspectiveEffect.worldToECEFMatrix)
    return this.cameraPositionECEF.lengthSq() !== 0
  }

  private getCameraSurfaceNormal() {
    return this.aerialPerspectiveEffect.ellipsoid.getSurfaceNormal(this.cameraPositionECEF, this.cameraSurfaceNormal)
  }

  private getNightFactor(surfaceNormal: THREE.Vector3, range: [number, number]) {
    const sunAltitude = surfaceNormal.dot(this.sunDirection)
    const [nightEnd, dayStart] = this.normalizeRange(range, DEFAULT_NIGHT_TRANSITION_RANGE)
    return 1 - THREE.MathUtils.smoothstep(sunAltitude, nightEnd, dayStart)
  }

  private getMoonVisibilityFactor(surfaceNormal: THREE.Vector3) {
    const moonAltitude = surfaceNormal.dot(this.moonDirection)
    const [start, end] = MOON_HORIZON_TRANSITION_RANGE
    return THREE.MathUtils.smoothstep(moonAltitude, start, end)
  }

  private getMoonPhaseFactor(state: AtmosphereNightRuntimeState) {
    if (!state.useMoonPhase) return 1

    return THREE.MathUtils.clamp((1 - this.sunDirection.dot(this.moonDirection)) * 0.5, 0, 1)
  }

  private getCameraHeightAboveEllipsoid() {
    return Math.max(0, this.cameraPositionECEF.length() - this.aerialPerspectiveEffect.ellipsoid.maximumRadius)
  }

  private getNightSkyAltitudeFactor(cameraHeight: number) {
    return 1 - THREE.MathUtils.smoothstep(cameraHeight, NIGHT_SKY_ALTITUDE_FADE_START, NIGHT_SKY_ALTITUDE_FADE_END)
  }

  private getStarsAltitudeFactor(cameraHeight: number) {
    return THREE.MathUtils.smoothstep(cameraHeight, STARS_ALTITUDE_FADE_START, STARS_ALTITUDE_FADE_END)
  }

  private normalizeRange(range: [number, number], fallback: [number, number]): [number, number] {
    const first = this.toFinite(range[0], fallback[0])
    const second = this.toFinite(range[1], fallback[1])
    const start = Math.min(first, second)
    const end = Math.max(first, second)
    return start === end ? [start, start + 1e-6] : [start, end]
  }

  private removeLightSourcesFromScene() {
    if (!this.lightSourceScene) return

    this.lightSourceScene.remove(this.sunLightSource)
    this.lightSourceScene.remove(this.sunLightSource.target)
    this.lightSourceScene.remove(this.skyLightSource)
    this.lightSourceScene.remove(this.moonLightSource)
    this.lightSourceScene.remove(this.moonLightSource.target)
    this.lightSourceScene.remove(this.nightAmbientLightSource)
    this.lightSourceScene.remove(this.stars)
    this.lightSourceScene = null
  }

  private readonly handleCloudsChange = (event: CloudsEffectChangeEvent) => {
    if (event.property && CLOUD_COMPOSITION_PROPERTIES.has(event.property)) {
      this.onCompositionChange()
    }
  }

  private captureAtmosphereDefaults() {
    const atmosphere = this.getAtmosphereUniform()
    this.baseSolarIrradiance.copy(atmosphere.solar_irradiance)
    this.baseRayleighScattering.copy(atmosphere.rayleigh_scattering)
    this.baseMieScattering.copy(atmosphere.mie_scattering)
    this.baseMieExtinction.copy(atmosphere.mie_extinction)
    this.baseAbsorptionExtinction.copy(atmosphere.absorption_extinction)
  }

  private getAtmosphereUniform() {
    return this.aerialPerspectiveEffect.uniforms.get('ATMOSPHERE').value as AtmosphereUniformValue
  }

  private setVectorScale(field: keyof Pick<
    AtmosphereUniformValue,
    'solar_irradiance' | 'rayleigh_scattering' | 'mie_scattering' | 'mie_extinction' | 'absorption_extinction'
  >, base: THREE.Vector3, value: number) {
    this.getAtmosphereUniform()[field].copy(base).multiplyScalar(Math.max(0, this.toFinite(value, 1)))
  }

  private toFinite(value: number, fallback: number) {
    return Number.isFinite(value) ? value : fallback
  }

  private setInscatterIntensity(value: number) {
    const uniform = this.getInscatterIntensityUniform()
    if (uniform) uniform.value = THREE.MathUtils.clamp(value, 0, 1)
  }

  private setInscatterHorizonBlend(value: boolean) {
    const uniform = this.getInscatterHorizonBlendUniform()
    if (uniform) uniform.value = value ? 1 : 0
  }

  private setInscatterHorizonRange(value: [number, number]) {
    const uniform = this.getInscatterHorizonRangeUniform()
    if (!uniform) return

    const start = THREE.MathUtils.clamp(Math.min(value[0], value[1]), 0, 1)
    const end = THREE.MathUtils.clamp(Math.max(value[0], value[1]), 0, 1)
    uniform.value.set(start, end)
  }




  private setPostProcessNightLighting(moonIntensity: number, ambientIntensity: number) {
    const moonUniform = this.getPostProcessNightMoonIntensityUniform()
    if (moonUniform) moonUniform.value = Math.max(0, this.toFinite(moonIntensity, 0))

    const ambientUniform = this.getPostProcessNightAmbientIntensityUniform()
    if (ambientUniform) ambientUniform.value = Math.max(0, this.toFinite(ambientIntensity, 0))
  }

  private setPostProcessNightSkyLighting(skyIntensity: number, moonGlowIntensity: number) {
    const skyUniform = this.getPostProcessNightSkyIntensityUniform()
    if (skyUniform) skyUniform.value = Math.max(0, this.toFinite(skyIntensity, 0))

    const moonGlowUniform = this.getPostProcessNightMoonGlowIntensityUniform()
    if (moonGlowUniform) moonGlowUniform.value = Math.max(0, this.toFinite(moonGlowIntensity, 0))
  }

  private setAtmosphereDayLightFactor(value: number) {
    const uniform = this.getPostProcessDayLightFactorUniform()
    if (uniform) uniform.value = THREE.MathUtils.clamp(this.toFinite(value, 1), 0, 1)
  }

  private setPostProcessNightColor(color: THREE.Color) {
    const uniform = this.getPostProcessNightColorUniform()
    if (uniform) uniform.value.copy(color)
  }

  private setCloudsNightLighting(moonIntensity: number, ambientIntensity: number) {
    const moonUniform = this.getCloudsNightMoonIntensityUniform()
    if (moonUniform) moonUniform.value = Math.max(0, this.toFinite(moonIntensity, 0))

    const ambientUniform = this.getCloudsNightAmbientIntensityUniform()
    if (ambientUniform) ambientUniform.value = Math.max(0, this.toFinite(ambientIntensity, 0))
  }

  private setCloudsNightColor(color: THREE.Color) {
    const uniform = this.getCloudsNightColorUniform()
    if (uniform) uniform.value.copy(color)
  }

  private setCloudsNightMoonDirection(direction: THREE.Vector3) {
    const uniform = this.getCloudsNightMoonDirectionUniform()
    if (uniform) uniform.value.copy(direction)
  }

  private setCloudsDayLightFactor(value: number) {
    const uniform = this.getCloudsDayLightFactorUniform()
    if (uniform) uniform.value = THREE.MathUtils.clamp(this.toFinite(value, 1), 0, 1)
  }

  private setStarsDayLightFactor(value: number) {
    const dayLightUniform = this.getStarsDayLightFactorUniform()
    if (dayLightUniform) dayLightUniform.value = THREE.MathUtils.clamp(this.toFinite(value, 1), 0, 1)
  }

  private getInscatterIntensityUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, INSCATTER_INTENSITY_UNIFORM)
  }

  private getInscatterHorizonBlendUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, INSCATTER_HORIZON_BLEND_UNIFORM)
  }

  private getInscatterHorizonRangeUniform(): THREE.Uniform<THREE.Vector2> | null {
    return getEffectUniform<THREE.Vector2>(this.aerialPerspectiveEffect, INSCATTER_HORIZON_RANGE_UNIFORM)
  }

  private getPostProcessNightMoonIntensityUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM)
  }

  private getPostProcessNightAmbientIntensityUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM)
  }

  private getPostProcessNightColorUniform(): THREE.Uniform<THREE.Color> | null {
    return getEffectUniform<THREE.Color>(this.aerialPerspectiveEffect, POST_PROCESS_NIGHT_COLOR_UNIFORM)
  }

  private getPostProcessNightSkyIntensityUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM)
  }

  private getPostProcessNightMoonGlowIntensityUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM)
  }

  private getPostProcessDayLightFactorUniform(): THREE.Uniform<number> | null {
    return getEffectUniform<number>(this.aerialPerspectiveEffect, POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM)
  }

  private getCloudsNightMoonIntensityUniform(): THREE.Uniform<number> | null {
    return (this.getCloudsMaterialUniform(CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM) ?? null) as
      | THREE.Uniform<number>
      | null
  }

  private getCloudsNightAmbientIntensityUniform(): THREE.Uniform<number> | null {
    return (this.getCloudsMaterialUniform(CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM) ?? null) as
      | THREE.Uniform<number>
      | null
  }

  private getCloudsNightColorUniform(): THREE.Uniform<THREE.Color> | null {
    return (this.getCloudsMaterialUniform(CLOUDS_NIGHT_COLOR_UNIFORM) ?? null) as THREE.Uniform<THREE.Color> | null
  }

  private getCloudsNightMoonDirectionUniform(): THREE.Uniform<THREE.Vector3> | null {
    return (this.getCloudsMaterialUniform(CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM) ?? null) as
      | THREE.Uniform<THREE.Vector3>
      | null
  }

  private getCloudsDayLightFactorUniform(): THREE.Uniform<number> | null {
    return (this.getCloudsMaterialUniform(CLOUDS_DAY_LIGHT_FACTOR_UNIFORM) ?? null) as THREE.Uniform<number> | null
  }

  private getCloudsMaterialUniform(name: string): THREE.Uniform | null {
    return getCloudsMaterialUniform(this.cloudsEffect, name)
  }

  private getStarsDayLightFactorUniform(): THREE.Uniform<number> | null {
    return (this.getStarsMaterialUniform(STARS_DAY_LIGHT_FACTOR_UNIFORM) ?? null) as THREE.Uniform<number> | null
  }

  private getStarsMaterialUniform(name: string): THREE.Uniform | null {
    return getStarsMaterialUniform(this.starsMaterial, name)
  }

  private loadSTBNTexture(url: string) {
    this.textureLoader.loadSTBNTexture(url, (texture) => {
      this.cloudsEffect.stbnTexture = texture
      this.aerialPerspectiveEffect.stbnTexture = texture
    })
  }

  private loadStarsData(url: string) {
    this.textureLoader.loadBuffer(url, (buffer) => {
      const previousGeometry = this.stars.geometry
      this.stars.geometry = new StarsGeometry(buffer)
      previousGeometry.dispose()
    })
  }
}

