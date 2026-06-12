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
import type { AtmosphereLightingMode, CloudQualityPreset } from '../types'

type TextureApplyCallback<T extends THREE.Texture> = (texture: T) => void

interface PatchableEffectShader {
  getFragmentShader(): string
  setFragmentShader(fragmentShader: string): void
  setChanged(): void
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

export interface CloudRuntimeState {
  quality: CloudQualityPreset | undefined
  coverage: number
  speed: number
  layerAltitude: number
  layerHeight: number
}

const CLOUD_COMPOSITION_PROPERTIES = new Set(['atmosphereOverlay', 'atmosphereShadow', 'atmosphereShadowLength'])
const INSCATTER_INTENSITY_UNIFORM = 'telluxInscatterIntensity'
const INSCATTER_HORIZON_BLEND_UNIFORM = 'telluxInscatterHorizonBlend'
const INSCATTER_HORIZON_RANGE_UNIFORM = 'telluxInscatterHorizonRange'
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
  private lightSourceScene: THREE.Scene | null = null
  private isDisposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onCompositionChange: () => void
  ) {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.camera)
    this.aerialPerspectiveEffect.sky = true
    this.patchInscatterIntensity()
    this.captureAtmosphereDefaults()

    this.starsMaterial = new StarsMaterial()
    this.stars = new THREE.Points(new THREE.BufferGeometry(), this.starsMaterial)
    this.stars.frustumCulled = false

    this.sunLightSource = new SunDirectionalLight()
    this.sunLightSource.visible = false
    this.skyLightSource = new SkyLightProbe()
    this.skyLightSource.visible = false

    this.cloudsEffect = new CloudsEffect(this.camera)
    this.cloudsEffect.localWeatherVelocity.set(DEFAULT_CLOUD_SPEED, 0)
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
    const sunDirection = new THREE.Vector3()
    const moonDirection = new THREE.Vector3()
    getSunDirectionECEF(currentTime, sunDirection)
    getMoonDirectionECEF(currentTime, moonDirection)
    this.aerialPerspectiveEffect.sunDirection.copy(sunDirection)
    this.aerialPerspectiveEffect.moonDirection.copy(moonDirection)
    this.cloudsEffect.sunDirection.copy(sunDirection)
    this.starsMaterial.sunDirection.copy(sunDirection)
    this.stars.setRotationFromMatrix(getECIToECEFRotationMatrix(currentTime, this.inertialToECEFMatrix))
    this.sunLightSource.sunDirection.copy(sunDirection)
    this.skyLightSource.sunDirection.copy(sunDirection)
  }

  updateLightSources() {
    this.camera.getWorldPosition(this.lightPosition)
    this.sunLightSource.target.position.copy(this.lightPosition)
    this.skyLightSource.position.copy(this.lightPosition)
    this.sunLightSource.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.skyLightSource.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.starsMaterial.worldToECEFMatrix.copy(this.aerialPerspectiveEffect.worldToECEFMatrix)
    this.sunLightSource.target.updateMatrixWorld(true)
    this.skyLightSource.updateMatrixWorld(true)
    this.sunLightSource.update()
    this.skyLightSource.update()
  }

  applyAtmosphereState(state: AtmosphereRuntimeState) {
    this.setInscatterIntensity(state.inscatterIntensity)
    this.setInscatterHorizonBlend(state.inscatterHorizonBlend)
    this.setInscatterHorizonRange(state.inscatterHorizonRange)
    this.aerialPerspectiveEffect.correctAltitude = state.correctAltitude
    this.sunLightSource.correctAltitude = state.correctAltitude
    this.skyLightSource.correctAltitude = state.correctAltitude
    this.aerialPerspectiveEffect.correctGeometricError = state.correctGeometricError
    this.aerialPerspectiveEffect.transmittance = state.transmittance
    this.aerialPerspectiveEffect.inscatter = state.inscatter
    this.applyLightingMode(state.lightingMode, state.sunLight, state.skyLight)
    this.sunLightSource.intensity = Math.max(0, this.toFinite(state.sunLightIntensity, 1))
    this.skyLightSource.intensity = Math.max(0, this.toFinite(state.skyLightIntensity, 1))
    this.aerialPerspectiveEffect.sun = state.sun
    this.aerialPerspectiveEffect.moon = state.moon
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
    this.starsMaterial.intensity = Math.max(0, this.toFinite(state.starsIntensity, 1))
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
  }

  applyCloudsState(state: CloudRuntimeState) {
    if (state.quality !== undefined) {
      this.cloudsEffect.qualityPreset = state.quality
    }
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
    this.aerialPerspectiveEffect.sunLight = usePostProcessLighting && sunLight
    this.aerialPerspectiveEffect.skyLight = usePostProcessLighting && skyLight
    this.sunLightSource.visible = !usePostProcessLighting && sunLight
    this.skyLightSource.visible = !usePostProcessLighting && skyLight
  }

  private removeLightSourcesFromScene() {
    if (!this.lightSourceScene) return

    this.lightSourceScene.remove(this.sunLightSource)
    this.lightSourceScene.remove(this.sunLightSource.target)
    this.lightSourceScene.remove(this.skyLightSource)
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

  private patchInscatterIntensity() {
    const effect = this.aerialPerspectiveEffect
    const uniforms = effect.uniforms as unknown as DynamicUniforms
    uniforms.set(INSCATTER_INTENSITY_UNIFORM, new THREE.Uniform(1))
    uniforms.set(INSCATTER_HORIZON_BLEND_UNIFORM, new THREE.Uniform(1))
    uniforms.set(INSCATTER_HORIZON_RANGE_UNIFORM, new THREE.Uniform(new THREE.Vector2(0, 0.6)))

    const shaderEffect = effect as unknown as PatchableEffectShader
    const fragmentShader = shaderEffect.getFragmentShader()
    if (fragmentShader.includes(INSCATTER_INTENSITY_UNIFORM)) return

    const withUniform = fragmentShader.replace(
      'uniform float albedoScale;',
      `uniform float albedoScale;\nuniform float ${INSCATTER_INTENSITY_UNIFORM};\nuniform float ${INSCATTER_HORIZON_BLEND_UNIFORM};\nuniform vec2 ${INSCATTER_HORIZON_RANGE_UNIFORM};`
    )
    if (withUniform === fragmentShader) {
      console.warn('Tellux atmosphere shader patch failed: uniform hook was not found.')
      shaderEffect.setChanged()
      return
    }

    const patchedShader = withUniform.replace(
      'radiance = radiance + inscatter;',
      [
        'vec3 telluxGlobeNormal = normalize(positionECEF / vEllipsoidRadiiSquared);',
        'float telluxViewNormalCos = clamp(dot(telluxGlobeNormal, normalize(vCameraPosition - positionECEF)), 0.0, 1.0);',
        `float telluxHorizonMask = 1.0 - smoothstep(${INSCATTER_HORIZON_RANGE_UNIFORM}.x, ${INSCATTER_HORIZON_RANGE_UNIFORM}.y, telluxViewNormalCos);`,
        `float telluxInscatterMask = mix(1.0, telluxHorizonMask, ${INSCATTER_HORIZON_BLEND_UNIFORM});`,
        `radiance = radiance + inscatter * ${INSCATTER_INTENSITY_UNIFORM} * telluxInscatterMask;`
      ].join('\n  ')
    )

    if (patchedShader === withUniform) {
      console.warn('Tellux atmosphere shader patch failed: inscatter intensity hook was not found.')
      shaderEffect.setChanged()
      return
    }

    shaderEffect.setFragmentShader(patchedShader)
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
