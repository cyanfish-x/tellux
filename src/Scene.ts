import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import type { ViewerOptions } from './types'

class SceneToggle {
  private isShown: boolean
  private readonly onChange: () => void

  constructor(isShown: boolean, onChange: () => void) {
    this.isShown = isShown
    this.onChange = onChange
  }

  /**
   * 场景功能是否可见。
   *
   * Whether the scene feature is visible.
   */
  get show() {
    return this.isShown
  }

  set show(value: boolean) {
    if (this.isShown === value) return
    this.isShown = value
    this.onChange()
  }
}

class PostProcessStage {
  private isEnabled: boolean
  private readonly onChange: () => void

  constructor(isEnabled: boolean, onChange: () => void) {
    this.isEnabled = isEnabled
    this.onChange = onChange
  }

  /**
   * 该后处理阶段是否启用。
   *
   * Whether this post-processing stage is enabled.
   */
  get enabled() {
    return this.isEnabled
  }

  set enabled(value: boolean) {
    if (this.isEnabled === value) return
    this.isEnabled = value
    this.onChange()
  }
}

class PostProcessStages {
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  lensFlare: PostProcessStage
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  smaa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  dithering: PostProcessStage

  constructor(options: Required<NonNullable<ViewerOptions['scene']>>, onChange: () => void) {
    this.lensFlare = new PostProcessStage(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa, onChange)
    this.dithering = new PostProcessStage(options.dithering, onChange)
  }
}

/**
 * 场景级控制项和底层 Three.js 场景。
 *
 * 通常通过 {@link Viewer.scene} 访问。
 *
 * Scene-level controls and the underlying Three.js scene.
 *
 * Access this through {@link Viewer.scene}.
 */
export class Scene {
  /**
   * 底层 Three.js 场景，可用于添加自定义对象。
   *
   * Underlying Three.js scene for adding custom objects.
   */
  readonly threeScene = new THREE.Scene()
  /**
   * 云层可见性开关。
   *
   * Cloud visibility toggle.
   */
  clouds: SceneToggle
  /**
   * 大气可见性开关。
   *
   * Atmosphere visibility toggle.
   */
  skyAtmosphere: SceneToggle
  /**
   * 后处理阶段控制项。
   *
   * Post-processing stage controls.
   */
  postProcessStages: PostProcessStages
  private currentCloudCoverage: number
  private currentCloudLayerAltitude: number
  private currentCloudLayerHeight: number
  private currentAtmosphereInscatterIntensity: number
  private isAtmosphereInscatterHorizonBlend: boolean
  private currentAtmosphereInscatterHorizonRange: [number, number]
  private readonly cloudLayerOffsets = [0, 250]
  private readonly cloudLayerHeightScales = [1, 1200 / 650]
  private readonly getCloudsEffect: () => CloudsEffect | null

  constructor(
    options: Required<NonNullable<ViewerOptions['scene']>>,
    getCloudsEffect: () => CloudsEffect | null,
    onEffectsChange: () => void
  ) {
    this.getCloudsEffect = getCloudsEffect
    this.currentCloudCoverage = options.cloudCoverage
    this.currentAtmosphereInscatterIntensity = options.atmosphereInscatterIntensity
    this.isAtmosphereInscatterHorizonBlend = options.atmosphereInscatterHorizonBlend
    this.currentAtmosphereInscatterHorizonRange = options.atmosphereInscatterHorizonRange
    const defaultLayer = this.getCloudsEffect()?.cloudLayers[0]
    this.currentCloudLayerAltitude = defaultLayer?.altitude ?? 750
    this.currentCloudLayerHeight = defaultLayer?.height ?? 650
    this.clouds = new SceneToggle(options.clouds, onEffectsChange)
    this.skyAtmosphere = new SceneToggle(options.skyAtmosphere, onEffectsChange)
    this.postProcessStages = new PostProcessStages(options, onEffectsChange)
  }

  /**
   * 云覆盖率，范围 `0` 到 `1`。
   *
   * Cloud coverage from `0` to `1`.
   */
  get cloudCoverage() {
    return this.currentCloudCoverage
  }

  set cloudCoverage(value: number) {
    this.currentCloudCoverage = value
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.coverage = value
  }

  /**
   * 空气散射强度，范围 `0` 到 `1`。
   *
   * 控制空气透视中沿视线进入镜头的散射光强度。降低后远景会更通透。
   *
   * Atmospheric in-scattering intensity from `0` to `1`.
   *
   * Controls the light scattered into the view ray by aerial perspective.
   * Lower values make distant imagery clearer.
   */
  get atmosphereInscatterIntensity() {
    return this.currentAtmosphereInscatterIntensity
  }

  set atmosphereInscatterIntensity(value: number) {
    this.currentAtmosphereInscatterIntensity = THREE.MathUtils.clamp(value, 0, 1)
  }

  /**
   * 是否按地平线和球体边缘混合空气散射。
   *
   * 开启后，正俯视区域会减弱散射，越接近地平线或球体边缘散射越强。
   *
   * Whether atmospheric in-scattering is blended by horizon and globe edge.
   *
   * When enabled, in-scattering is reduced in top-down areas and strengthened
   * toward the horizon or globe edge.
   */
  get atmosphereInscatterHorizonBlend() {
    return this.isAtmosphereInscatterHorizonBlend
  }

  set atmosphereInscatterHorizonBlend(value: boolean) {
    this.isAtmosphereInscatterHorizonBlend = value
  }

  /**
   * 空气散射地平线混合范围。
   *
   * 值基于视线与地表法线夹角的余弦。第一个值以内保留完整散射，第二个值以外接近无散射。
   *
   * Horizon blend range for in-scattering.
   *
   * Values are based on the cosine between the view ray and surface normal.
   * At or below the first value, full in-scattering is preserved; at or above
   * the second value, in-scattering approaches zero.
   */
  get atmosphereInscatterHorizonRange(): [number, number] {
    return [...this.currentAtmosphereInscatterHorizonRange]
  }

  set atmosphereInscatterHorizonRange(value: [number, number]) {
    this.currentAtmosphereInscatterHorizonRange = [...value]
  }

  /**
   * 低云层组云底高度（米）。
   *
   * Base altitude of the low cloud layer group in meters.
   */
  get cloudLayerAltitude() {
    return this.currentCloudLayerAltitude
  }

  set cloudLayerAltitude(value: number) {
    this.currentCloudLayerAltitude = value
    this.updateLowCloudLayers()
  }

  /**
   * 低云层组厚度（米）。
   *
   * Height of the low cloud layer group in meters.
   */
  get cloudLayerHeight() {
    return this.currentCloudLayerHeight
  }

  set cloudLayerHeight(value: number) {
    this.currentCloudLayerHeight = value
    this.updateLowCloudLayers()
  }

  private updateLowCloudLayers() {
    const clouds = this.getCloudsEffect()
    if (!clouds) return

    this.cloudLayerOffsets.forEach((offset, index) => {
      const layer = clouds.cloudLayers[index]
      if (!layer) return

      layer.altitude = this.currentCloudLayerAltitude + offset
      layer.height = this.currentCloudLayerHeight * this.cloudLayerHeightScales[index]
    })
  }
}
