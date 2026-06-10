import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import type { AtmosphereRuntimeControls } from './rendering/AtmosphereManager'
import type { AtmosphereLightingMode, CloudQualityPreset, SurfaceMaterialMode } from './types'

const FALLBACK_AMBIENT_LIGHT_MIN_HEIGHT = 8000
const FALLBACK_AMBIENT_LIGHT_MAX_HEIGHT = 7600000
const DEFAULT_CLOUD_SPEED = 0.001
const DEFAULT_CLOUD_LAYER_ALTITUDE = 1500
const DEFAULT_CLOUD_LAYER_HEIGHT = 650

export interface ResolvedSceneOptions {
  atmosphere: {
    show: boolean
    lighting: {
      mode: AtmosphereLightingMode
      sunLight: boolean
      skyLight: boolean
      sunLightIntensity: number
      skyLightIntensity: number
      albedoScale: number
    }
    scattering: {
      transmittance: boolean
      inscatter: boolean
      intensity: number
      horizonBlend: boolean
      horizonRange: [number, number]
      correctAltitude: boolean
      correctGeometricError: boolean
      solarIrradianceScale: number
      rayleighScatteringScale: number
      mieScatteringScale: number
      mieExtinctionScale: number
      miePhaseFunctionG: number
      absorptionExtinctionScale: number
      groundAlbedo: number
    }
    sky: {
      stars: boolean
      starsIntensity: number
      starsPointSize: number
      sun: boolean
      moon: boolean
      ground: boolean
      sunAngularRadius: number
      moonAngularRadius: number
      lunarRadianceScale: number
    }
    shadow: {
      radius: number
      sampleCount: number
    }
    fallbackAmbientLight: {
      show: boolean
      intensity: number
    }
  }
  clouds: {
    show: boolean
    quality: CloudQualityPreset | undefined
    coverage: number
    speed: number
    layer: {
      altitude: number
      height: number
    }
  }
  surface: {
    materialMode: SurfaceMaterialMode
  }
  postProcess: {
    lensFlare: boolean
    smaa: boolean
    dithering: boolean
    toneMappingExposure: number
  }
}

class SceneToggle {
  private isShown: boolean
  private readonly onChange: () => void

  constructor(isShown: boolean, onChange: () => void) {
    this.isShown = isShown
    this.onChange = onChange
  }

  /**
   * 是否显示。
   *
   * Whether this item is shown.
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

export class PostProcessControls {
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  readonly lensFlare: PostProcessStage
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  readonly smaa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  readonly dithering: PostProcessStage

  constructor(options: ResolvedSceneOptions['postProcess'], onChange: () => void) {
    this.lensFlare = new PostProcessStage(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa, onChange)
    this.dithering = new PostProcessStage(options.dithering, onChange)
  }
}

export class SurfaceSceneControls {
  private currentMaterialMode: SurfaceMaterialMode
  private readonly onMaterialModeChange: () => void

  constructor(options: ResolvedSceneOptions['surface'], onMaterialModeChange: () => void) {
    this.currentMaterialMode = options.materialMode
    this.onMaterialModeChange = onMaterialModeChange
  }

  /**
   * 基础地球表面瓦片材质模式。
   *
   * `auto` 会根据大气光照模式选择材质。
   *
   * Base globe surface tile material mode.
   *
   * `auto` derives the material from the atmosphere lighting mode.
   */
  get materialMode() {
    return this.currentMaterialMode
  }

  set materialMode(value: SurfaceMaterialMode) {
    if (this.currentMaterialMode === value) return
    this.currentMaterialMode = value
    this.onMaterialModeChange()
  }
}

export class CloudSceneControls {
  private readonly visibility: SceneToggle
  private readonly getCloudsEffect: () => CloudsEffect | null
  private readonly onEffectsChange: () => void
  private readonly layerOffsets = [0, 250]
  private readonly layerHeightScales = [1, 1200 / 650]
  private currentQuality: CloudQualityPreset | undefined
  private currentCoverage: number
  private currentSpeed: number
  private currentLayerAltitude: number
  private currentLayerHeight: number

