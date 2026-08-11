import type { CloudRuntimeState } from '../rendering/AtmosphereRuntimeState'
import type { CloudQualityPreset, CloudShadowQuality } from '../types'
import type { CloudStateApplier } from './SceneStateAppliers'
import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'
import { SceneToggle } from './SceneToggle'

class CloudLayerSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['clouds']['layer'],
    private readonly onChange: () => void
  ) {}

  /**
   * 低云层组云底高度（米）。
   *
   * Base altitude of the low cloud layer group in meters.
   */
  get altitude() {
    return this.options.altitude
  }

  set altitude(value: number) {
    const next = sceneValueNormalizers.cloudLayerAltitude(value)
    if (this.options.altitude === next) return
    this.options.altitude = next
    this.onChange()
  }

  /**
   * 低云层组厚度（米）。
   *
   * Height of the low cloud layer group in meters.
   */
  get height() {
    return this.options.height
  }

  set height(value: number) {
    const next = sceneValueNormalizers.cloudLayerHeight(value)
    if (this.options.height === next) return
    this.options.height = next
    this.onChange()
  }
}

class CloudLookSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['clouds']['look'],
    private readonly onChange: () => void
  ) {}

  /**
   * 是否启用 shape detail。
   *
   * Whether cloud shape detail is enabled.
   */
  get detail() {
    return this.options.detail
  }

  set detail(value: boolean) {
    if (this.options.detail === value) return
    this.options.detail = value
    this.onChange()
  }

  /**
   * 是否启用湍流。
   *
   * Whether cloud turbulence is enabled.
   */
  get turbulence() {
    return this.options.turbulence
  }

  set turbulence(value: boolean) {
    if (this.options.turbulence === value) return
    this.options.turbulence = value
    this.onChange()
  }

  /**
   * 是否启用雾霾。
   *
   * Whether cloud haze is enabled.
   */
  get haze() {
    return this.options.haze
  }

  set haze(value: boolean) {
    if (this.options.haze === value) return
    this.options.haze = value
    this.onChange()
  }
}

class CloudShadowSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['clouds']['shadow'],
    private readonly onChange: () => void
  ) {}

  /**
   * 云影质量档位。
   *
   * Cloud shadow quality preset.
   */
  get quality() {
    return this.options.quality
  }

  set quality(value: CloudShadowQuality) {
    const next = sceneValueNormalizers.cloudShadowQuality(value)
    if (this.options.quality === next) return
    this.options.quality = next
    this.onChange()
  }
}

export class CloudSettings {
  readonly layer: CloudLayerSettings
  readonly look: CloudLookSettings
  readonly shadow: CloudShadowSettings
  private readonly visibility: SceneToggle
  private readonly applyCloudsState: CloudStateApplier
  private readonly onEffectsChange: () => void
  private currentQuality: CloudQualityPreset | undefined
  private currentLightShafts: boolean
  private currentCoverage: number
  private currentSpeed: number

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
    this.currentSpeed = options.speed
    const onLayerChange = () => this.apply()
    const onLookOrShadowChange = () => {
      this.apply()
      this.onEffectsChange()
    }
    this.layer = new CloudLayerSettings(options.layer, onLayerChange)
    this.look = new CloudLookSettings(options.look, onLookOrShadowChange)
    this.shadow = new CloudShadowSettings(options.shadow, onLookOrShadowChange)
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
    const next = sceneValueNormalizers.cloudCoverage(value)
    if (this.currentCoverage === next) return

    this.currentCoverage = next
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

  apply() {
    this.applyCloudsState(this.getRuntimeState())
  }

  private getRuntimeState(): CloudRuntimeState {
    return {
      quality: this.currentQuality,
      lightShafts: this.currentLightShafts,
      coverage: this.currentCoverage,
      speed: this.currentSpeed,
      layer: {
        altitude: this.layer.altitude,
        height: this.layer.height
      },
      look: {
        detail: this.look.detail,
        turbulence: this.look.turbulence,
        haze: this.look.haze
      },
      shadow: {
        quality: this.shadow.quality
      }
    }
  }
}
