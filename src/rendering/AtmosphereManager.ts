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
import { DEFAULT_STBN_URL, STBNLoader } from '@takram/three-geospatial'
import { getTelluxAssetUrl } from '../config'
import type { AtmosphereLightingMode } from '../types'

type TextureApplyCallback<T extends THREE.Texture> = (texture: T) => void

interface PatchableEffectShader {
  getFragmentShader(): string
  setFragmentShader(fragmentShader: string): void
  setChanged(): void
}

interface PatchableShaderMaterial {
  fragmentShader: string
  uniforms: Record<string, THREE.Uniform>
  needsUpdate: boolean
}

type DynamicUniforms = Map<string, THREE.Uniform>

interface AtmosphereUniformValue {
  solar_irradiance: THREE.Vector3
  rayleigh_scattering: THREE.Vector3
  mie_scattering: THREE.Vector3
  mie_extinction: THREE.Vector3
  mie_phase_function_g: number
  absorption_extinction: THREE.Vector3
  ground_albedo: THREE.Color
}

export interface AtmosphereNightRuntimeState {
  enabled: boolean
  moonLight: boolean
  ambientLight: boolean
  color: THREE.ColorRepresentation
  moonLightIntensity: number
  ambientIntensity: number
  useMoonPhase: boolean
  transitionRange: [number, number]
}

export interface AtmosphereRuntimeState {
  inscatterIntensity: number
  inscatterHorizonBlend: boolean
  inscatterHorizonRange: [number, number]
  correctAltitude: boolean
  correctGeometricError: boolean
  transmittance: boolean
  inscatter: boolean
  lightingMode: AtmosphereLightingMode
  sunLight: boolean
  skyLight: boolean
  sunLightIntensity: number
  skyLightIntensity: number
  night: AtmosphereNightRuntimeState
  sun: boolean
  moon: boolean
  ground: boolean
  albedoScale: number
  sunAngularRadius: number
  moonAngularRadius: number
  lunarRadianceScale: number
  shadowRadius: number
  shadowSampleCount: number
  starsVisible: boolean
  starsIntensity: number
  starsPointSize: number
  solarIrradianceScale: number
  rayleighScatteringScale: number
  mieScatteringScale: number
  mieExtinctionScale: number
  miePhaseFunctionG: number
  absorptionExtinctionScale: number
  groundAlbedo: number
}

const CLOUD_COMPOSITION_PROPERTIES = new Set(['atmosphereOverlay', 'atmosphereShadow', 'atmosphereShadowLength'])
const INSCATTER_INTENSITY_UNIFORM = 'telluxInscatterIntensity'
const INSCATTER_HORIZON_BLEND_UNIFORM = 'telluxInscatterHorizonBlend'
const INSCATTER_HORIZON_RANGE_UNIFORM = 'telluxInscatterHorizonRange'
const POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM = 'telluxPostProcessNightMoonIntensity'
const POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM = 'telluxPostProcessNightAmbientIntensity'
const POST_PROCESS_NIGHT_COLOR_UNIFORM = 'telluxPostProcessNightColor'
const POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM = 'telluxPostProcessNightSkyIntensity'
const POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM = 'telluxPostProcessNightMoonGlowIntensity'
const POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxPostProcessDayLightFactor'
const CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM = 'telluxCloudsNightMoonIntensity'
const CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM = 'telluxCloudsNightAmbientIntensity'
const CLOUDS_NIGHT_COLOR_UNIFORM = 'telluxCloudsNightColor'
const CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM = 'telluxCloudsNightMoonDirection'
const CLOUDS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxCloudsDayLightFactor'
const STARS_DAY_LIGHT_FACTOR_UNIFORM = 'telluxStarsDayLightFactor'
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

export class AtmosphereManager {
  readonly aerialPerspectiveEffect: AerialPerspectiveEffect
  readonly cloudsEffect: CloudsEffect
  readonly stars: THREE.Points<THREE.BufferGeometry, StarsMaterial>
  readonly starsMaterial: StarsMaterial
  readonly sunLightSource: SunDirectionalLight
  readonly skyLightSource: SkyLightProbe
  readonly moonLightSource: SunDirectionalLight
  readonly nightAmbientLightSource: THREE.AmbientLight