  constructor(
    options: ResolvedSceneOptions['clouds'],
    getCloudsEffect: () => CloudsEffect | null,
    onEffectsChange: () => void
  ) {
    this.getCloudsEffect = getCloudsEffect
    this.onEffectsChange = onEffectsChange
    this.visibility = new SceneToggle(options.show, onEffectsChange)
    this.currentQuality = options.quality
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
    this.currentQuality = value
    if (value === undefined) return

    const clouds = this.getCloudsEffect()
    if (clouds) {
      clouds.qualityPreset = value
      this.onEffectsChange()
    }
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
    this.currentCoverage = value
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.coverage = value
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
    this.currentSpeed = toNonNegativeFinite(value, DEFAULT_CLOUD_SPEED)
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.localWeatherVelocity.set(this.currentSpeed, 0)
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
    this.currentLayerAltitude = value
    this.updateLowCloudLayers()
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
    this.currentLayerHeight = value
    this.updateLowCloudLayers()
  }

  apply() {
    this.quality = this.currentQuality
    this.coverage = this.currentCoverage
    this.speed = this.currentSpeed
    this.updateLowCloudLayers()
  }

  private updateLowCloudLayers() {
    const clouds = this.getCloudsEffect()
    if (!clouds) return

    this.layerOffsets.forEach((offset, index) => {
      const layer = clouds.cloudLayers[index]
      if (!layer) return

      layer.altitude = this.currentLayerAltitude + offset
      layer.height = this.currentLayerHeight * this.layerHeightScales[index]
    })
  }
}

export class AtmosphereLightingControls {
  private readonly getAtmosphereControls: () => AtmosphereRuntimeControls | null
  private readonly onEffectsChange: () => void
  private readonly onSurfaceMaterialModeChange: () => void

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['lighting'],
    getAtmosphereControls: () => AtmosphereRuntimeControls | null,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.getAtmosphereControls = getAtmosphereControls
    this.onEffectsChange = onEffectsChange
    this.onSurfaceMaterialModeChange = onSurfaceMaterialModeChange
  }

  /** 大气光照模式。Atmosphere lighting mode. */
  get mode() {
    return this.getAtmosphereControls()?.lightingMode ?? this.options.mode
  }

  set mode(value: AtmosphereLightingMode) {
    this.options.mode = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.lightingMode !== value) {
      atmosphere.lightingMode = value
      this.onEffectsChange()
      this.onSurfaceMaterialModeChange()
    }
  }

  /** 是否应用太阳直射光照。Applies direct sun irradiance. */
  get sunLight() {
    return this.getAtmosphereControls()?.sunLight ?? this.options.sunLight
  }

  set sunLight(value: boolean) {
    this.options.sunLight = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.sunLight !== value) {
      atmosphere.sunLight = value
      this.onEffectsChange()
    }
  }

  /** 是否应用天空环境光照。Applies sky irradiance. */
  get skyLight() {
    return this.getAtmosphereControls()?.skyLight ?? this.options.skyLight
  }

  set skyLight(value: boolean) {
    this.options.skyLight = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere && atmosphere.skyLight !== value) {
      atmosphere.skyLight = value
      this.onEffectsChange()
    }
  }

  /** 太阳光源辐射强度缩放。Sun light source irradiance intensity scale. */
  get sunLightIntensity() {
    return this.getAtmosphereControls()?.sunLightIntensity ?? this.options.sunLightIntensity
  }

  set sunLightIntensity(value: number) {
    this.options.sunLightIntensity = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.sunLightIntensity = value
  }

  /** 天空光探针辐射强度缩放。Sky light probe irradiance intensity scale. */
  get skyLightIntensity() {
    return this.getAtmosphereControls()?.skyLightIntensity ?? this.options.skyLightIntensity
  }

  set skyLightIntensity(value: number) {
    this.options.skyLightIntensity = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.skyLightIntensity = value
  }

  /** 后处理光照使用的反照率缩放。Albedo scale used by post-process lighting. */
  get albedoScale() {
    return this.getAtmosphereControls()?.albedoScale ?? this.options.albedoScale
  }

  set albedoScale(value: number) {
    this.options.albedoScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.albedoScale = value
  }

  apply() {
    this.mode = this.options.mode
    this.sunLight = this.options.sunLight
    this.skyLight = this.options.skyLight
    this.sunLightIntensity = this.options.sunLightIntensity
    this.skyLightIntensity = this.options.skyLightIntensity
    this.albedoScale = this.options.albedoScale
  }
}

