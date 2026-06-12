/**
 * 大气光照模式。
 *
 * `post-process` 使用 Takram 的空气透视后处理光照；`light-source` 使用
 * Takram 的 Three.js 光源近似光照。
 *
 * Atmosphere lighting mode.
 *
 * `post-process` uses Takram aerial-perspective post-process lighting;
 * `light-source` uses Takram Three.js light sources as an approximation.
 */
export const AtmosphereLightingMode = {
  PostProcess: 'post-process',
  LightSource: 'light-source'
} as const

export type AtmosphereLightingMode = (typeof AtmosphereLightingMode)[keyof typeof AtmosphereLightingMode]

/**
 * 基础地球表面瓦片材质模式。
 *
 * `auto` 根据大气光照模式自动选择材质；
 * `basic` 使用不受 Three.js 光源影响的 `MeshBasicMaterial`；
 * `standard` 使用受光照影响的 `MeshStandardMaterial`。
 *
 * Base globe surface tile material mode.
 *
 * `auto` derives the material from the atmosphere lighting mode;
 * `basic` uses `MeshBasicMaterial` unaffected by Three.js lights;
 * `standard` uses lit `MeshStandardMaterial`.
 */
export type SurfaceMaterialMode = 'auto' | 'basic' | 'standard'

/**
 * 体积云质量档位。
 *
 * Volumetric cloud quality preset.
 */
export type CloudQualityPreset = 'low' | 'medium' | 'high' | 'ultra'

/**
 * Viewer 场景配置。
 *
 * Viewer scene options.
 */
export interface ViewerSceneOptions {
  /** 大气、天空和光照配置。Atmosphere, sky, and lighting options. */
  atmosphere?: ViewerAtmosphereOptions
  /** 体积云配置。Volumetric cloud options. */
  clouds?: ViewerCloudOptions
  /** 地表渲染配置。Surface rendering options. */
  surface?: ViewerSurfaceOptions
  /** 后处理配置。Post-processing options. */
  postProcess?: ViewerPostProcessOptions
}

/**
 * Viewer 大气配置。
 *
 * Viewer atmosphere options.
 */
export interface ViewerAtmosphereOptions {
  /** 是否启用大气天空和空气透视，默认 `true`。Enables atmospheric sky and aerial perspective. Defaults to `true`. */
  show?: boolean
  /** 大气光照配置。Atmospheric lighting options. */
  lighting?: ViewerAtmosphereLightingOptions
  /** 夜间光照配置。Nighttime lighting options. */
  night?: ViewerAtmosphereNightOptions
  /** 空气散射配置。Atmospheric scattering options. */
  scattering?: ViewerAtmosphereScatteringOptions
  /** 天空元素配置。Sky element options. */
  sky?: ViewerAtmosphereSkyOptions
  /** 云影和大气阴影配置。Cloud shadow and atmosphere shadow options. */
  shadow?: ViewerAtmosphereShadowOptions
  /** 夜间兜底环境光配置。Nighttime fallback ambient light options. */
  fallbackAmbientLight?: ViewerFallbackAmbientLightOptions
}

/**
 * Viewer 大气光照配置。
 *
 * Viewer atmosphere lighting options.
 */
export interface ViewerAtmosphereLightingOptions {
  /**
   * 大气光照模式，默认 `light-source`。
   *
   * Atmosphere lighting mode. Defaults to `light-source`.
   */
  mode?: AtmosphereLightingMode
  /** 是否应用太阳直射光照，默认 `true`。Applies direct sun irradiance. Defaults to `true`. */
  sunLight?: boolean
  /** 是否应用天空环境光照，默认 `true`。Applies sky irradiance. Defaults to `true`. */
  skyLight?: boolean
  /** 太阳光源辐射强度缩放，默认 `1`。Sun light source irradiance intensity scale. Defaults to `1`. */
  sunLightIntensity?: number
  /** 天空光探针辐射强度缩放，默认 `1`。Sky light probe irradiance intensity scale. Defaults to `1`. */
  skyLightIntensity?: number
  /**
   * 后处理光照的反照率缩放，默认 `1`。
   *
   * Albedo scale for post-process lighting. Defaults to `1`.
   */
  albedoScale?: number
}

/**
 * Viewer 夜间光照配置。
 *
 * Viewer nighttime lighting options.
 */
