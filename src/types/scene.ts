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
 * 基础地球表面 PBR 材质参数。
 *
 * 这些参数只作用于 Viewer 管理的基础地球表面和 terrain，不影响
 * `tilesets.add` 或 `models.add` 加载的普通场景内容。
 *
 * Base globe surface PBR material options.
 *
 * These options only affect the base globe surface and terrain managed by the
 * Viewer. They do not affect regular scene content loaded with `tilesets.add`
 * or `models.add`.
 */
export interface ViewerSurfaceMaterialOptions {
  /** 表面粗糙度，范围 `0` 到 `1`，默认 `1`。Surface roughness from `0` to `1`. Defaults to `1`. */
  roughness?: number
  /** 表面金属度，范围 `0` 到 `1`，默认 `0`。Surface metalness from `0` to `1`. Defaults to `0`. */
  metalness?: number
  /**
   * 是否沿用地形或上游材质提供的粗糙度贴图，默认 `false`。
   *
   * 关闭后会忽略 terrain watermask 等粗糙度贴图，避免 `light-source`
   * 模式下出现强太阳镜面反光。
   *
   * Whether to keep roughness maps provided by terrain or upstream materials.
   * Defaults to `false`.
   *
   * When disabled, roughness maps such as terrain water masks are ignored to
   * avoid strong sun glints in `light-source` mode.
   */
  useRoughnessMap?: boolean
}

/**
 * 体积云质量档位。
 *
 * Volumetric cloud quality preset.
 */
export type CloudQualityPreset = 'low' | 'medium' | 'high' | 'ultra'

/**
 * 体积云云影质量档位。
 *
 * Volumetric cloud shadow quality preset.
 */
export type CloudShadowQuality = 'low' | 'medium' | 'high'

/**
 * 镜头光晕质量档位。
 *
 * Lens flare quality preset.
 */
export type LensFlareQuality = 'low' | 'medium' | 'high'

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
  /** 实体渲染配置。Entity rendering options. */
  entities?: ViewerEntityOptions
  /** 地表渲染配置。Surface rendering options. */
  surface?: ViewerSurfaceOptions
}

/**
 * 实体透明渲染模式。
 *
 * `auto` 在 WebGL 支持时使用 weighted OIT，否则退回排序透明；
 * `weighted-oit` 强制使用 weighted blended order-independent transparency；
 * `sorted` 使用 Three.js 默认透明排序。
 *
 * Entity transparency rendering mode.
 *
 * `auto` uses weighted OIT when WebGL support is available and falls back to
 * sorted transparency otherwise; `weighted-oit` forces weighted blended
 * order-independent transparency; `sorted` uses Three.js default transparent
 * sorting.
 */
export type EntityTransparencyMode = 'auto' | 'weighted-oit' | 'sorted'

/**
 * 实体透明渲染配置。
 *
 * Entity transparency rendering options.
 */
export interface ViewerEntityTransparencyOptions {
  /**
   * 透明渲染模式，默认 `auto`。与运行时 `viewer.scene.entities.transparency.mode` 同构。
   *
   * Transparency rendering mode. Defaults to `auto`. Isomorphic with runtime
   * `viewer.scene.entities.transparency.mode`.
   */
  mode?: EntityTransparencyMode
}

/**
 * Viewer 实体配置。
 *
 * Viewer entity options.
 */
export interface ViewerEntityOptions {
  /** 透明渲染配置。Entity transparency rendering options. */
  transparency?: ViewerEntityTransparencyOptions
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
   * 大气光照模式，默认 `post-process`。
   *
   * Atmosphere lighting mode. Defaults to `post-process`.
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
  /**
   * 光度单位。启用后太阳用正午 lux 锚（默认 111000）映射 Takram 强度缩放。
   * 只缩放太阳，不会改点光或自发光。局部灯应与 Takram 太阳同一套场景单位
   * （约 O(1)），不要把 Cesium 的 UE 10→111000 lux 比值写进 `emissiveIntensity`。
   * 默认关闭，以免未改灯的地球示例过曝。
   *
   * Photometric units. When enabled, the noon lux anchor (default 111000) maps
   * to a Takram sun intensity scale only; it does not convert point lights or
   * emissive. Local lights should share the Takram sun's scene units (~O(1)).
   * Disabled by default so unadjusted globe examples do not overexpose.
   */
  photometric?: boolean | ViewerAtmospherePhotometricOptions
}

/**
 * 大气光度单位配置。
 *
 * Atmosphere photometric-unit options.
 */