export class AtmosphereScatteringControls {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['scattering'],
    private readonly getAtmosphereControls: () => AtmosphereRuntimeControls | null
  ) {}

  /** 是否应用大气透射衰减。Applies atmospheric transmittance attenuation. */
  get transmittance() {
    return this.getAtmosphereControls()?.transmittance ?? this.options.transmittance
  }

  set transmittance(value: boolean) {
    this.options.transmittance = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.transmittance = value
  }

  /** 是否应用进入视线的空气散射光。Applies atmospheric in-scattered light. */
  get inscatter() {
    return this.getAtmosphereControls()?.inscatter ?? this.options.inscatter
  }

  set inscatter(value: boolean) {
    this.options.inscatter = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.inscatter = value
  }

  /** 空气散射强度。Atmospheric in-scattering intensity. */
  get intensity() {
    return this.options.intensity
  }

  set intensity(value: number) {
    this.options.intensity = THREE.MathUtils.clamp(value, 0, 1)
  }

  /** 是否按地平线和球体边缘混合空气散射。Blends atmospheric in-scattering by horizon and globe edge. */
  get horizonBlend() {
    return this.options.horizonBlend
  }

  set horizonBlend(value: boolean) {
    this.options.horizonBlend = value
  }

  /** 空气散射地平线混合范围。Horizon blend range for in-scattering. */
  get horizonRange(): [number, number] {
    return [...this.options.horizonRange]
  }

  set horizonRange(value: [number, number]) {
    this.options.horizonRange = [...value]
  }

  /** 是否修正相机高度和椭球高度误差。Corrects camera altitude against the atmosphere ellipsoid. */
  get correctAltitude() {
    return this.getAtmosphereControls()?.correctAltitude ?? this.options.correctAltitude
  }

  set correctAltitude(value: boolean) {
    this.options.correctAltitude = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.correctAltitude = value
  }

  /** 是否修正地表瓦片几何误差导致的光照伪影。Corrects lighting artifacts caused by surface tile geometric error. */
  get correctGeometricError() {
    return this.getAtmosphereControls()?.correctGeometricError ?? this.options.correctGeometricError
  }

  set correctGeometricError(value: boolean) {
    this.options.correctGeometricError = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.correctGeometricError = value
  }

  /** 太阳入射光谱强度缩放。Scale for top-of-atmosphere solar spectral irradiance. */
  get solarIrradianceScale() {
    return this.getAtmosphereControls()?.solarIrradianceScale ?? this.options.solarIrradianceScale
  }

  set solarIrradianceScale(value: number) {
    this.options.solarIrradianceScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.solarIrradianceScale = value
  }

  /** 瑞利散射系数缩放。Scale for Rayleigh scattering coefficients. */
  get rayleighScatteringScale() {
    return this.getAtmosphereControls()?.rayleighScatteringScale ?? this.options.rayleighScatteringScale
  }

  set rayleighScatteringScale(value: number) {
    this.options.rayleighScatteringScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.rayleighScatteringScale = value
  }

  /** 米氏散射系数缩放。Scale for Mie scattering coefficients. */
  get mieScatteringScale() {
    return this.getAtmosphereControls()?.mieScatteringScale ?? this.options.mieScatteringScale
  }

  set mieScatteringScale(value: number) {
    this.options.mieScatteringScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.mieScatteringScale = value
  }

  /** 米氏消光系数缩放。Scale for Mie extinction coefficients. */
  get mieExtinctionScale() {
    return this.getAtmosphereControls()?.mieExtinctionScale ?? this.options.mieExtinctionScale
  }

  set mieExtinctionScale(value: number) {
    this.options.mieExtinctionScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.mieExtinctionScale = value
  }

  /** 米氏相函数不对称因子。Mie phase function asymmetry factor. */
  get miePhaseFunctionG() {
    return this.getAtmosphereControls()?.miePhaseFunctionG ?? this.options.miePhaseFunctionG
  }

  set miePhaseFunctionG(value: number) {
    this.options.miePhaseFunctionG = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.miePhaseFunctionG = value
  }

  /** 臭氧等吸收介质的消光系数缩放。Scale for absorption extinction. */
  get absorptionExtinctionScale() {
    return this.getAtmosphereControls()?.absorptionExtinctionScale ?? this.options.absorptionExtinctionScale
  }

  set absorptionExtinctionScale(value: number) {
    this.options.absorptionExtinctionScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.absorptionExtinctionScale = value
  }

  /** 大气模型里的平均地表反照率。Average ground albedo in the atmosphere model. */
  get groundAlbedo() {
    return this.getAtmosphereControls()?.groundAlbedo ?? this.options.groundAlbedo
  }

  set groundAlbedo(value: number) {
    this.options.groundAlbedo = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.groundAlbedo = value
  }

  apply() {
    this.transmittance = this.options.transmittance
    this.inscatter = this.options.inscatter
    this.correctAltitude = this.options.correctAltitude
    this.correctGeometricError = this.options.correctGeometricError
    this.solarIrradianceScale = this.options.solarIrradianceScale
    this.rayleighScatteringScale = this.options.rayleighScatteringScale
    this.mieScatteringScale = this.options.mieScatteringScale
    this.mieExtinctionScale = this.options.mieExtinctionScale
    this.miePhaseFunctionG = this.options.miePhaseFunctionG
    this.absorptionExtinctionScale = this.options.absorptionExtinctionScale
    this.groundAlbedo = this.options.groundAlbedo
  }
}

