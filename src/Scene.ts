import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import type { AtmosphereRuntimeControls } from './rendering/AtmosphereManager'
import type { AtmosphereLightingMode, ViewerOptions } from './types'

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
  private readonly getAtmosphereControls: () => AtmosphereRuntimeControls | null
  private readonly onEffectsChange: () => void

  constructor(
    options: Required<NonNullable<ViewerOptions['scene']>>,
    getCloudsEffect: () => CloudsEffect | null,
    getAtmosphereControls: () => AtmosphereRuntimeControls | null,
    onEffectsChange: () => void
  ) {
    this.getCloudsEffect = getCloudsEffect
    this.getAtmosphereControls = getAtmosphereControls
    this.onEffectsChange = onEffectsChange
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
   * 是否修正相机高度和椭球高度误差。
   *
   * Corrects camera altitude against the ellipsoid used by the atmosphere.
   */
  get atmosphereCorrectAltitude() {
    return this.getAtmosphereControls()?.correctAltitude ?? true
  }

  set atmosphereCorrectAltitude(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.correctAltitude = value
  }

  /**
   * 是否修正地表瓦片几何误差导致的光照伪影。
   *
   * Corrects lighting artifacts caused by surface tile geometric error.
   */
  get atmosphereCorrectGeometricError() {
    return this.getAtmosphereControls()?.correctGeometricError ?? true
  }

  set atmosphereCorrectGeometricError(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.correctGeometricError = value
  }

  /**
   * 是否应用大气透射衰减。
   *
   * Applies atmospheric transmittance attenuation.
   */
  get atmosphereTransmittance() {
    return this.getAtmosphereControls()?.transmittance ?? true
  }

  set atmosphereTransmittance(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.transmittance = value
  }

  /**
   * 是否应用进入视线的空气散射光。
   *
   * Applies atmospheric in-scattered light along the view ray.
   */
  get atmosphereInscatter() {
    return this.getAtmosphereControls()?.inscatter ?? true
  }

  set atmosphereInscatter(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.inscatter = value
  }

  /**
   * 大气光照模式。
   *
   * Atmosphere lighting mode.
   */
  get atmosphereLightingMode() {
    return this.getAtmosphereControls()?.lightingMode ?? 'post-process'
  }

  set atmosphereLightingMode(value: AtmosphereLightingMode) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.lightingMode !== value) {
      atmosphere.lightingMode = value
      this.onEffectsChange()
    }
  }

  /**
   * 是否应用太阳直射光照。
   *
   * Applies direct sun irradiance.
   */
  get atmosphereSunLight() {
    return this.getAtmosphereControls()?.sunLight ?? true
  }

  set atmosphereSunLight(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.sunLight !== value) {
      atmosphere.sunLight = value
      this.onEffectsChange()
    }
  }

  /**
   * 是否应用天空环境光照。
   *
   * Applies sky irradiance.
   */
  get atmosphereSkyLight() {
    return this.getAtmosphereControls()?.skyLight ?? true
  }

  set atmosphereSkyLight(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.skyLight !== value) {
      atmosphere.skyLight = value
      this.onEffectsChange()
    }
  }

  /**
   * 是否在天空中绘制太阳盘。
   *
   * Renders the sun disc in the sky.
   */
  get atmosphereSun() {
    return this.getAtmosphereControls()?.sun ?? true
  }

  set atmosphereSun(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.sun = value
  }

  /**
   * 是否在天空中绘制月亮。
   *
   * Renders the moon in the sky.
   */
  get atmosphereMoon() {
    return this.getAtmosphereControls()?.moon ?? true
  }

  set atmosphereMoon(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.moon = value
  }

  /**
   * 是否绘制大气天空里的地面。
   *
   * Renders the ground term in the atmospheric sky.
   */
  get atmosphereGround() {
    return this.getAtmosphereControls()?.ground ?? true
  }

  set atmosphereGround(value: boolean) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.ground = value
  }

  /**
   * 后处理光照使用的反照率缩放。
   *
   * Albedo scale used by post-process lighting.
   */
  get atmosphereAlbedoScale() {
    return this.getAtmosphereControls()?.albedoScale ?? 1
  }

  set atmosphereAlbedoScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.albedoScale = value
  }

  /**
   * 太阳角半径（弧度）。
   *
   * Sun angular radius in radians.
   */
  get atmosphereSunAngularRadius() {
    return this.getAtmosphereControls()?.sunAngularRadius ?? 0.004675
  }

  set atmosphereSunAngularRadius(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.sunAngularRadius = value
  }

  /**
   * 月亮角半径（弧度）。
   *
   * Moon angular radius in radians.
   */
  get atmosphereMoonAngularRadius() {
    return this.getAtmosphereControls()?.moonAngularRadius ?? 0.0045
  }

  set atmosphereMoonAngularRadius(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.moonAngularRadius = value
  }

  /**
   * 月光辐射亮度缩放。
   *
   * Lunar radiance scale.
   */
  get atmosphereLunarRadianceScale() {
    return this.getAtmosphereControls()?.lunarRadianceScale ?? 1
  }

  set atmosphereLunarRadianceScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.lunarRadianceScale = value
  }

  /**
   * 云影采样的屏幕模糊半径。
   *
   * Screen-space blur radius for cloud shadow sampling.
   */
  get atmosphereShadowRadius() {
    return this.getAtmosphereControls()?.shadowRadius ?? 3
  }

  set atmosphereShadowRadius(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.shadowRadius = value
  }

  /**
   * 云影 PCF 采样数量，范围 `1` 到 `16`。
   *
   * Cloud shadow PCF sample count from `1` to `16`.
   */
  get atmosphereShadowSampleCount() {
    return this.getAtmosphereControls()?.shadowSampleCount ?? 8
  }

  set atmosphereShadowSampleCount(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.shadowSampleCount = value
  }

  /**
   * 太阳入射光谱强度缩放。
   *
   * Scale for top-of-atmosphere solar spectral irradiance.
   */
  get atmosphereSolarIrradianceScale() {
    return this.getAtmosphereControls()?.solarIrradianceScale ?? 1
  }

  set atmosphereSolarIrradianceScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.solarIrradianceScale = value
  }

  /**
   * 瑞利散射系数缩放。
   *
   * Scale for Rayleigh scattering coefficients.
   */
  get atmosphereRayleighScatteringScale() {
    return this.getAtmosphereControls()?.rayleighScatteringScale ?? 1
  }

  set atmosphereRayleighScatteringScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.rayleighScatteringScale = value
  }

  /**
   * 米氏散射系数缩放。
   *
   * Scale for Mie scattering coefficients.
   */
  get atmosphereMieScatteringScale() {
    return this.getAtmosphereControls()?.mieScatteringScale ?? 1
  }

  set atmosphereMieScatteringScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.mieScatteringScale = value
  }

  /**
   * 米氏消光系数缩放。
   *
   * Scale for Mie extinction coefficients.
   */
  get atmosphereMieExtinctionScale() {
    return this.getAtmosphereControls()?.mieExtinctionScale ?? 1
  }

  set atmosphereMieExtinctionScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.mieExtinctionScale = value
  }

  /**
   * 米氏相函数不对称因子。
   *
   * Mie phase function asymmetry factor.
   */
  get atmosphereMiePhaseFunctionG() {
    return this.getAtmosphereControls()?.miePhaseFunctionG ?? 0.8
  }

  set atmosphereMiePhaseFunctionG(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.miePhaseFunctionG = value
  }

  /**
   * 臭氧等吸收介质的消光系数缩放。
   *
   * Scale for absorption extinction, such as ozone absorption.
   */
  get atmosphereAbsorptionExtinctionScale() {
    return this.getAtmosphereControls()?.absorptionExtinctionScale ?? 1
  }

  set atmosphereAbsorptionExtinctionScale(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.absorptionExtinctionScale = value
  }

  /**
   * 大气模型里的平均地表反照率，范围 `0` 到 `1`。
   *
   * Average ground albedo in the atmosphere model from `0` to `1`.
   */
  get atmosphereGroundAlbedo() {
    return this.getAtmosphereControls()?.groundAlbedo ?? 0.1
  }

  set atmosphereGroundAlbedo(value: number) {
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.groundAlbedo = value
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
