import type { CloudRuntimeState } from '../rendering/AtmosphereRuntimeState'
import type { CloudQualityPreset } from '../types'
import type { CloudStateApplier } from './SceneStateAppliers'
import type { ResolvedSceneOptions } from './SceneOptions'
import { SceneToggle } from './SceneToggle'

const DEFAULT_CLOUD_SPEED = 0.0005

export class CloudSettings {
  private readonly visibility: SceneToggle
  private readonly applyCloudsState: CloudStateApplier
  private readonly onEffectsChange: () => void
  private currentQuality: CloudQualityPreset | undefined
  private currentLightShafts: boolean
  private currentCoverage: number
  private currentSpeed: number
  private currentLayerAltitude: number
  private currentLayerHeight: number

  constructor(
    options: ResolvedSceneOptions['clouds'],
    applyCloudsState: CloudStateApplier,
    onEffectsChange: () => void
  ) {
    this.applyCloudsState = applyCloudsState
    this.onEffectsChange = onEffectsChange
    this.visibility = new SceneToggle(options.show, onEffectsChange)
    this.currentQuality = options.quality
    this.currentLightShafts = options.lightShafts
    this.currentCoverage = options.coverage
    this.currentSpeed = toNonNegativeFinite(options.speed, DEFAULT_CLOUD_SPEED)
    this.currentLayerAltitude = options.layer.altitude
    this.currentLayerHeight = options.layer.height
  }

  /**
   * 体积云是否显示。
   *
   * Whether volumetric clouds are shown.
   */
  get show() {
    return this.visibility.show
  }

  set show(value: boolean) {
    this.visibility.show = value
  }

  /**
   * 体积云质量档位。
   *
   * Volumetric cloud quality preset.
   */
  get quality() {
    return this.currentQuality
  }

  set quality(value: CloudQualityPreset | undefined) {
    if (this.currentQuality === value) return

    this.currentQuality = value
    this.apply()
    this.onEffectsChange()
  }

  /**
   * 是否启用体积云光柱。
   *
   * Whether volumetric cloud light shafts are enabled.
   */
  get lightShafts() {
    return this.currentLightShafts
  }

  set lightShafts(value: boolean) {
    if (this.currentLightShafts === value) return

    this.currentLightShafts = value
    this.apply()
    this.onEffectsChange()
  }

  /**
   * 云覆盖率，范围 `0` 到 `1`。
   *
   * Cloud coverage from `0` to `1`.
   */
  get coverage() {
    return this.currentCoverage
  }

  set coverage(value: number) {
    if (this.currentCoverage === value) return

    this.currentCoverage = value
    this.apply()
  }

  /**
   * 体积云天气纹理的水平运动速度，单位为 UV 偏移/秒。
   *
   * Horizontal motion speed for the volumetric cloud weather texture in UV
   * offset per second.
   */
  get speed() {
    return this.currentSpeed
  }

  set speed(value: number) {
    const nextSpeed = toNonNegativeFinite(value, DEFAULT_CLOUD_SPEED)
    if (this.currentSpeed === nextSpeed) return

    this.currentSpeed = nextSpeed
    this.apply()
  }

  /**
   * 低云层组云底高度（米）。
   *
   * Base altitude of the low cloud layer group in meters.
   */
  get layerAltitude() {
    return this.currentLayerAltitude
  }

  set layerAltitude(value: number) {
    if (this.currentLayerAltitude === value) return

    this.currentLayerAltitude = value
    this.apply()
  }

  /**
   * 低云层组厚度（米）。
   *
   * Height of the low cloud layer group in meters.
   */
  get layerHeight() {
    return this.currentLayerHeight
  }

  set layerHeight(value: number) {
    if (this.currentLayerHeight === value) return

    this.currentLayerHeight = value
    this.apply()
  }

  apply() {
    this.applyCloudsState(this.getRuntimeState())
  }

  private getRuntimeState(): CloudRuntimeState {
    return {
      quality: this.currentQuality,
      lightShafts: this.currentLightShafts,
      coverage: this.currentCoverage,
      speed: this.currentSpeed,
      layerAltitude: this.currentLayerAltitude,
      layerHeight: this.currentLayerHeight
    }
  }
}

function toNonNegativeFinite(value: number, fallback: number) {
  return Math.max(0, Number.isFinite(value) ? value : fallback)
}