export class AtmosphereSkyControls {
  readonly stars: SceneToggle

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['sky'],
    private readonly getAtmosphereControls: () => AtmosphereRuntimeControls | null
  ) {
    this.stars = new SceneToggle(options.stars, () => {
      const atmosphere = this.getAtmosphereControls()
      if (atmosphere) atmosphere.starsVisible = this.stars.show
    })
  }

  /** 星空亮度缩放。Star field brightness scale. */
  get starsIntensity() {
    return this.getAtmosphereControls()?.starsIntensity ?? this.options.starsIntensity
  }

  set starsIntensity(value: number) {
    this.options.starsIntensity = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.starsIntensity = value
  }

  /** 星点大小（像素点）。Star point size in pixels. */
  get starsPointSize() {
    return this.getAtmosphereControls()?.starsPointSize ?? this.options.starsPointSize
  }

  set starsPointSize(value: number) {
    this.options.starsPointSize = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.starsPointSize = value
  }

  /** 是否在天空中绘制太阳盘。Renders the sun disc in the sky. */
  get sun() {
    return this.getAtmosphereControls()?.sun ?? this.options.sun
  }

  set sun(value: boolean) {
    this.options.sun = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.sun = value
  }

  /** 是否在天空中绘制月亮。Renders the moon in the sky. */
  get moon() {
    return this.getAtmosphereControls()?.moon ?? this.options.moon
  }

  set moon(value: boolean) {
    this.options.moon = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.moon = value
  }

  /** 是否绘制大气天空里的地面。Renders the ground term in the atmospheric sky. */
  get ground() {
    return this.getAtmosphereControls()?.ground ?? this.options.ground
  }

  set ground(value: boolean) {
    this.options.ground = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.ground = value
  }

  /** 太阳角半径（弧度）。Sun angular radius in radians. */
  get sunAngularRadius() {
    return this.getAtmosphereControls()?.sunAngularRadius ?? this.options.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.options.sunAngularRadius = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.sunAngularRadius = value
  }

  /** 月亮角半径（弧度）。Moon angular radius in radians. */
  get moonAngularRadius() {
    return this.getAtmosphereControls()?.moonAngularRadius ?? this.options.moonAngularRadius
  }

  set moonAngularRadius(value: number) {
    this.options.moonAngularRadius = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.moonAngularRadius = value
  }

  /** 月光辐射亮度缩放。Lunar radiance scale. */
  get lunarRadianceScale() {
    return this.getAtmosphereControls()?.lunarRadianceScale ?? this.options.lunarRadianceScale
  }

  set lunarRadianceScale(value: number) {
    this.options.lunarRadianceScale = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.lunarRadianceScale = value
  }

  apply() {
    this.stars.show = this.options.stars
    this.starsIntensity = this.options.starsIntensity
    this.starsPointSize = this.options.starsPointSize
    this.sun = this.options.sun
    this.moon = this.options.moon
    this.ground = this.options.ground
    this.sunAngularRadius = this.options.sunAngularRadius
    this.moonAngularRadius = this.options.moonAngularRadius
    this.lunarRadianceScale = this.options.lunarRadianceScale
  }
}

export class AtmosphereShadowControls {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['shadow'],
    private readonly getAtmosphereControls: () => AtmosphereRuntimeControls | null
  ) {}

  /** 云影采样的屏幕模糊半径。Screen-space blur radius for cloud shadow sampling. */
  get radius() {
    return this.getAtmosphereControls()?.shadowRadius ?? this.options.radius
  }

  set radius(value: number) {
    this.options.radius = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.shadowRadius = value
  }

  /** 云影 PCF 采样数量，范围 `1` 到 `16`。Cloud shadow PCF sample count from `1` to `16`. */
  get sampleCount() {
    return this.getAtmosphereControls()?.shadowSampleCount ?? this.options.sampleCount
  }

  set sampleCount(value: number) {
    this.options.sampleCount = value
    const atmosphere = this.getAtmosphereControls()
    if (atmosphere) atmosphere.shadowSampleCount = value
  }

  apply() {
    this.radius = this.options.radius
    this.sampleCount = this.options.sampleCount
  }
}

