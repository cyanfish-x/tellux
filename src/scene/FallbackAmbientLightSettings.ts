import * as THREE from 'three'
import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

const FALLBACK_AMBIENT_LIGHT_MIN_HEIGHT = 8000
const FALLBACK_AMBIENT_LIGHT_MAX_HEIGHT = 7600000

export class FallbackAmbientLightSettings {
  private currentIntensity: number

  constructor(
    options: ResolvedSceneOptions['atmosphere']['fallbackAmbientLight'],
    private readonly source: THREE.AmbientLight
  ) {
    this.source.visible = options.enabled
    this.currentIntensity = sceneValueNormalizers.fallbackAmbientLightIntensity(options.intensity)
  }

  /** 是否启用夜间兜底环境光。Enables the nighttime fallback ambient light. */
  get enabled() {
    return this.source.visible
  }

  set enabled(value: boolean) {
    this.source.visible = value
  }

  /** 夜间兜底环境光强度。Nighttime fallback ambient light intensity. */
  get intensity() {
    return this.currentIntensity
  }

  set intensity(value: number) {
    this.currentIntensity = sceneValueNormalizers.fallbackAmbientLightIntensity(value)
  }

  update(currentHeight: number) {
    if (!this.source.visible) return

    if (!Number.isFinite(currentHeight)) {
      this.source.intensity = 0
      return
    }

    const t = THREE.MathUtils.clamp(
      (FALLBACK_AMBIENT_LIGHT_MAX_HEIGHT - currentHeight) /
        (FALLBACK_AMBIENT_LIGHT_MAX_HEIGHT - FALLBACK_AMBIENT_LIGHT_MIN_HEIGHT),
      0,
      1
    )
    this.source.intensity = this.currentIntensity * t
  }
}
