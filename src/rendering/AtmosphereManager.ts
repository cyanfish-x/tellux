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
  PrecomputedTexturesGenerator,
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import { DEFAULT_STBN_URL, STBNLoader } from '@takram/three-geospatial'
import { getTelluxAssetUrl } from '../config'

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

export interface AtmosphereRuntimeControls {
  correctAltitude: boolean
  correctGeometricError: boolean
  transmittance: boolean
  inscatter: boolean
  postProcessSunLight: boolean
  postProcessSkyLight: boolean
  sun: boolean
  moon: boolean
  ground: boolean
  albedoScale: number
  sunAngularRadius: number
  moonAngularRadius: number
  lunarRadianceScale: number
  shadowRadius: number
  shadowSampleCount: number
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

export class AtmosphereManager {
  readonly sunLight = new THREE.DirectionalLight(0xffffff, 3)
  readonly skyLight = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.8)
  readonly aerialPerspectiveEffect: AerialPerspectiveEffect
  readonly cloudsEffect: CloudsEffect

  private readonly loadedTextures: THREE.Texture[] = []
  private readonly texturesGenerator: PrecomputedTexturesGenerator
  private readonly textureAbortController = new AbortController()
  private readonly baseSolarIrradiance = new THREE.Vector3()
  private readonly baseRayleighScattering = new THREE.Vector3()
  private readonly baseMieScattering = new THREE.Vector3()
  private readonly baseMieExtinction = new THREE.Vector3()
  private readonly baseAbsorptionExtinction = new THREE.Vector3()
  private isDisposed = false

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly onCompositionChange: () => void
  ) {
    this.aerialPerspectiveEffect = new AerialPerspectiveEffect(this.camera)
    this.aerialPerspectiveEffect.sky = true
    this.aerialPerspectiveEffect.sunLight = true
    this.aerialPerspectiveEffect.skyLight = true
    this.patchInscatterIntensity()
    this.captureAtmosphereDefaults()

    this.cloudsEffect = new CloudsEffect(this.camera)
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

  addLightsTo(scene: THREE.Scene) {
    scene.add(this.sunLight, this.skyLight)
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
    this.sunLight.position.copy(sunDirection).multiplyScalar(10000000)
  }

  get inscatterIntensity() {
    return this.getInscatterIntensityUniform()?.value ?? 1
  }

  set inscatterIntensity(value: number) {
    const uniform = this.getInscatterIntensityUniform()
    if (uniform) uniform.value = THREE.MathUtils.clamp(value, 0, 1)
  }

  get inscatterHorizonBlend() {
    return Boolean(this.getInscatterHorizonBlendUniform()?.value)
  }

  set inscatterHorizonBlend(value: boolean) {
    const uniform = this.getInscatterHorizonBlendUniform()
    if (uniform) uniform.value = value ? 1 : 0
  }

  get inscatterHorizonRange(): [number, number] {
    const value = this.getInscatterHorizonRangeUniform()?.value
    return value ? [value.x, value.y] : [0, 0.6]
  }

  set inscatterHorizonRange(value: [number, number]) {
    const uniform = this.getInscatterHorizonRangeUniform()
    if (uniform) {
      const start = THREE.MathUtils.clamp(Math.min(value[0], value[1]), 0, 1)
      const end = THREE.MathUtils.clamp(Math.max(value[0], value[1]), 0, 1)
      uniform.value.set(
        start,
        end
      )
    }
  }

  get correctAltitude() {
    return this.aerialPerspectiveEffect.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.aerialPerspectiveEffect.correctAltitude = value
  }

  get correctGeometricError() {
    return this.aerialPerspectiveEffect.correctGeometricError
  }

  set correctGeometricError(value: boolean) {
    this.aerialPerspectiveEffect.correctGeometricError = value
  }

  get transmittance() {
    return this.aerialPerspectiveEffect.transmittance
  }

  set transmittance(value: boolean) {
    this.aerialPerspectiveEffect.transmittance = value
  }

  get inscatter() {
    return this.aerialPerspectiveEffect.inscatter
  }

  set inscatter(value: boolean) {
    this.aerialPerspectiveEffect.inscatter = value
  }

  get postProcessSunLight() {
    return this.aerialPerspectiveEffect.sunLight
  }

  set postProcessSunLight(value: boolean) {
    this.aerialPerspectiveEffect.sunLight = value
  }

  get postProcessSkyLight() {
    return this.aerialPerspectiveEffect.skyLight
  }

  set postProcessSkyLight(value: boolean) {
    this.aerialPerspectiveEffect.skyLight = value
  }

  get sun() {
    return this.aerialPerspectiveEffect.sun
  }

  set sun(value: boolean) {
    this.aerialPerspectiveEffect.sun = value
  }

  get moon() {
    return this.aerialPerspectiveEffect.moon
  }

  set moon(value: boolean) {
    this.aerialPerspectiveEffect.moon = value
  }

  get ground() {
    return this.aerialPerspectiveEffect.ground
  }

  set ground(value: boolean) {
    this.aerialPerspectiveEffect.ground = value
  }

  get albedoScale() {
    return this.aerialPerspectiveEffect.albedoScale
  }

  set albedoScale(value: number) {
    this.aerialPerspectiveEffect.albedoScale = this.toFinite(value, 1)
  }

  get sunAngularRadius() {
    return this.aerialPerspectiveEffect.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.aerialPerspectiveEffect.sunAngularRadius = THREE.MathUtils.clamp(this.toFinite(value, 0.004675), 0, 0.1)
  }

  get moonAngularRadius() {
    return this.aerialPerspectiveEffect.moonAngularRadius
  }

  set moonAngularRadius(value: number) {
    this.aerialPerspectiveEffect.moonAngularRadius = THREE.MathUtils.clamp(this.toFinite(value, 0.0045), 0, 0.1)
  }

  get lunarRadianceScale() {
    return this.aerialPerspectiveEffect.lunarRadianceScale
  }

  set lunarRadianceScale(value: number) {
    this.aerialPerspectiveEffect.lunarRadianceScale = Math.max(0, this.toFinite(value, 1))
  }

  get shadowRadius() {
    return this.aerialPerspectiveEffect.shadowRadius
  }

  set shadowRadius(value: number) {
    this.aerialPerspectiveEffect.shadowRadius = Math.max(0, this.toFinite(value, 3))
  }

  get shadowSampleCount() {
    return this.aerialPerspectiveEffect.shadowSampleCount
  }

  set shadowSampleCount(value: number) {
    this.aerialPerspectiveEffect.shadowSampleCount = Math.round(THREE.MathUtils.clamp(this.toFinite(value, 8), 1, 16))
  }

  get solarIrradianceScale() {
    return this.getVectorScale('solar_irradiance', this.baseSolarIrradiance)
  }

  set solarIrradianceScale(value: number) {
    this.setVectorScale('solar_irradiance', this.baseSolarIrradiance, value)
  }

  get rayleighScatteringScale() {
    return this.getVectorScale('rayleigh_scattering', this.baseRayleighScattering)
  }

  set rayleighScatteringScale(value: number) {
    this.setVectorScale('rayleigh_scattering', this.baseRayleighScattering, value)
  }

  get mieScatteringScale() {
    return this.getVectorScale('mie_scattering', this.baseMieScattering)
  }

  set mieScatteringScale(value: number) {
    this.setVectorScale('mie_scattering', this.baseMieScattering, value)
  }

  get mieExtinctionScale() {
    return this.getVectorScale('mie_extinction', this.baseMieExtinction)
  }

  set mieExtinctionScale(value: number) {
    this.setVectorScale('mie_extinction', this.baseMieExtinction, value)
  }

  get miePhaseFunctionG() {
    return this.getAtmosphereUniform().mie_phase_function_g
  }

  set miePhaseFunctionG(value: number) {
    this.getAtmosphereUniform().mie_phase_function_g = THREE.MathUtils.clamp(this.toFinite(value, 0.8), -0.99, 0.99)
  }

  get absorptionExtinctionScale() {
    return this.getVectorScale('absorption_extinction', this.baseAbsorptionExtinction)
  }

  set absorptionExtinctionScale(value: number) {
    this.setVectorScale('absorption_extinction', this.baseAbsorptionExtinction, value)
  }

  get groundAlbedo() {
    const color = this.getAtmosphereUniform().ground_albedo
    return (color.r + color.g + color.b) / 3
  }

  set groundAlbedo(value: number) {
    this.getAtmosphereUniform().ground_albedo.setScalar(THREE.MathUtils.clamp(this.toFinite(value, 0.1), 0, 1))
  }

  async loadTextures() {
    try {
      const textures = await this.texturesGenerator.update()
      if (this.isDisposed) return

      Object.assign(this.aerialPerspectiveEffect, textures)
      Object.assign(this.cloudsEffect, textures)

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
    this.texturesGenerator.dispose({ textures: true })
    this.loadedTextures.forEach((texture) => texture.dispose())
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

  private getVectorScale(field: keyof Pick<
    AtmosphereUniformValue,
    'solar_irradiance' | 'rayleigh_scattering' | 'mie_scattering' | 'mie_extinction' | 'absorption_extinction'
  >, base: THREE.Vector3) {
    const current = this.getAtmosphereUniform()[field]
    return base.x !== 0 ? current.x / base.x : 1
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

  private isAbortError(error: unknown) {
    return error instanceof DOMException && error.name === 'AbortError'
  }

  private warnTextureLoadFailure(label: string, error: unknown) {
    if (this.isDisposed) return

    console.warn(`Tellux atmosphere texture load failed: ${label}`, error)
  }
}