export class FallbackAmbientLightControls {
  private currentIntensity: number

  constructor(
    options: ResolvedSceneOptions['atmosphere']['fallbackAmbientLight'],
    private readonly source: THREE.AmbientLight
  ) {
    this.source.visible = options.show
    this.currentIntensity = options.intensity
  }

  /** 是否启用夜间兜底环境光。Enables the nighttime fallback ambient light. */
  get show() {
    return this.source.visible
  }

  set show(value: boolean) {
    this.source.visible = value
  }

  /** 夜间兜底环境光强度。Nighttime fallback ambient light intensity. */
  get intensity() {
    return this.currentIntensity
  }

  set intensity(value: number) {
    this.currentIntensity = Math.max(0, Number.isFinite(value) ? value : 0.5)
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

export class AtmosphereSceneControls {
  readonly lighting: AtmosphereLightingControls
  readonly scattering: AtmosphereScatteringControls
  readonly sky: AtmosphereSkyControls
  readonly shadow: AtmosphereShadowControls
  readonly fallbackAmbientLight: FallbackAmbientLightControls
  private readonly visibility: SceneToggle

  constructor(
    options: ResolvedSceneOptions['atmosphere'],
    fallbackAmbientLightSource: THREE.AmbientLight,
    getAtmosphereControls: () => AtmosphereRuntimeControls | null,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.visibility = new SceneToggle(options.show, onEffectsChange)
    this.lighting = new AtmosphereLightingControls(
      options.lighting,
      getAtmosphereControls,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.scattering = new AtmosphereScatteringControls(options.scattering, getAtmosphereControls)
    this.sky = new AtmosphereSkyControls(options.sky, getAtmosphereControls)
    this.shadow = new AtmosphereShadowControls(options.shadow, getAtmosphereControls)
    this.fallbackAmbientLight = new FallbackAmbientLightControls(options.fallbackAmbientLight, fallbackAmbientLightSource)
  }

  /**
   * 大气天空和空气透视是否显示。
   *
   * Whether atmospheric sky and aerial perspective are shown.
   */
  get show() {
    return this.visibility.show
  }

  set show(value: boolean) {
    this.visibility.show = value
  }

  apply() {
    this.lighting.apply()
    this.scattering.apply()
    this.sky.apply()
    this.shadow.apply()
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
   * 大气、天空和光照控制项。
   *
   * Atmosphere, sky, and lighting controls.
   */
  readonly atmosphere: AtmosphereSceneControls
  /**
   * 体积云控制项。
   *
   * Volumetric cloud controls.
   */
  readonly clouds: CloudSceneControls
  /**
   * 地表渲染控制项。
   *
   * Surface rendering controls.
   */
  readonly surface: SurfaceSceneControls
  /**
   * 后处理阶段控制项。
   *
   * Post-processing stage controls.
   */
  readonly postProcess: PostProcessControls

  private readonly fallbackAmbientLightSource: THREE.AmbientLight

  constructor(
    options: ResolvedSceneOptions,
    getCloudsEffect: () => CloudsEffect | null,
    getAtmosphereControls: () => AtmosphereRuntimeControls | null,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.fallbackAmbientLightSource = new THREE.AmbientLight(0xffffff, 0)
    this.atmosphere = new AtmosphereSceneControls(
      options.atmosphere,
      this.fallbackAmbientLightSource,
      getAtmosphereControls,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.clouds = new CloudSceneControls(options.clouds, getCloudsEffect, onEffectsChange)
    this.surface = new SurfaceSceneControls(options.surface, onSurfaceMaterialModeChange)
    this.postProcess = new PostProcessControls(options.postProcess, onEffectsChange)
    this.threeScene.add(this.fallbackAmbientLightSource)
  }

  /**
   * 将已缓存的场景控制项同步到底层大气和云效果。
   *
   * Synchronizes cached scene controls to the underlying atmosphere and cloud
   * effects.
   */
  syncRuntimeEffects() {
    this.atmosphere.apply()
    this.clouds.apply()
  }

  /**
   * 根据当前相机高度更新夜间兜底环境光的实际强度。
   *
   * Updates the actual nighttime fallback ambient light intensity from the
   * current camera height.
   */
  updateFallbackAmbientLight(currentHeight: number) {
    this.atmosphere.fallbackAmbientLight.update(currentHeight)
  }
}

function toNonNegativeFinite(value: number, fallback: number) {
  return Math.max(0, Number.isFinite(value) ? value : fallback)
}
