import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

export class AtmosphereScatteringSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['scattering'],
    private readonly onStateChange: () => void
  ) {}

  /** 是否应用大气透射衰减。Applies atmospheric transmittance attenuation. */
  get transmittance() {
    return this.options.transmittance
  }

  set transmittance(value: boolean) {
    this.options.transmittance = value
    this.onStateChange()
  }

  /** 是否应用进入视线的空气散射光。Applies atmospheric in-scattered light. */
  get inscatter() {
    return this.options.inscatter
  }

  set inscatter(value: boolean) {
    this.options.inscatter = value
    this.onStateChange()
  }

  /** 空气散射强度。Atmospheric in-scattering intensity. */
  get intensity() {
    return this.options.intensity
  }

  set intensity(value: number) {
    this.options.intensity = sceneValueNormalizers.inscatterIntensity(value)
    this.onStateChange()
  }

  /** 是否按地平线和球体边缘混合空气散射。Blends atmospheric in-scattering by horizon and globe edge. */
  get horizonBlend() {
    return this.options.horizonBlend
  }

  set horizonBlend(value: boolean) {
    this.options.horizonBlend = value
    this.onStateChange()
  }

  /** 空气散射地平线混合范围。Horizon blend range for in-scattering. */
  get horizonRange(): [number, number] {
    return [...this.options.horizonRange]
  }

  set horizonRange(value: [number, number]) {
    this.options.horizonRange = sceneValueNormalizers.inscatterHorizonRange(value)
    this.onStateChange()
  }

  /** 是否修正相机高度和椭球高度误差。Corrects camera altitude against the atmosphere ellipsoid. */
  get correctAltitude() {
    return this.options.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.options.correctAltitude = value
    this.onStateChange()
  }

  /** 是否修正地表瓦片几何误差导致的光照伪影。Corrects lighting artifacts caused by surface tile geometric error. */
  get correctGeometricError() {
    return this.options.correctGeometricError
  }

  set correctGeometricError(value: boolean) {
    this.options.correctGeometricError = value
    this.onStateChange()
  }

  /** 太阳入射光谱强度缩放。Scale for top-of-atmosphere solar spectral irradiance. */
  get solarIrradianceScale() {
    return this.options.solarIrradianceScale
  }

  set solarIrradianceScale(value: number) {
    this.options.solarIrradianceScale = sceneValueNormalizers.solarIrradianceScale(value)
    this.onStateChange()
  }

  /** 瑞利散射系数缩放。Scale for Rayleigh scattering coefficients. */
  get rayleighScatteringScale() {
    return this.options.rayleighScatteringScale
  }

  set rayleighScatteringScale(value: number) {
    this.options.rayleighScatteringScale = sceneValueNormalizers.rayleighScatteringScale(value)
    this.onStateChange()
  }

  /** 米氏散射系数缩放。Scale for Mie scattering coefficients. */
  get mieScatteringScale() {
    return this.options.mieScatteringScale
  }

  set mieScatteringScale(value: number) {
    this.options.mieScatteringScale = sceneValueNormalizers.mieScatteringScale(value)
    this.onStateChange()
  }

  /** 米氏消光系数缩放。Scale for Mie extinction coefficients. */
  get mieExtinctionScale() {
    return this.options.mieExtinctionScale
  }

  set mieExtinctionScale(value: number) {
    this.options.mieExtinctionScale = sceneValueNormalizers.mieExtinctionScale(value)
    this.onStateChange()
  }

  /** 米氏相函数不对称因子。Mie phase function asymmetry factor. */
  get miePhaseFunctionG() {
    return this.options.miePhaseFunctionG
  }

  set miePhaseFunctionG(value: number) {
    this.options.miePhaseFunctionG = sceneValueNormalizers.miePhaseFunctionG(value)
    this.onStateChange()
  }

  /** 臭氧等吸收介质的消光系数缩放。Scale for absorption extinction. */
  get absorptionExtinctionScale() {
    return this.options.absorptionExtinctionScale
  }

  set absorptionExtinctionScale(value: number) {
    this.options.absorptionExtinctionScale = sceneValueNormalizers.absorptionExtinctionScale(value)
    this.onStateChange()
  }

  /** 大气模型里的平均地表反照率。Average ground albedo in the atmosphere model. */
  get groundAlbedo() {
    return this.options.groundAlbedo
  }

  set groundAlbedo(value: number) {
    this.options.groundAlbedo = sceneValueNormalizers.groundAlbedo(value)
    this.onStateChange()
  }
}