export interface ViewerAtmosphereNightOptions {
  /** 是否启用自动夜间光照，默认 `true`。Enables automatic nighttime lighting. Defaults to `true`. */
  enabled?: boolean
  /** 是否启用月光照明，默认 `true`。Enables moonlight illumination. Defaults to `true`. */
  moonLight?: boolean
  /** 是否启用冷色环境补光，默认 `true`。Enables cool ambient fill light. Defaults to `true`. */
  ambientLight?: boolean
  /** 夜间光照颜色，默认 `0x9bbcff`。Nighttime light color. Defaults to `0x9bbcff`. */
  color?: import('three').ColorRepresentation
  /** 月光最大强度，默认 `0.18`。Maximum moonlight intensity. Defaults to `0.18`. */
  moonLightIntensity?: number
  /** 夜间环境补光最大强度，默认 `0.08`。Maximum nighttime ambient fill intensity. Defaults to `0.08`. */
  ambientIntensity?: number
  /** 是否按月相衰减月光强度，默认 `true`。Attenuates moonlight by moon phase. Defaults to `true`. */
  useMoonPhase?: boolean
  /**
   * 昼夜过渡范围，基于本地地表法线与太阳方向点积，默认 `[-0.08, 0.05]`。
   *
   * Day/night transition range based on the dot product between the local
   * surface normal and sun direction. Defaults to `[-0.08, 0.05]`.
   */
  transitionRange?: [number, number]
}

/**
 * Viewer 空气散射配置。
 *
 * Viewer atmosphere scattering options.
 */
export interface ViewerAtmosphereScatteringOptions {
  /** 是否应用大气透射衰减，默认 `true`。Applies atmospheric transmittance attenuation. Defaults to `true`. */
  transmittance?: boolean
  /** 是否应用进入视线的空气散射光，默认 `true`。Applies atmospheric in-scattered light. Defaults to `true`. */
  inscatter?: boolean
  /** 空气散射强度，范围 `0` 到 `1`，默认 `0.6`。Atmospheric in-scattering intensity from `0` to `1`. Defaults to `0.6`. */
  intensity?: number
  /** 是否按地平线和球体边缘混合空气散射，默认 `true`。Blends in-scattering by horizon and globe edge. Defaults to `true`. */
  horizonBlend?: boolean
  /** 空气散射地平线混合范围，默认 `[0, 0.6]`。Horizon blend range for in-scattering. Defaults to `[0, 0.6]`. */
  horizonRange?: [number, number]
  /** 是否修正相机高度和椭球高度误差，默认 `true`。Corrects camera altitude against the atmosphere ellipsoid. Defaults to `true`. */
  correctAltitude?: boolean
  /** 是否修正地表瓦片几何误差导致的光照伪影，默认 `true`。Corrects lighting artifacts caused by surface tile geometric error. Defaults to `true`. */
  correctGeometricError?: boolean
  /** 太阳入射光谱强度缩放，默认 `1`。Scale for top-of-atmosphere solar spectral irradiance. Defaults to `1`. */
  solarIrradianceScale?: number
  /** 瑞利散射系数缩放，默认 `1`。Scale for Rayleigh scattering coefficients. Defaults to `1`. */
  rayleighScatteringScale?: number
  /** 米氏散射系数缩放，默认 `1`。Scale for Mie scattering coefficients. Defaults to `1`. */
  mieScatteringScale?: number
  /** 米氏消光系数缩放，默认 `1`。Scale for Mie extinction coefficients. Defaults to `1`. */
  mieExtinctionScale?: number
  /** 米氏相函数不对称因子，默认 `0.8`。Mie phase function asymmetry factor. Defaults to `0.8`. */
  miePhaseFunctionG?: number
  /** 臭氧等吸收介质的消光系数缩放，默认 `1`。Scale for absorption extinction. Defaults to `1`. */
  absorptionExtinctionScale?: number
  /** 大气模型里的平均地表反照率，默认 `0.1`。Average ground albedo in the atmosphere model. Defaults to `0.1`. */
  groundAlbedo?: number
}

/**
 * Viewer 大气天空元素配置。
 *
 * Viewer atmospheric sky element options.
 */
