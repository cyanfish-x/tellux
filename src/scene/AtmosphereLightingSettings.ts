import type { AtmosphereLightingMode } from '../types'
import type { ResolvedSceneOptions } from './SceneOptions'

export class AtmosphereLightingSettings {
  private readonly onStateChange: () => void
  private readonly onEffectsChange: () => void
  private readonly onSurfaceMaterialModeChange: () => void

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['lighting'],
    onStateChange: () => void,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.onStateChange = onStateChange
    this.onEffectsChange = onEffectsChange
    this.onSurfaceMaterialModeChange = onSurfaceMaterialModeChange
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
    this.options.sunLightIntensity = value
    this.onStateChange()
  }

  /** 天空光探针辐射强度缩放。Sky light probe irradiance intensity scale. */
  get skyLightIntensity() {
    return this.options.skyLightIntensity
  }

  set skyLightIntensity(value: number) {
    this.options.skyLightIntensity = value
    this.onStateChange()
  }

  /** 后处理光照使用的反照率缩放。Albedo scale used by post-process lighting. */
  get albedoScale() {
    return this.options.albedoScale
  }

  set albedoScale(value: number) {
    this.options.albedoScale = value
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}
