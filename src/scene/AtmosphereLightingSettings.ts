import type { AtmosphereLightingMode } from '../types'
import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

export class AtmosphereLightingSettings {
  private readonly onStateChange: () => void
  private readonly onEffectsChange: () => void
  private readonly onSurfaceMaterialModeChange: () => void
  /**
   * 光度单位。启用后太阳照度按正午 lux 锚映射 Takram 强度。
   *
   * Photometric units. When enabled, sun illuminance maps through the noon lux
   * anchor onto Takram intensity.
   */
  readonly photometric: AtmospherePhotometricSettings

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['lighting'],
    onStateChange: () => void,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.onStateChange = onStateChange
    this.onEffectsChange = onEffectsChange
    this.onSurfaceMaterialModeChange = onSurfaceMaterialModeChange
    this.photometric = new AtmospherePhotometricSettings(options.photometric, onStateChange)
  }

  /** 大气光照模式。Atmosphere lighting mode. */
  get mode() {
    return this.options.mode
  }

  set mode(value: AtmosphereLightingMode) {
    if (this.options.mode === value) return

    this.options.mode = value
    this.onStateChange()
    this.onEffectsChange()
    this.onSurfaceMaterialModeChange()
  }

  /** 是否应用太阳直射光照。Applies direct sun irradiance. */
  get sunLight() {
    return this.options.sunLight
  }

  set sunLight(value: boolean) {
    if (this.options.sunLight === value) return

    this.options.sunLight = value
    this.onStateChange()
    this.onEffectsChange()
  }

  /** 是否应用天空环境光照。Applies sky irradiance. */
  get skyLight() {
    return this.options.skyLight
  }

  set skyLight(value: boolean) {
    if (this.options.skyLight === value) return

    this.options.skyLight = value
    this.onStateChange()
    this.onEffectsChange()
  }

  /** 太阳光源辐射强度缩放。Sun light source irradiance intensity scale. */
  get sunLightIntensity() {
    return this.options.sunLightIntensity
  }

  set sunLightIntensity(value: number) {
    this.options.sunLightIntensity = sceneValueNormalizers.sunLightIntensity(value)
    this.onStateChange()
  }

  /** 天空光探针辐射强度缩放。Sky light probe irradiance intensity scale. */
  get skyLightIntensity() {
    return this.options.skyLightIntensity
  }

  set skyLightIntensity(value: number) {
    this.options.skyLightIntensity = sceneValueNormalizers.skyLightIntensity(value)
    this.onStateChange()
  }

  /** 后处理光照使用的反照率缩放。Albedo scale used by post-process lighting. */
  get albedoScale() {
    return this.options.albedoScale
  }

  set albedoScale(value: number) {
    this.options.albedoScale = sceneValueNormalizers.albedoScale(value)
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}

class AtmospherePhotometricSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['lighting']['photometric'],
    private readonly onStateChange: () => void
  ) {}

  /**
   * 是否启用光度单位。
   *
   * Whether photometric units are enabled.
   */
  get enabled() {
    return this.options.enabled
  }

  set enabled(value: boolean) {
    if (this.options.enabled === value) return
    this.options.enabled = value
    this.onStateChange()
  }

  /**
   * 正午太阳照度锚（lux）。
   *
   * Noon sun illuminance anchor in lux.
   */
  get sunIlluminance() {
    return this.options.sunIlluminance
  }

  set sunIlluminance(value: number) {
    this.options.sunIlluminance = sceneValueNormalizers.sunIlluminance(value)
    this.onStateChange()
  }
}
