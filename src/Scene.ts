import * as THREE from 'three'
import type { AtmosphereRuntimeState, CloudRuntimeState } from './rendering/AtmosphereManager'
import type { AtmosphereLightingMode, CloudQualityPreset, SurfaceMaterialMode } from './types'

const FALLBACK_AMBIENT_LIGHT_MIN_HEIGHT = 8000
const FALLBACK_AMBIENT_LIGHT_MAX_HEIGHT = 7600000
const DEFAULT_CLOUD_SPEED = 0.001
const DEFAULT_CLOUD_LAYER_ALTITUDE = 1500
const DEFAULT_CLOUD_LAYER_HEIGHT = 650

type AtmosphereStateApplier = (state: AtmosphereRuntimeState) => void
type CloudStateApplier = (state: CloudRuntimeState) => void

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
  private readonly applyCloudsState: CloudStateApplier
  private readonly onEffectsChange: () => void
  private currentQuality: CloudQualityPreset | undefined
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
      coverage: this.currentCoverage,
      speed: this.currentSpeed,
      layerAltitude: this.currentLayerAltitude,
      layerHeight: this.currentLayerHeight
    }
  }
}

export class AtmosphereLightingControls {
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

export class AtmosphereScatteringControls {
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
    this.options.intensity = THREE.MathUtils.clamp(value, 0, 1)
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
    this.options.horizonRange = [...value]
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
    this.options.solarIrradianceScale = value
    this.onStateChange()
  }

  /** 瑞利散射系数缩放。Scale for Rayleigh scattering coefficients. */
  get rayleighScatteringScale() {
    return this.options.rayleighScatteringScale
  }

  set rayleighScatteringScale(value: number) {
    this.options.rayleighScatteringScale = value
    this.onStateChange()
  }

  /** 米氏散射系数缩放。Scale for Mie scattering coefficients. */
  get mieScatteringScale() {
    return this.options.mieScatteringScale
  }

  set mieScatteringScale(value: number) {
    this.options.mieScatteringScale = value
    this.onStateChange()
  }

  /** 米氏消光系数缩放。Scale for Mie extinction coefficients. */
  get mieExtinctionScale() {
    return this.options.mieExtinctionScale
  }

  set mieExtinctionScale(value: number) {
    this.options.mieExtinctionScale = value
    this.onStateChange()
  }

  /** 米氏相函数不对称因子。Mie phase function asymmetry factor. */
  get miePhaseFunctionG() {
    return this.options.miePhaseFunctionG
  }

  set miePhaseFunctionG(value: number) {
    this.options.miePhaseFunctionG = value
    this.onStateChange()
  }

  /** 臭氧等吸收介质的消光系数缩放。Scale for absorption extinction. */
  get absorptionExtinctionScale() {
    return this.options.absorptionExtinctionScale
  }

  set absorptionExtinctionScale(value: number) {
    this.options.absorptionExtinctionScale = value
    this.onStateChange()
  }

  /** 大气模型里的平均地表反照率。Average ground albedo in the atmosphere model. */
  get groundAlbedo() {
    return this.options.groundAlbedo
  }

  set groundAlbedo(value: number) {
    this.options.groundAlbedo = value
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}

export class AtmosphereSkyControls {
  readonly stars: SceneToggle

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['sky'],
    private readonly onStateChange: () => void
  ) {
    this.stars = new SceneToggle(options.stars, onStateChange)
  }

  /** 星空亮度缩放。Star field brightness scale. */
  get starsIntensity() {
    return this.options.starsIntensity
  }

  set starsIntensity(value: number) {
    this.options.starsIntensity = value
    this.onStateChange()
  }

  /** 星点大小（像素点）。Star point size in pixels. */
  get starsPointSize() {
    return this.options.starsPointSize
  }

  set starsPointSize(value: number) {
    this.options.starsPointSize = value
    this.onStateChange()
  }

  /** 是否在天空中绘制太阳盘。Renders the sun disc in the sky. */
  get sun() {
    return this.options.sun
  }

  set sun(value: boolean) {
    this.options.sun = value
    this.onStateChange()
  }

  /** 是否在天空中绘制月亮。Renders the moon in the sky. */
  get moon() {
    return this.options.moon
  }

  set moon(value: boolean) {
    this.options.moon = value
    this.onStateChange()
  }

  /** 是否绘制大气天空里的地面。Renders the ground term in the atmospheric sky. */
  get ground() {
    return this.options.ground
  }