  private readonly loadedTextures: THREE.Texture[] = []
  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private readonly textureAbortController = new AbortController()
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
  private isUsingPostProcessLighting = false
  private isUsingLightSourceLighting = false
  private lightSourceScene: THREE.Scene | null = null
  private isDisposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onCompositionChange: () => void
  ) {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.camera)
    this.aerialPerspectiveEffect.sky = true
    this.patchAerialPerspectiveShader()
    this.captureAtmosphereDefaults()

    this.starsMaterial = new StarsMaterial()
    this.patchStarsRendering()
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
    this.patchCloudsNightLighting()
    this.cloudsEffect.localWeatherVelocity.set(0.001, 0)
    this.cloudsEffect.shadow.farScale = 0.25
    this.cloudsEffect.shadow.maxFar = 1e5
    this.cloudsEffect.shadow.cascadeCount = 2
    this.cloudsEffect.shadow.mapSize.set(512, 512)
    this.cloudsEffect.shadow.splitMode = 'practical'
    this.cloudsEffect.shadow.splitLambda = 0.71
    this.cloudsEffect.events.addEventListener('change', this.handleCloudsChange)

    this.texturesGenerator = new PrecomputedTexturesGenerator(renderer)
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
      this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_LOCAL_WEATHER_URL), (texture) => {
        this.cloudsEffect.localWeatherTexture = texture
      })
      this.loadCloudTexture(getTelluxAssetUrl(DEFAULT_TURBULENCE_URL), (texture) => {
        this.cloudsEffect.turbulenceTexture = texture
      })
      this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_URL), CLOUD_SHAPE_TEXTURE_SIZE, (texture) => {
        this.cloudsEffect.shapeTexture = texture
      })
      this.loadData3DTexture(getTelluxAssetUrl(DEFAULT_SHAPE_DETAIL_URL), CLOUD_SHAPE_DETAIL_TEXTURE_SIZE, (texture) => {
        this.cloudsEffect.shapeDetailTexture = texture
      })
      this.loadSTBNTexture(getTelluxAssetUrl(DEFAULT_STBN_URL))
    } catch (error) {
      this.warnTextureLoadFailure('precomputed atmosphere textures', error)
    }
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.textureAbortController.abort()
    this.cloudsEffect.events.removeEventListener('change', this.handleCloudsChange)
    this.removeLightSourcesFromScene()
    this.stars.geometry.dispose()
    this.starsMaterial.dispose()
    this.texturesGenerator.dispose({ textures: true })
    this.loadedTextures.forEach((texture) => texture.dispose())
  }

  private applyLightingMode(mode: AtmosphereLightingMode, sunLight: boolean, skyLight: boolean) {
    const usePostProcessLighting = mode === 'post-process'
    this.isUsingPostProcessLighting = usePostProcessLighting
    this.isUsingLightSourceLighting = !usePostProcessLighting
    this.aerialPerspectiveEffect.sunLight = usePostProcessLighting && sunLight
    this.aerialPerspectiveEffect.skyLight = usePostProcessLighting && skyLight
    this.sunLightSource.visible = !usePostProcessLighting && sunLight
    this.skyLightSource.visible = !usePostProcessLighting && skyLight
    this.updateNightLights()
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

    const lightSourceMoonIntensity = this.isUsingLightSourceLighting ? moonIntensity : 0
    const lightSourceAmbientIntensity = this.isUsingLightSourceLighting ? ambientIntensity : 0
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

  private patchStarsRendering() {
    const material = this.starsMaterial as unknown as PatchableShaderMaterial
    material.uniforms[STARS_DAY_LIGHT_FACTOR_UNIFORM] = new THREE.Uniform(1)

    if (material.fragmentShader.includes(STARS_DAY_LIGHT_FACTOR_UNIFORM)) return

    const withUniform = material.fragmentShader.replace(
      'uniform vec3 sunDirection;',
      [
        'uniform vec3 sunDirection;',
        `uniform float ${STARS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withUniform === material.fragmentShader) {
      console.warn('Tellux stars shader patch failed: uniform hook was not found.')
      material.needsUpdate = true
      return
    }

    const withPointMask = withUniform.replace(
      'in vec3 vColor;\n\nvoid main() {',
      [
        'in vec3 vColor;',
        '',
        'void main() {',
        '  vec2 telluxStarPoint = gl_PointCoord * 2.0 - 1.0;',
        '  float telluxStarPointRadius = dot(telluxStarPoint, telluxStarPoint);',
        '  if (telluxStarPointRadius > 1.0) {',
        '    discard;',
        '  }',
        '  float telluxStarSoftMask = 1.0 - smoothstep(0.18, 1.0, telluxStarPointRadius);',
        '  float telluxStarBrightness = max(max(vColor.r, vColor.g), vColor.b);',
        '  float telluxStarVisibility = smoothstep(0.006, 0.035, telluxStarBrightness);',
        '  if (telluxStarVisibility <= 0.0) {',
        '    discard;',
        '  }',
        '  vec3 telluxStarColor = vec3(1.0) * telluxStarSoftMask * (0.75 + 0.75 * telluxStarVisibility);'
      ].join('\n')
    )
    if (withPointMask === withUniform) {
      console.warn('Tellux stars shader patch failed: point mask hook was not found.')
      material.needsUpdate = true
      return
    }

    const withBackgroundStarColor = withPointMask.replace(
      '  radiance += transmittance * vColor;',
      [
        `  radiance *= ${STARS_DAY_LIGHT_FACTOR_UNIFORM};`,
        `  radiance += mix(vec3(1.0), transmittance, ${STARS_DAY_LIGHT_FACTOR_UNIFORM}) * telluxStarColor;`
      ].join('\n')
    )
    if (withBackgroundStarColor === withPointMask) {
      console.warn('Tellux stars shader patch failed: background color hook was not found.')
      material.needsUpdate = true
      return
    }

    const patchedShader = withBackgroundStarColor.replace(
      '  outputColor = vec4(vColor, 1.0);',
      '  outputColor = vec4(telluxStarColor, 1.0);'
    )

    material.fragmentShader = patchedShader
    material.needsUpdate = true
  }

  private patchAerialPerspectiveShader() {
    const effect = this.aerialPerspectiveEffect
    const uniforms = effect.uniforms as unknown as DynamicUniforms
    uniforms.set(INSCATTER_INTENSITY_UNIFORM, new THREE.Uniform(1))
    uniforms.set(INSCATTER_HORIZON_BLEND_UNIFORM, new THREE.Uniform(1))
    uniforms.set(INSCATTER_HORIZON_RANGE_UNIFORM, new THREE.Uniform(new THREE.Vector2(0, 0.6)))
    uniforms.set(POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM, new THREE.Uniform(0))
    uniforms.set(POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM, new THREE.Uniform(0))
    uniforms.set(POST_PROCESS_NIGHT_COLOR_UNIFORM, new THREE.Uniform(this.nightColor.clone()))
    uniforms.set(POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM, new THREE.Uniform(0))
    uniforms.set(POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM, new THREE.Uniform(0))
    uniforms.set(POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM, new THREE.Uniform(1))

    const shaderEffect = effect as unknown as PatchableEffectShader
    const fragmentShader = shaderEffect.getFragmentShader()
    if (fragmentShader.includes(INSCATTER_INTENSITY_UNIFORM)) return

    const withUniform = fragmentShader.replace(
      'uniform float albedoScale;',
      [
        'uniform float albedoScale;',
        `uniform float ${INSCATTER_INTENSITY_UNIFORM};`,
        `uniform float ${INSCATTER_HORIZON_BLEND_UNIFORM};`,
        `uniform vec2 ${INSCATTER_HORIZON_RANGE_UNIFORM};`,
        `uniform float ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM};`,
        `uniform float ${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM};`,
        `uniform vec3 ${POST_PROCESS_NIGHT_COLOR_UNIFORM};`,
        `uniform float ${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM};`,
        `uniform float ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM};`,
        `uniform float ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withUniform === fragmentShader) {
      console.warn('Tellux atmosphere shader patch failed: uniform hook was not found.')
      shaderEffect.setChanged()
      return
    }

    const withDaySky = withUniform.replace(
      '    outputColor.rgb = getSkyRadiance(\n      vCameraPosition,\n      rayDirection,\n      shadowLength,\n      sunDirection,\n      moonDirection,\n      moonAngularRadius,\n      lunarRadianceScale,\n      fragmentAngle\n    );',
      [
        '    outputColor.rgb = getSkyRadiance(',
        '      vCameraPosition,',
        '      rayDirection,',
        '      shadowLength,',
        '      sunDirection,',
        '      moonDirection,',
        '      moonAngularRadius,',
        '      lunarRadianceScale,',
        '      fragmentAngle',
        '    );',
        `    outputColor.rgb *= ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withDaySky === withUniform) {
      console.warn('Tellux atmosphere shader patch failed: day sky hook was not found.')
    }

    const shaderWithDaySky = withDaySky === withUniform ? withUniform : withDaySky
    const withNightSky = shaderWithDaySky.replace(
      '    outputColor.a = 1.0;\n    #else // SKY',
      [
        `    if (${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM} > 0.0 || ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} > 0.0) {`,
        '      vec3 telluxSkyNormal = normalize(vCameraPosition / vEllipsoidRadiiSquared);',
        '      float telluxRayUp = clamp(dot(rayDirection, telluxSkyNormal), 0.0, 1.0);',
        '      float telluxHorizonGlow = pow(1.0 - telluxRayUp, 1.7);',
        '      float telluxZenithGlow = pow(telluxRayUp, 0.35);',
        '      float telluxMoonViewDot = max(dot(rayDirection, moonDirection), 0.0);',
        '      float telluxMoonHalo = pow(telluxMoonViewDot, 64.0) * 0.55 + pow(telluxMoonViewDot, 512.0) * 2.2;',
        '      float telluxMoonDiscRadius = max(moonAngularRadius * 1.35, fragmentAngle);',
        '      float telluxMoonDisc = smoothstep(cos(telluxMoonDiscRadius + fragmentAngle), cos(max(0.0, moonAngularRadius - fragmentAngle)), telluxMoonViewDot);',
        `      vec3 telluxNightSkyRadiance = ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * ${POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM} * (0.18 + 0.62 * telluxHorizonGlow + 0.28 * telluxZenithGlow);`,
        `      telluxNightSkyRadiance += ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} * telluxMoonHalo;`,
        `      telluxNightSkyRadiance += vec3(1.0, 0.96, 0.86) * ${POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM} * telluxMoonDisc * 2.0;`,
        '      outputColor.rgb += telluxNightSkyRadiance;',
        '    }',
        '    outputColor.a = 1.0;',
        '    #else // SKY'
      ].join('\n')
    )
    if (withNightSky === shaderWithDaySky) {
      console.warn('Tellux atmosphere shader patch failed: night sky hook was not found.')
    }

    const shaderWithNightSky = withNightSky === shaderWithDaySky ? shaderWithDaySky : withNightSky
    const withPostProcessNightLighting = shaderWithNightSky.replace(
      '#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)\n\n  #if defined(TRANSMITTANCE) || defined(INSCATTER)',
      [
        '#endif // defined(SUN_LIGHT) || defined(SKY_LIGHT)',
        '',
        `  if (!degenerateNormal) {`,
        `    radiance *= ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`,
        `  }`,
        `  if (!degenerateNormal && (${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM} > 0.0 || ${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM} > 0.0)) {`,
        '    vec3 telluxNightDiffuse = inputColor.rgb * albedoScale * RECIPROCAL_PI;',
        '    float telluxNightMoonDiffuse = max(dot(normalize(normalECEF), moonDirection), 0.0);',
        `    vec3 telluxNightRadiance = telluxNightDiffuse * ${POST_PROCESS_NIGHT_COLOR_UNIFORM} * (${POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM} + ${POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM} * telluxNightMoonDiffuse);`,
        '    #ifdef HAS_LIGHTING_MASK',
        '    telluxNightRadiance *= texture(lightingMaskBuffer, uv).LIGHTING_MASK_CHANNEL_;',
        '    #endif // HAS_LIGHTING_MASK',
        '    radiance += telluxNightRadiance;',
        '  }',
        '',
        '  #if defined(TRANSMITTANCE) || defined(INSCATTER)'
      ].join('\n')
    )
    if (withPostProcessNightLighting === shaderWithNightSky) {
      console.warn('Tellux atmosphere shader patch failed: post-process night lighting hook was not found.')
    }

    const shaderWithNightLighting =
      withPostProcessNightLighting === shaderWithNightSky ? shaderWithNightSky : withPostProcessNightLighting
    const patchedShader = shaderWithNightLighting.replace(
      'radiance = radiance + inscatter;',
      [
        'vec3 telluxGlobeNormal = normalize(positionECEF / vEllipsoidRadiiSquared);',
        'float telluxViewNormalCos = clamp(dot(telluxGlobeNormal, normalize(vCameraPosition - positionECEF)), 0.0, 1.0);',
        `float telluxHorizonMask = 1.0 - smoothstep(${INSCATTER_HORIZON_RANGE_UNIFORM}.x, ${INSCATTER_HORIZON_RANGE_UNIFORM}.y, telluxViewNormalCos);`,
        `float telluxInscatterMask = mix(1.0, telluxHorizonMask, ${INSCATTER_HORIZON_BLEND_UNIFORM});`,
        `radiance = radiance + inscatter * ${INSCATTER_INTENSITY_UNIFORM} * telluxInscatterMask * ${POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n  ')
    )

    if (patchedShader === shaderWithNightLighting) {
      console.warn('Tellux atmosphere shader patch failed: inscatter intensity hook was not found.')
      shaderEffect.setChanged()
      return
    }

    shaderEffect.setFragmentShader(patchedShader)
  }

  private patchCloudsNightLighting() {
    const material = this.cloudsEffect.cloudsPass.currentMaterial as unknown as PatchableShaderMaterial
    material.uniforms[CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM] = new THREE.Uniform(0)
    material.uniforms[CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM] = new THREE.Uniform(0)
    material.uniforms[CLOUDS_NIGHT_COLOR_UNIFORM] = new THREE.Uniform(this.nightColor.clone())
    material.uniforms[CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM] = new THREE.Uniform(new THREE.Vector3())
    material.uniforms[CLOUDS_DAY_LIGHT_FACTOR_UNIFORM] = new THREE.Uniform(1)

    if (material.fragmentShader.includes(CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM)) return

    const withUniform = material.fragmentShader.replace(
      'uniform float powderExponent;',
      [
        'uniform float powderExponent;',
        `uniform float ${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM};`,
        `uniform float ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM};`,
        `uniform vec3 ${CLOUDS_NIGHT_COLOR_UNIFORM};`,
        `uniform vec3 ${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM};`,
        `uniform float ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withUniform === material.fragmentShader) {
      console.warn('Tellux clouds shader patch failed: uniform hook was not found.')
      material.needsUpdate = true
      return
    }

    const withGroundDayLight = withUniform.replace(
      '  vec3 skyIrradiance;\n  vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);',
      [
        '  vec3 skyIrradiance;',
        '  vec3 sunIrradiance = getGroundSunSkyIrradiance(position, surfaceNormal, height, skyIrradiance);',
        `  sunIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
        `  skyIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withGroundDayLight === withUniform) {
      console.warn('Tellux clouds shader patch failed: ground day lighting hook was not found.')
    }

    const shaderWithGroundDayLight =
      withGroundDayLight === withUniform ? withUniform : withGroundDayLight
    const withCloudDayLight = shaderWithGroundDayLight.replace(
      '      vec3 skyIrradiance;\n      vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);',
      [
        '      vec3 skyIrradiance;',
        '      vec3 sunIrradiance = getCloudsSunSkyIrradiance(position, height, skyIrradiance);',
        `      sunIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
        `      skyIrradiance *= ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withCloudDayLight === shaderWithGroundDayLight) {
      console.warn('Tellux clouds shader patch failed: cloud day lighting hook was not found.')
    }

    const shaderWithCloudDayLight =
      withCloudDayLight === shaderWithGroundDayLight ? shaderWithGroundDayLight : withCloudDayLight
    const withHazeDayLight = shaderWithCloudDayLight.replace(
      '  vec3 skyIrradiance = vGroundIrradiance.sky;\n  vec3 sunIrradiance = vGroundIrradiance.sun;',
      [
        `  vec3 skyIrradiance = vGroundIrradiance.sky * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`,
        `  vec3 sunIrradiance = vGroundIrradiance.sun * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
      ].join('\n')
    )
    if (withHazeDayLight === shaderWithCloudDayLight) {
      console.warn('Tellux clouds shader patch failed: haze day lighting hook was not found.')
    }

    const shaderWithHazeDayLight =
      withHazeDayLight === shaderWithCloudDayLight ? shaderWithCloudDayLight : withHazeDayLight
    const withAerialPerspectiveDayLight = shaderWithHazeDayLight.replace(
      '  color.rgb = color.rgb * transmittance + inscatter * color.a;',
      `  color.rgb = color.rgb * transmittance + inscatter * color.a * ${CLOUDS_DAY_LIGHT_FACTOR_UNIFORM};`
    )
    if (withAerialPerspectiveDayLight === shaderWithHazeDayLight) {
      console.warn('Tellux clouds shader patch failed: aerial perspective day lighting hook was not found.')
    }

    const shaderWithDayLighting =
      withAerialPerspectiveDayLight === shaderWithHazeDayLight ? shaderWithHazeDayLight : withAerialPerspectiveDayLight
    const patchedShader = shaderWithDayLighting.replace(
      'radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;',
      [
        'radiance += skyIrradiance * RECIPROCAL_PI4 * skyGradient * skyLightScale;',
        `if (${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM} > 0.0 || ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM} > 0.0) {`,
        `  float telluxCloudMoonDiffuse = max(dot(surfaceNormal, ${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM}), 0.0);`,
        `  float telluxCloudMoonPhase = approximateMultipleScattering(opticalDepth * 0.35, dot(${CLOUDS_NIGHT_MOON_DIRECTION_UNIFORM}, rayDirection));`,
        `  vec3 telluxCloudNightRadiance = ${CLOUDS_NIGHT_COLOR_UNIFORM} * ${CLOUDS_NIGHT_AMBIENT_INTENSITY_UNIFORM} * (0.35 + 0.85 * skyGradient);`,
        `  telluxCloudNightRadiance += ${CLOUDS_NIGHT_COLOR_UNIFORM} * ${CLOUDS_NIGHT_MOON_INTENSITY_UNIFORM} * (0.25 + 0.75 * telluxCloudMoonDiffuse) * telluxCloudMoonPhase;`,
        '  radiance += telluxCloudNightRadiance;',
        '}'
      ].join('\n      ')
    )
    if (patchedShader === shaderWithDayLighting) {
      console.warn('Tellux clouds shader patch failed: night lighting hook was not found.')
      material.needsUpdate = true
      return
    }

    material.fragmentShader = patchedShader
    material.needsUpdate = true
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
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(INSCATTER_INTENSITY_UNIFORM) ??
      null) as THREE.Uniform<number> | null
  }

  private getInscatterHorizonBlendUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(INSCATTER_HORIZON_BLEND_UNIFORM) ??
      null) as THREE.Uniform<number> | null
  }

  private getInscatterHorizonRangeUniform(): THREE.Uniform<THREE.Vector2> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(INSCATTER_HORIZON_RANGE_UNIFORM) ??
      null) as THREE.Uniform<THREE.Vector2> | null
  }

  private getPostProcessNightMoonIntensityUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(
      POST_PROCESS_NIGHT_MOON_INTENSITY_UNIFORM
    ) ?? null) as THREE.Uniform<number> | null
  }

  private getPostProcessNightAmbientIntensityUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(
      POST_PROCESS_NIGHT_AMBIENT_INTENSITY_UNIFORM
    ) ?? null) as THREE.Uniform<number> | null
  }

  private getPostProcessNightColorUniform(): THREE.Uniform<THREE.Color> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(POST_PROCESS_NIGHT_COLOR_UNIFORM) ??
      null) as THREE.Uniform<THREE.Color> | null
  }

  private getPostProcessNightSkyIntensityUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(
      POST_PROCESS_NIGHT_SKY_INTENSITY_UNIFORM
    ) ?? null) as THREE.Uniform<number> | null
  }

  private getPostProcessNightMoonGlowIntensityUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(
      POST_PROCESS_NIGHT_MOON_GLOW_INTENSITY_UNIFORM
    ) ?? null) as THREE.Uniform<number> | null
  }

  private getPostProcessDayLightFactorUniform(): THREE.Uniform<number> | null {
    return ((this.aerialPerspectiveEffect.uniforms as unknown as DynamicUniforms).get(
      POST_PROCESS_DAY_LIGHT_FACTOR_UNIFORM
    ) ?? null) as THREE.Uniform<number> | null
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
    const material = this.cloudsEffect.cloudsPass.currentMaterial as unknown as PatchableShaderMaterial
    return material.uniforms[name] ?? null
  }

  private getStarsDayLightFactorUniform(): THREE.Uniform<number> | null {
    return (this.getStarsMaterialUniform(STARS_DAY_LIGHT_FACTOR_UNIFORM) ?? null) as THREE.Uniform<number> | null
  }

  private getStarsMaterialUniform(name: string): THREE.Uniform | null {
    const material = this.starsMaterial as unknown as PatchableShaderMaterial
    return material.uniforms[name] ?? null
  }

  private loadCloudTexture(url: string, applyTexture: TextureApplyCallback<THREE.Texture>) {
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (texture) => {
        if (this.isDisposed) {
          texture.dispose()
          return
        }

        texture.minFilter = THREE.LinearMipMapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.wrapS = THREE.RepeatWrapping
        texture.wrapT = THREE.RepeatWrapping
        texture.colorSpace = THREE.NoColorSpace
        texture.needsUpdate = true
        this.loadedTextures.push(texture)
        applyTexture(texture)
      },
      undefined,
      (error) => {
        this.warnTextureLoadFailure(url, error)
      }
    )
  }

  private async loadData3DTexture(url: string, size: number, applyTexture: TextureApplyCallback<THREE.Data3DTexture>) {
    try {
      const response = await fetch(url, { signal: this.textureAbortController.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()
      if (this.isDisposed) return

      const texture = new THREE.Data3DTexture(new Uint8Array(buffer), size, size, size)
      texture.format = THREE.RedFormat
      texture.minFilter = THREE.LinearFilter
      texture.magFilter = THREE.LinearFilter
      texture.wrapS = THREE.RepeatWrapping
      texture.wrapT = THREE.RepeatWrapping
      texture.wrapR = THREE.RepeatWrapping
      texture.colorSpace = THREE.NoColorSpace
      texture.needsUpdate = true
      this.loadedTextures.push(texture)
      applyTexture(texture)
    } catch (error) {
      if (this.isAbortError(error)) return
      this.warnTextureLoadFailure(url, error)
    }
  }

  private loadSTBNTexture(url: string) {
    new STBNLoader().load(
      url,
      (texture) => {
        if (this.isDisposed) {
          texture.dispose()
          return
        }

        this.loadedTextures.push(texture)
        this.cloudsEffect.stbnTexture = texture
        this.aerialPerspectiveEffect.stbnTexture = texture
      },
      undefined,
      (error) => {
        this.warnTextureLoadFailure(url, error)
      }
    )
  }

  private async loadStarsData(url: string) {
    try {
      const response = await fetch(url, { signal: this.textureAbortController.signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const buffer = await response.arrayBuffer()
      if (this.isDisposed) return

      const previousGeometry = this.stars.geometry
      this.stars.geometry = new StarsGeometry(buffer)
      previousGeometry.dispose()
    } catch (error) {
      if (this.isAbortError(error)) return
      this.warnTextureLoadFailure(url, error)
    }
  }

  private isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private warnTextureLoadFailure(label: string, error: unknown) {
    if (this.isDisposed) return

    console.warn(`Tellux atmosphere texture load failed: ${label}`, error)
  }
}
