import type { CloudRuntimeState } from '../rendering/AtmosphereRuntimeState'
import type { CloudQualityPreset } from '../types'
import type { CloudStateApplier } from './SceneStateAppliers'
import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'
import { SceneToggle } from './SceneToggle'

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
    this.currentCoverage = sceneValueNormalizers.cloudCoverage(options.coverage)
    this.currentSpeed = sceneValueNormalizers.cloudSpeed(options.speed)
    this.currentLayerAltitude = sceneValueNormalizers.cloudLayerAltitude(options.layer.altitude)
    this.currentLayerHeight = sceneValueNormalizers.cloudLayerHeight(options.layer.height)
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
    const nextCoverage = sceneValueNormalizers.cloudCoverage(value)
    if (this.currentCoverage === nextCoverage) return

    this.currentCoverage = nextCoverage
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
    const nextSpeed = sceneValueNormalizers.cloudSpeed(value)
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
    const nextAltitude = sceneValueNormalizers.cloudLayerAltitude(value)
    if (this.currentLayerAltitude === nextAltitude) return

    this.currentLayerAltitude = nextAltitude
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
    const nextHeight = sceneValueNormalizers.cloudLayerHeight(value)
    if (this.currentLayerHeight === nextHeight) return

    this.currentLayerHeight = nextHeight
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