  set ground(value: boolean) {
    this.options.ground = value
    this.onStateChange()
  }

  /** 太阳角半径（弧度）。Sun angular radius in radians. */
  get sunAngularRadius() {
    return this.options.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.options.sunAngularRadius = value
    this.onStateChange()
  }

  /** 月亮角半径（弧度）。Moon angular radius in radians. */
  get moonAngularRadius() {
    return this.options.moonAngularRadius
  }

  set moonAngularRadius(value: number) {
    this.options.moonAngularRadius = value
    this.onStateChange()
  }

  /** 月光辐射亮度缩放。Lunar radiance scale. */
  get lunarRadianceScale() {
    return this.options.lunarRadianceScale
  }

  set lunarRadianceScale(value: number) {
    this.options.lunarRadianceScale = value
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}

export class AtmosphereShadowControls {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['shadow'],
    private readonly onStateChange: () => void
  ) {}

  /** 云影采样的屏幕模糊半径。Screen-space blur radius for cloud shadow sampling. */
  get radius() {
    return this.options.radius
  }

  set radius(value: number) {
    this.options.radius = value
    this.onStateChange()
  }

  /** 云影 PCF 采样数量，范围 `1` 到 `16`。Cloud shadow PCF sample count from `1` to `16`. */
  get sampleCount() {
    return this.options.sampleCount
  }

  set sampleCount(value: number) {
    this.options.sampleCount = value
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
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
    private readonly applyAtmosphereState: AtmosphereStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    const onStateChange = () => {
      this.apply()
    }
    this.visibility = new SceneToggle(options.show, onEffectsChange)
    this.lighting = new AtmosphereLightingControls(
      options.lighting,
      onStateChange,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.scattering = new AtmosphereScatteringControls(options.scattering, onStateChange)
    this.sky = new AtmosphereSkyControls(options.sky, onStateChange)
    this.shadow = new AtmosphereShadowControls(options.shadow, onStateChange)
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
    this.applyAtmosphereState(this.getRuntimeState())
  }

  private getRuntimeState(): AtmosphereRuntimeState {
    return {
      inscatterIntensity: this.scattering.intensity,
      inscatterHorizonBlend: this.scattering.horizonBlend,
      inscatterHorizonRange: this.scattering.horizonRange,
      correctAltitude: this.scattering.correctAltitude,
      correctGeometricError: this.scattering.correctGeometricError,
      transmittance: this.scattering.transmittance,
      inscatter: this.scattering.inscatter,
      lightingMode: this.lighting.mode,
      sunLight: this.lighting.sunLight,
      skyLight: this.lighting.skyLight,
      sunLightIntensity: this.lighting.sunLightIntensity,
      skyLightIntensity: this.lighting.skyLightIntensity,
      sun: this.sky.sun,
      moon: this.sky.moon,
      ground: this.sky.ground,
      albedoScale: this.lighting.albedoScale,
      sunAngularRadius: this.sky.sunAngularRadius,
      moonAngularRadius: this.sky.moonAngularRadius,
      lunarRadianceScale: this.sky.lunarRadianceScale,
      shadowRadius: this.shadow.radius,
      shadowSampleCount: this.shadow.sampleCount,
      starsVisible: this.sky.stars.show,
      starsIntensity: this.sky.starsIntensity,
      starsPointSize: this.sky.starsPointSize,
      solarIrradianceScale: this.scattering.solarIrradianceScale,
      rayleighScatteringScale: this.scattering.rayleighScatteringScale,
      mieScatteringScale: this.scattering.mieScatteringScale,
      mieExtinctionScale: this.scattering.mieExtinctionScale,
      miePhaseFunctionG: this.scattering.miePhaseFunctionG,
      absorptionExtinctionScale: this.scattering.absorptionExtinctionScale,
      groundAlbedo: this.scattering.groundAlbedo
    }
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
    applyAtmosphereState: AtmosphereStateApplier,
    applyCloudsState: CloudStateApplier,
    onEffectsChange: () => void,
    onSurfaceMaterialModeChange: () => void
  ) {
    this.fallbackAmbientLightSource = new THREE.AmbientLight(0xffffff, 0)
    this.atmosphere = new AtmosphereSceneControls(
      options.atmosphere,
      this.fallbackAmbientLightSource,
      applyAtmosphereState,
      onEffectsChange,
      onSurfaceMaterialModeChange
    )
    this.clouds = new CloudSceneControls(options.clouds, applyCloudsState, onEffectsChange)
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