export interface ViewerAtmospherePhotometricOptions {
  /** 是否启用光度单位，默认 `false`。Enables photometric units. Defaults to `false`. */
  enabled?: boolean
  /**
   * 正午太阳照度锚（lux），默认 `111000`。只作为 Takram 强度缩放的语义锚，
   * 不会写成 `SunDirectionalLight.intensity = 111000`。
   *
   * Noon sun illuminance anchor in lux. Defaults to `111000`. This is a
   * semantic scale for Takram intensity, not a GPU light intensity of 111000.
   */
  sunIlluminance?: number
}

/**
 * Viewer 夜间光照配置。
 *
 * Viewer nighttime lighting options.
 */
export interface ViewerAtmosphereNightOptions {
  /** 是否启用自动夜间光照，默认 `false`。Enables automatic nighttime lighting. Defaults to `false`. */
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
 * Viewer 星空配置。
 *
 * Viewer star field options.
 */
export interface ViewerAtmosphereStarsOptions {
  /** 是否启用星空，默认 `true`。Enables the star field. Defaults to `true`. */
  show?: boolean
  /** 星空亮度缩放，默认 `1`。Star field brightness scale. Defaults to `1`. */
  intensity?: number
  /** 星点大小（像素点），默认 `1`。Star point size in pixels. Defaults to `1`. */
  pointSize?: number
}

/**
 * Viewer 大气天空元素配置。
 *
 * Viewer atmospheric sky element options.
 */
export interface ViewerAtmosphereSkyOptions {
  /**
   * 星空配置。传入 `boolean` 时等价于 `{ show }`。
   *
   * Star field options. A `boolean` is treated as `{ show }`.
   */
  stars?: boolean | ViewerAtmosphereStarsOptions
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
  /** 体积云外观配置。Volumetric cloud look options. */
  look?: ViewerCloudLookOptions
  /** 体积云云影配置。Volumetric cloud shadow options. */
  shadow?: ViewerCloudShadowOptions
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
 * Viewer 体积云外观配置。
 *
 * Viewer volumetric cloud look options.
 */
export interface ViewerCloudLookOptions {
  /** 是否启用 shape detail，默认 `true`。Enables cloud shape detail. Defaults to `true`. */
  detail?: boolean
  /** 是否启用湍流，默认 `true`。Enables cloud turbulence. Defaults to `true`. */
  turbulence?: boolean
  /** 是否启用雾霾，默认 `true`。Enables cloud haze. Defaults to `true`. */
  haze?: boolean
}

/**
 * Viewer 体积云云影配置。
 *
 * Viewer volumetric cloud shadow options.
 */
export interface ViewerCloudShadowOptions {
  /** 云影质量档位，默认 `medium`。Cloud shadow quality preset. Defaults to `medium`. */
  quality?: CloudShadowQuality
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
  /** 基础地球表面 PBR 材质参数。Base globe surface PBR material options. */
  material?: ViewerSurfaceMaterialOptions
}

/**
 * Viewer 后处理阶段开关配置。
 *
 * Viewer post-process stage toggle options.
 */
export interface ViewerPostProcessStageOptions {
  /** 是否启用该后处理阶段。Whether this post-processing stage is enabled. */
  enabled?: boolean
}

/**
 * Viewer Bloom 后处理配置。
 *
 * Viewer bloom post-processing options.
 */
export interface ViewerBloomOptions {
  /** 是否启用 Bloom，默认 `false`。Enables bloom. Defaults to `false`. */
  enabled?: boolean
  /**
   * Bloom 强度，默认 `1`。这是亮部提取之后的混合系数，不是画面亮度百分比。
   *
   * Bloom intensity. Defaults to `1`. Mix factor of the extracted bright pass,
   * not a percentage of scene brightness.
   */
  intensity?: number
  /**
   * 参与 Bloom 的线性 HDR 亮度阈值，默认 `1`。比较发生在 AgX / 曝光之前，
   * 不是屏幕最终观感。
   *
   * Linear HDR luminance threshold for bloom. Defaults to `1`. Compared before
   * AgX / exposure, not against the final displayed brightness.
   */
  luminanceThreshold?: number
  /** 亮度阈值过渡宽度，范围 `0` 到 `1`，默认 `0.03`。Luminance threshold smoothing from `0` to `1`. Defaults to `0.03`. */
  luminanceSmoothing?: number
  /** Bloom 扩散半径，范围 `0` 到 `1`，默认 `0.85`。Bloom radius from `0` to `1`. Defaults to `0.85`. */
  radius?: number
}

/**
 * Viewer 镜头光晕阈值配置。
 *
 * Viewer lens flare threshold options.
 */
export interface ViewerLensFlareThresholdOptions {
  /** 亮部提取阈值，默认 `10`。Bright-pass threshold level. Defaults to `10`. */
  level?: number
  /** 亮部提取过渡宽度，默认 `1`。Bright-pass threshold range. Defaults to `1`. */
  range?: number
}

/**
 * Viewer 镜头光晕配置。
 *
 * Viewer lens flare options.
 */
export interface ViewerLensFlareOptions {
  /** 是否启用镜头光晕，默认 `true`。Enables lens flare. Defaults to `true`. */
  enabled?: boolean
  /** 光晕强度，默认 `0.005`。Lens flare intensity. Defaults to `0.005`. */
  intensity?: number
  /** 亮部提取阈值。Bright-pass threshold options. */
  threshold?: ViewerLensFlareThresholdOptions
  /** 光晕质量档位，默认 `medium`。Lens flare quality preset. Defaults to `medium`. */
  quality?: LensFlareQuality
}

/**
 * Viewer 后处理配置，用于 {@link ViewerOptions.postProcess}。
 *
 * Viewer post-processing options used by {@link ViewerOptions.postProcess}.
 */
export interface ViewerPostProcessOptions {
  /**
   * Bloom 配置。传入 `boolean` 时等价于 `{ enabled }`，默认关闭。
   *
   * Bloom options. A `boolean` is treated as `{ enabled }`. Disabled by default.
   */
  bloom?: boolean | ViewerBloomOptions
  /**
   * 镜头光晕配置。传入 `boolean` 时等价于 `{ enabled }`。
   *
   * Lens flare options. A `boolean` is treated as `{ enabled }`.
   */
  lensFlare?: boolean | ViewerLensFlareOptions
  /**
   * SMAA 抗锯齿配置。传入 `boolean` 时等价于 `{ enabled }`。图像空间、运行时可切。
   * 硬件 MSAA 见 {@link ViewerRendererOptions.antialias} / {@link ViewerRendererOptions.samples}。
   *
   * SMAA options. A `boolean` is treated as `{ enabled }`. Image-space and
   * runtime-togglable. Hardware MSAA is {@link ViewerRendererOptions.antialias} /
   * {@link ViewerRendererOptions.samples}.
   */
  smaa?: boolean | ViewerPostProcessStageOptions
  /**
   * WebGPU TAA 时间抗锯齿配置，默认 `false`。传入 `boolean` 时等价于 `{ enabled }`。
   * 图像空间、运行时可切。硬件 MSAA 见 {@link ViewerRendererOptions.antialias}。
   *
   * WebGPU TAA options. Defaults to `false`. A `boolean` is treated as
   * `{ enabled }`. Image-space and runtime-togglable. Hardware MSAA is
   * {@link ViewerRendererOptions.antialias}.
   */
  taa?: boolean | ViewerPostProcessStageOptions
  /**
   * 抖动配置。传入 `boolean` 时等价于 `{ enabled }`。
   *
   * Dithering options. A `boolean` is treated as `{ enabled }`.
   */
  dithering?: boolean | ViewerPostProcessStageOptions
  /**
   * 自动曝光。用太阳高度 / 夜因子平滑插值 `toneMappingExposure`。默认关闭。
   *
   * Auto exposure. Smoothly interpolates `toneMappingExposure` from sun
   * altitude / night factor. Disabled by default.
   */
  autoExposure?: boolean | ViewerAutoExposureOptions
  /** 渲染器色调映射曝光值，默认 `5`。Renderer tone mapping exposure. Defaults to `5`. */
  toneMappingExposure?: number
}

/**
 * 自动曝光配置。地球主光是太阳，用夜因子在 min（白天）与 max（夜晚）之间插值。
 *
 * Auto-exposure options. Globe key light is the sun, so night factor
 * interpolates between min (day) and max (night).
 */
export interface ViewerAutoExposureOptions {
  /** 是否启用自动曝光，默认 `false`。Enables auto exposure. Defaults to `false`. */
  enabled?: boolean
  /** 白天曝光下限，默认 `2`。Daytime exposure floor. Defaults to `2`. */
  min?: number
  /** 夜晚曝光上限，默认 `10`。Nighttime exposure ceiling. Defaults to `10`. */
  max?: number
  /** 适应速度，默认 `1.5`。Adaptation speed. Defaults to `1.5`. */
  speed?: number
}