export interface ViewerAtmosphereSkyOptions {
  /** 是否启用星空，默认 `true`。Enables the star field. Defaults to `true`. */
  stars?: boolean
  /** 星空亮度缩放，默认 `1`。Star field brightness scale. Defaults to `1`. */
  starsIntensity?: number
  /** 星点大小（像素点），默认 `1`。Star point size in pixels. Defaults to `1`. */
  starsPointSize?: number
  /** 是否在天空中绘制太阳盘，默认 `true`。Renders the sun disc in the sky. Defaults to `true`. */
  sun?: boolean
  /** 是否在天空中绘制月亮，默认 `true`。Renders the moon in the sky. Defaults to `true`. */
  moon?: boolean
  /** 是否绘制大气天空里的地面，默认 `true`。Renders the ground term in the atmospheric sky. Defaults to `true`. */
  ground?: boolean
  /** 太阳角半径（弧度），默认 `0.004675`。Sun angular radius in radians. Defaults to `0.004675`. */
  sunAngularRadius?: number
  /** 月亮角半径（弧度），默认 `0.0045`。Moon angular radius in radians. Defaults to `0.0045`. */
  moonAngularRadius?: number
  /** 月光辐射亮度缩放，默认 `1`。Lunar radiance scale. Defaults to `1`. */
  lunarRadianceScale?: number
}

/**
 * Viewer 大气阴影配置。
 *
 * Viewer atmosphere shadow options.
 */
export interface ViewerAtmosphereShadowOptions {
  /** 云影采样的屏幕模糊半径，默认 `3`。Screen-space blur radius for cloud shadow sampling. Defaults to `3`. */
  radius?: number
  /** 云影 PCF 采样数量，范围 `1` 到 `16`，默认 `8`。Cloud shadow PCF sample count from `1` to `16`. Defaults to `8`. */
  sampleCount?: number
}

/**
 * Viewer 夜间兜底环境光配置。
 *
 * Viewer nighttime fallback ambient light options.
 */
export interface ViewerFallbackAmbientLightOptions {
  /** 是否启用夜间兜底环境光，默认 `true`。Enables the nighttime fallback ambient light. Defaults to `true`. */
  show?: boolean
  /** 夜间兜底环境光最大强度，默认 `0.5`。Nighttime fallback ambient light maximum intensity. Defaults to `0.5`. */
  intensity?: number
}

/**
 * Viewer 体积云配置。
 *
 * Viewer volumetric cloud options.
 */
export interface ViewerCloudOptions {
  /** 是否启用体积云，默认 `true`。Enables volumetric clouds. Defaults to `true`. */
  show?: boolean
  /** 体积云质量档位。Volumetric cloud quality preset. */
  quality?: CloudQualityPreset
  /** 是否启用体积云光柱，默认 `true`。Enables volumetric cloud light shafts. Defaults to `true`. */
  lightShafts?: boolean
  /** 云覆盖率，范围 `0` 到 `1`，默认 `0.3`。Cloud coverage from `0` to `1`. Defaults to `0.3`. */
  coverage?: number
  /** 体积云天气纹理的水平运动速度，单位为 UV 偏移/秒，默认 `0.001`。Horizontal motion speed for the volumetric cloud weather texture. Defaults to `0.001`. */
  speed?: number
  /** 低云层组配置。Low cloud layer group options. */
  layer?: ViewerCloudLayerOptions
}

/**
 * Viewer 低云层组配置。
 *
 * Viewer low cloud layer group options.
 */
export interface ViewerCloudLayerOptions {
  /** 低云层组云底高度（米），默认 `1500`。Base altitude of the low cloud layer group in meters. Defaults to `1500`. */
  altitude?: number
  /** 低云层组厚度（米），默认 `650`。Height of the low cloud layer group in meters. Defaults to `650`. */
  height?: number
}

/**
 * Viewer 地表渲染配置。
 *
 * Viewer surface rendering options.
 */
export interface ViewerSurfaceOptions {
  /**
   * 基础地球表面瓦片材质模式，默认 `auto`。
   *
   * Base globe surface tile material mode. Defaults to `auto`.
   */
  materialMode?: SurfaceMaterialMode
}

/**
 * Viewer 后处理配置。
 *
 * Viewer post-processing options.
 */
export interface ViewerPostProcessOptions {
  /** 是否启用镜头光晕后处理，默认 `true`。Enables lens flare post-processing. Defaults to `true`. */
  lensFlare?: boolean
  /** 是否启用 SMAA 抗锯齿后处理，默认 `true`。Enables SMAA anti-aliasing post-processing. Defaults to `true`. */
  smaa?: boolean
  /** 是否启用抖动后处理，默认 `false`。Enables dithering post-processing. Defaults to `false`. */
  dithering?: boolean
  /** 渲染器色调映射曝光值，默认 `10`。Renderer tone mapping exposure. Defaults to `10`. */
  toneMappingExposure?: number
}
