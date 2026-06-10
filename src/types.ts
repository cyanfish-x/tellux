import type { AnimationClip, Object3D } from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'
import type { CameraFlightEasingFunction } from './Camera'
import type { SpringControlOptions } from './SpringControl'
import type { Viewer } from './Viewer'

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
 * Viewer 调试设置面板的初始值。
 *
 * Initial values for the Viewer debug settings panel.
 */
export interface DebugSettingsPanelOptions {
  skyAtmosphere?: boolean
  stars?: boolean
  starsIntensity?: number
  starsPointSize?: number
  clockAnimate?: boolean
  clockMultiplier?: number
  hourUTC?: number
  dayOfYear?: number
  clouds?: boolean
  cloudCoverage?: number
  cloudSpeed?: number
  cloudLayerAltitude?: number
  cloudLayerHeight?: number
  atmosphereInscatterIntensity?: number
  atmosphereInscatterHorizonBlend?: boolean
  atmosphereInscatterHorizonRange?: [number, number]
  atmosphereCorrectAltitude?: boolean
  atmosphereCorrectGeometricError?: boolean
  atmosphereTransmittance?: boolean
  atmosphereInscatter?: boolean
  atmosphereLightingMode?: AtmosphereLightingMode
  surfaceMaterialMode?: SurfaceMaterialMode
  atmosphereSunLight?: boolean
  atmosphereSkyLight?: boolean
  atmosphereSunLightIntensity?: number
  atmosphereSkyLightIntensity?: number
  fallbackAmbientLight?: boolean
  fallbackAmbientLightIntensity?: number
  atmosphereSun?: boolean
  atmosphereMoon?: boolean
  atmosphereGround?: boolean
  atmosphereAlbedoScale?: number
  atmosphereSunAngularRadius?: number
  atmosphereMoonAngularRadius?: number
  atmosphereLunarRadianceScale?: number
  atmosphereShadowRadius?: number
  atmosphereShadowSampleCount?: number
  atmosphereSolarIrradianceScale?: number
  atmosphereRayleighScatteringScale?: number
  atmosphereMieScatteringScale?: number
  atmosphereMieExtinctionScale?: number
  atmosphereMiePhaseFunctionG?: number
  atmosphereAbsorptionExtinctionScale?: number
  atmosphereGroundAlbedo?: number
  toneMappingExposure?: number
  resolutionScale?: number
  lensFlare?: boolean
  smaa?: boolean
  dithering?: boolean
  showFps?: boolean
}

/**
 * Viewer 时间条控件配置。
 *
 * Timeline widget options for a Viewer.
 */
export interface TimelineOptions {
  /**
   * 时间条起始时间。默认使用当前时钟所在 UTC 日期的 00:00。
   *
   * Timeline start time. Defaults to 00:00 UTC on the current clock date.
   */
  startTime?: Date | string | number
  /**
   * 时间条结束时间。默认使用起始时间后 24 小时。
   *
   * Timeline end time. Defaults to 24 hours after the start time.
   */
  endTime?: Date | string | number
  /**
   * 初始当前时间。不传时沿用 {@link Viewer.clock} 的当前时间。
   *
   * Initial current time. Uses the current {@link Viewer.clock} time when
   * omitted.
   */
  currentTime?: Date | string | number
  /**
   * 初始是否播放时间。不传时沿用 {@link Viewer.clock} 的当前状态。
   *
   * Initial time animation state. Uses the current {@link Viewer.clock} state
   * when omitted.
   */
  animate?: boolean
  /**
   * 初始播放倍率。不传时沿用 {@link Viewer.clock} 的当前倍率。
   *
   * Initial playback multiplier. Uses the current {@link Viewer.clock}
   * multiplier when omitted.
   */
  multiplier?: number
  /**
   * 时间条跳转过渡弹簧配置，默认启用。
   *
   * 设为 `false` 可关闭平滑过渡；设为对象可调整弹簧参数。
   *
   * Spring configuration for timeline time jumps. Enabled by default.
   *
   * Set to `false` to disable smoothing, or pass an object to tune the spring.
   */
  spring?: boolean | SpringControlOptions
}

/**
 * Viewer 内置控件配置。
 *
 * Built-in Viewer widget options.
 */
export interface ViewerWidgetOptions {
  /**
   * 是否挂载内置调试设置面板，默认 `false`。
   *
   * 传入对象时会作为面板初始值，并与当前页面缓存值合并。
   *
   * Whether to mount the built-in debug settings panel. Defaults to `false`.
   *
   * Pass an object to provide initial panel values. They are merged with cached
   * values for the current page.
   */
  settingPanel?: boolean | DebugSettingsPanelOptions
  /**
   * 是否挂载内置时间条，默认 `false`。
   *
   * 传入对象时会作为时间条初始配置。
   *
   * Whether to mount the built-in timeline. Defaults to `false`.
   *
   * Pass an object to provide initial timeline options.
   */
  timeline?: boolean | TimelineOptions
}

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

/**
 * 创建 {@link Viewer} 时使用的配置项。
 *
 * Options used to create a {@link Viewer}.
 */
export interface ViewerOptions {
  /**
   * 初始影像图层列表。
   *
   * 图层会按数组顺序从下到上贴到裸球或地形表面。
   *
   * Initial imagery layer list.
   *
   * Layers are drawn from bottom to top on the globe or terrain surface.
   */
  layers?: ImageryLayerOptions[]
  /**
   * 地形瓦片资源配置。
   *
   * `url` 指向 Cesium quantized-mesh terrain 根目录或 `layer.json` 文件。
   *
   * Terrain tile resource options.
   *
   * The `url` points to a Cesium quantized-mesh terrain root directory or
   * `layer.json` file.
   */
  terrain?: TerrainOptions
  /**
   * 初始相机视角。
   *
   * 经纬度和姿态角使用度作为单位；高度、near 和 far 使用米作为单位。
   *
   * Initial camera view.
   *
   * Geographic coordinates and orientation angles are expressed in degrees.
   * Height, near, and far are expressed in meters.
   */
  camera?: {
    /** 初始纬度（度），默认 `35.6812`。Initial latitude in degrees. Defaults to `35.6812`. */
    latitude?: number
    /** 初始经度（度），默认 `139.8`。Initial longitude in degrees. Defaults to `139.8`. */
    longitude?: number
    /** 初始相机高度（米），默认 `500`。Initial camera height in meters. Defaults to `500`. */
    height?: number
    /** 初始航向角（度），默认 `-90`。Initial heading in degrees. Defaults to `-90`. */
    heading?: number
    /** 初始俯仰角（度），默认 `-10`。Initial pitch in degrees. Defaults to `-10`. */
    pitch?: number
    /** 初始翻滚角（度），默认 `0`。Initial roll in degrees. Defaults to `0`. */
    roll?: number
    /** 透视相机垂直视场角（度），默认 `75`。Perspective camera vertical field of view in degrees. Defaults to `75`. */
    fov?: number
    /** 透视相机近裁剪面（米），默认 `10`。Perspective camera near clipping plane in meters. Defaults to `10`. */
    near?: number
    /** 透视相机远裁剪面（米），默认 `1000000`。Perspective camera far clipping plane in meters. Defaults to `1000000`. */
    far?: number
  }
  /**
   * 初始场景和后处理配置。
   *
   * Initial scene and post-processing options.
   */
  scene?: ViewerSceneOptions
  /**
   * 为 `true` 时自动启动渲染循环。
   *
   * 默认 `true`。接入外部渲染循环时可设为 `false`，并手动调用 {@link Viewer.render}。
   *
   * Starts the render loop automatically when `true`.
   *
   * Defaults to `true`. Set this to `false` when integrating with an external
   * render loop and call {@link Viewer.render} yourself.
   */
  useDefaultRenderLoop?: boolean
  /**
   * 内置控件配置。
   *
   * Built-in widget options.
   */
  widgets?: ViewerWidgetOptions
  /**
   * 内置控件配置别名。
   *
   * 与 {@link ViewerOptions.widgets} 等价；当两个字段同时存在时，
   * `widgets` 中的同名配置优先生效。
   *
   * Alias for built-in widget options.
   *
   * Equivalent to {@link ViewerOptions.widgets}; when both fields are present,
   * matching options from `widgets` take precedence.
   */
  widget?: ViewerWidgetOptions
  /**
   * 渲染器像素比，默认 `Math.min(window.devicePixelRatio, 2)`。
   *
   * Renderer pixel ratio. Defaults to `Math.min(window.devicePixelRatio, 2)`.
   */
  resolutionScale?: number
  /**
   * 是否启用透明渲染背景，默认 `false`。
   *
   * 开启后 WebGL canvas 会透出页面背景，适合嵌入门户页或自定义背景。
   *
   * Enables a transparent rendering background. Defaults to `false`.
   *
   * When enabled, the WebGL canvas shows the page background, which is useful
   * for embedded portal heroes or custom backdrops.
   */
  transparent?: boolean
  /**
   * Draco 解码器文件的公开 URL 路径。
   *
   * 默认 `/draco/gltf/`。
   *
   * Public URL path for Draco decoder files.
   *
   * Defaults to `/draco/gltf/`.
   */
  dracoDecoderPath?: string
}

/**
 * 影像图层配置，用于 {@link ViewerOptions.layers} 和 `viewer.layers.add(...)`。
 *
 * Imagery layer options used by {@link ViewerOptions.layers} and
 * `viewer.layers.add(...)`.
 */
export interface ImageryLayerOptions {
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /**
   * 图层名称，用于应用侧展示。
   *
   * Layer name for application UI display.
   */
  name?: string
  /**
   * 图层数据源。
   *
   * Layer data source.
   */
  source: ImageryLayerSourceOptions
  /**
   * 图层是否可见，默认 `true`。
   *
   * Whether the layer is visible. Defaults to `true`.
   */
  visible?: boolean
  /**
   * 图层显示样式。
   *
   * Layer display style.
   */
  style?: ImageryLayerStyleOptions
}

/**
 * 影像图层显示样式。
 *
 * Imagery layer display style.
 */
export interface ImageryLayerStyleOptions {
  /**
   * 图层透明度，范围 `0` 到 `1`，默认 `1`。
   *
   * Layer opacity from `0` to `1`. Defaults to `1`.
   */
  opacity?: number
  /**
   * 图层颜色乘色。
   *
   * Layer color tint.
   */
  color?: number | string
  /**
   * 面填充颜色，适用于 GeoJSON 和 MVT 图层。
   *
   * Polygon fill color for GeoJSON and MVT layers.
   */
  fill?: string
  /**
   * 线描边颜色，适用于 GeoJSON 和 MVT 图层。
   *
   * Line stroke color for GeoJSON and MVT layers.
   */
  stroke?: string
  /**
   * 描边宽度（像素），适用于 GeoJSON 和 MVT 图层。
   *
   * Stroke width in pixels for GeoJSON and MVT layers.
   */
  strokeWidth?: number
  /**
   * 点半径（像素），适用于 GeoJSON 和 MVT 图层。
   *
   * Point radius in pixels for GeoJSON and MVT layers.
   */
  pointRadius?: number
  /**
   * 按矢量 feature 返回样式。
   *
   * GeoJSON 图层接收 `(feature, properties)`；MVT 图层接收
   * `(layerName, properties)`，当 `properties` 为 `null` 时仅用于获取
   * MVT 图层绘制顺序。
   *
   * Returns per-feature vector styling.
   *
   * GeoJSON layers receive `(feature, properties)`. MVT layers receive
   * `(layerName, properties)`; when `properties` is `null`, the callback is
   * queried only for MVT layer draw order.
   */
  getStyle?: GeoJSONGetStyleCallback | MVTGetStyleCallback
}

/**
 * Viewer 支持的影像图层数据源配置。
 *
 * Imagery layer source options supported by Viewer.
 */
export type ImageryLayerSourceOptions =
  | CesiumIonImagerySourceOptions
  | XYZImagerySourceOptions
  | WMSImagerySourceOptions
  | GeoJSONImagerySourceOptions
  | MVTImagerySourceOptions

/**
 * 地形瓦片加载参数，用于调整地形 LOD 和影像贴图质量。
 *
 * Terrain tile loading options used to tune terrain LOD and imagery texture quality.
 */
export interface TerrainTileLoadingOptions {
  /**
   * 地形瓦片目标屏幕空间误差，默认 `1`。
   *
   * 值越小越倾向加载更高层级瓦片，但会增加请求、解析和渲染成本。
   *
   * Target screen-space error for terrain tiles. Defaults to `1`.
   *
   * Lower values prefer higher-detail tiles, but increase request, parsing, and
   * rendering cost.
   */
  errorTarget?: number
  /**
   * 每个地形瓦片合成影像纹理的画布分辨率，默认 `256`。
   *
   * 提高该值可改善影像贴到较大地形瓦片时的清晰度，但会增加 GPU 内存和合成成本。
   *
   * Canvas resolution used to composite imagery textures for each terrain tile.
   * Defaults to `256`.
   *
   * Higher values can improve imagery clarity on larger terrain tiles, but
   * increase GPU memory and compositing cost.
   */
  imageryResolution?: number
  /**
   * 是否允许影像插件拆分地形瓦片以贴合影像瓦片边界，默认 `false`。
   *
   * 开启后可提升影像边界和高层级贴图清晰度，但会生成额外虚拟瓦片。
   *
   * Allows the imagery plugin to split terrain tiles so they better match imagery
   * tile boundaries. Defaults to `false`.
   *
   * Enabling this can improve imagery boundary alignment and high-level texture
   * clarity, but creates additional virtual tiles.
   */
  enableTileSplitting?: boolean
}

/**
 * Cesium quantized-mesh 地形配置，用于 {@link ViewerOptions.terrain}。
 *
 * Cesium quantized-mesh terrain options used by {@link ViewerOptions.terrain}.
 */
export interface TerrainOptions {
  /**
   * 地形根 URL 或 `layer.json` URL。
   *
   * Terrain root URL or `layer.json` URL.
   */
  url: string
  /**
   * 地形瓦片加载参数。
   *
   * 用于调节地形 LOD、地形上的影像合成分辨率和影像瓦片拆分。
   *
   * Terrain tile loading options.
   *
   * Tunes terrain LOD, imagery compositing resolution on terrain, and imagery
   * tile splitting.
   */
  tileLoading?: TerrainTileLoadingOptions
  /**
   * 是否应用 3d-tiles-renderer 推荐的地形加载设置，默认 `true`。
   *
   * Applies the terrain loading settings recommended by 3d-tiles-renderer.
   * Defaults to `true`.
   */
  useRecommendedSettings?: boolean
  /**
   * 地形裙边长度（米）。不传时使用瓦片 geometric error。
   *
   * Terrain skirt length in meters. When omitted, the tile geometric error is used.
   */
  skirtLength?: number | null
  /**
   * 是否混合裙边法线以平滑瓦片边缘，默认 `true`。
   *
   * Blends skirt normals for smoother tile edges. Defaults to `true`.
   */
  smoothSkirtNormals?: boolean
  /**
   * 是否为地形网格生成法线，默认 `true`。
   *
   * Generates normals for terrain meshes. Defaults to `true`.
   */
  generateNormals?: boolean
  /**
   * 是否生成封闭实体网格，默认 `false`。
   *
   * Generates a solid closed mesh. Defaults to `false`.
   */
  solid?: boolean
}

/**
 * 3D Tiles 图层渲染选项。
 *
 * Rendering options shared by 3D Tiles layers.
 */
export interface ThreeDTilesRenderOptions {
  /**
   * 3D Tiles 材质模式。默认根据 Viewer 大气光照模式自动选择：`post-process` 使用 unlit，`light-source` 使用 standard。
   *
   * `unlit` 会把瓦片网格转换为不受 Three.js 光源影响的材质，适合把瓦片颜色作为 Takram 后处理光照的 albedo 输入。
   *
   * 3D Tiles material mode. By default, this follows the Viewer atmosphere
   * lighting mode: `post-process` uses unlit materials, while `light-source`
   * uses standard materials.
   *
   * `unlit` converts tile meshes to materials unaffected by Three.js light
   * sources, suitable for using tile colors as albedo input for Takram
   * post-process lighting.
   */
  materialMode?: 'unlit'
  /**
   * 是否为当前 3D Tiles 图层重新生成折痕法线，默认 `false`。
   *
   * 该处理适合摄影测量等法线缺失或不稳定的瓦片，可改善基于 NormalPass 的后处理光照边缘，但会增加瓦片加载时的 CPU 和内存成本。
   *
   * Regenerates creased normals for this 3D Tiles layer. Defaults to `false`.
   *
   * This is useful for photogrammetry tiles with missing or unstable normals and
   * can improve NormalPass-based post-process lighting edges, but adds CPU and
   * memory cost while tiles load.
   */
  creasedNormals?: boolean
}

export interface Url3DTilesetOptions extends ThreeDTilesRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'url'
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /**
   * `tileset.json` 的 URL。
   *
   * URL of the `tileset.json`.
   */
  url: string
}

/**
 * 通过 Cesium Ion 资源加载 3D Tiles 的配置。
 *
 * Options for loading 3D Tiles from a Cesium Ion asset.
 */
export interface CesiumIon3DTilesetOptions extends ThreeDTilesRenderOptions {
  /** 数据源类型。Data source type. */
  type: 'cesium-ion'
  /**
   * 图层 id。不传时 Tellux 会自动生成。
   *
   * Layer id. Tellux generates one when omitted.
   */
  id?: string
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** Cesium Ion 3D Tiles 资源 id。Cesium Ion 3D Tiles asset id. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * Viewer 支持的 3D Tiles 加载配置。
 *
 * 3D Tiles 会作为独立场景数据加载，不参与影像 overlay 管线。
 *
 * 3D Tiles loading options supported by Viewer.
 *
 * 3D Tiles are loaded as independent scene data and do not participate in the
 * imagery overlay pipeline.
 */
export type Load3DTilesetOptions = Url3DTilesetOptions | CesiumIon3DTilesetOptions

/**
 * 加载 glTF / GLB 模型的配置。
 *
 * Options for loading a glTF / GLB model.
 */
export interface GltfModelOptions {
  /** 模型类型。Model type. */
  type: 'gltf'
  /**
   * 模型 id。不传时 Tellux 会自动生成。
   *
   * Model id. Tellux generates one when omitted.
   */
  id?: string
  /** glTF 或 GLB 文件 URL。URL of the glTF or GLB file. */
  url: string
  /**
   * 模型放置坐标。数组输入顺序为 `[经度, 纬度, 高度]`；对象输入使用
   * `{ longitude, latitude, height }`。
   *
   * Model placement coordinates. Tuple input order is
   * `[longitude, latitude, height]`; object input uses
   * `{ longitude, latitude, height }`.
   */
  coordinates: CartographicInput
  /**
   * 模型缩放。传入数字时使用等比缩放；传入数组时分别缩放 x/y/z。
   *
   * Model scale. A number applies uniform scaling; an array scales x/y/z
   * separately.
   */
  scale?: number | [x: number, y: number, z: number]
  /** 模型朝向角（度），相对当地正北顺时针。Model heading in degrees, clockwise from local north. */
  heading?: number
  /** 模型俯仰角（度）。Model pitch in degrees. */
  pitch?: number
  /** 模型翻滚角（度）。Model roll in degrees. */
  roll?: number
  /**
   * 是否把模型包围盒底部对齐到当地地表平面，默认 `false`。
   *
   * Whether to align the model bounding-box bottom to the local ground plane.
   * Defaults to `false`.
   */
  alignToGround?: boolean
  /** 是否加载完成后自动播放动画，默认 `false`。Whether to auto-play animation after loading. Defaults to `false`. */
  animate?: boolean
  /**
   * 要播放的动画通道索引，默认 `0`。
   *
   * Animation channel index to play. Defaults to `0`.
   */
  animationChannel?: number
  /** 是否显示模型，默认 `true`。Whether the model is visible. Defaults to `true`. */
  visible?: boolean
}

/**
 * Viewer 支持的模型加载配置。
 *
 * Model loading options supported by Viewer.
 */
export type AddModelOptions = GltfModelOptions

/**
 * 已加载模型的控制句柄。
 *
 * Handle for a loaded model.
 */
export interface ModelLayer {
  /** 模型 id。Model id. */
  readonly id: string
  /** 用于地理定位和姿态的 Three.js 根对象。Three.js root object used for geospatial placement. */
  readonly root: Object3D
  /** 加载完成后的 glTF 场景对象；加载中或失败时为 `null`。Loaded glTF scene object, or `null` while loading or after failure. */
  readonly model: Object3D | null
  /** 模型内包含的动画剪辑。Animation clips included in the model. */
  readonly animations: AnimationClip[]
  /** 模型加载完成 Promise。Promise resolved when the model is loaded. */
  readonly ready: Promise<ModelLayer>
  /** 是否显示该模型。Whether the model is visible. */
  show: boolean
  /**
   * 播放指定动画通道。未传入时播放当前动画通道。
   *
   * 返回 `false` 表示模型尚未加载或动画通道不存在。
   *
   * Plays an animation channel. When omitted, plays the current channel.
   *
   * Returns `false` if the model is not loaded yet or the channel does not
   * exist.
   */
  playAnimation(animationChannel?: number): boolean
  /**
   * 暂停当前动画，并保留当前播放时间。
   *
   * 返回 `false` 表示模型尚未加载或当前没有正在播放的动画。
   *
   * Pauses the current animation while preserving the current playback time.
   *
   * Returns `false` if the model is not loaded yet or no animation is currently
   * playing.
   */
  pauseAnimation(): boolean
  /**
   * 停止当前动画，并重置到初始状态。
   *
   * Stops the current animation and resets it to the initial state.
   */
  stopAnimation(): void
  /**
   * 从 Viewer 中移除该模型并释放资源。
   *
   * Removes the model from Viewer and releases resources.
   */
  remove(): void
}

/**
 * Viewer 目标飞行支持的目标类型。
 *
 * 经纬高点位会直接作为目标点；Three.js 模型和 3D Tiles 会使用包围体中心作为目标点。
 *
 * Target types supported by Viewer target flights.
 *
 * Cartographic points are used directly; Three.js models and 3D Tiles use their
 * bounding-volume center as the target point.
 */
export type FlyToTargetTarget = CartographicCoordinates | Object3D | TilesRenderer

/**
 * 相机相对目标点的偏移。
 *
 * `heading` 和 `pitch` 定义相机看向目标时的方向，`distance` 定义相机到目标点的距离。
 *
 * Camera offset relative to a target point.
 *
 * `heading` and `pitch` define the view direction toward the target, and
 * `distance` defines the camera-to-target distance.
 */
export interface FlyToTargetOffset {
  /** 相机看向目标时的航向角（度），默认 `0`。Heading while viewing the target in degrees. Defaults to `0`. */
  heading?: number
  /** 相机看向目标时的俯仰角（度），默认 `-30`。Pitch while viewing the target in degrees. Defaults to `-30`. */
  pitch?: number
  /** 相机到目标点的距离（米）。Distance from the camera to the target point in meters. */
  distance?: number
  /** 相机看向目标时的翻滚角（度），默认 `0`。Roll while viewing the target in degrees. Defaults to `0`. */
  roll?: number
}

/**
 * 飞行到目标点、模型或 3D Tiles 的配置。
 *
 * Viewer 会根据目标和偏移计算相机最终位置，并让相机最终看向目标点。
 *
 * Options for flying to a point, model, or 3D Tiles target.
 *
 * Viewer computes the final camera position from the target and offset, and the
 * camera ends the flight looking at the target point.
 */
export interface FlyToTargetOptions extends FlyToTargetOffset {
  /** 飞行持续时间（秒）。Flight duration in seconds. */
  duration?: number
  /** 飞行最高高度（米），用于形成弧线飞行路径。Maximum flight height in meters, used to form an arced path. */
  maximumHeight?: number
  /** 飞行完成时调用。Called when the flight completes. */
  complete?: () => void
  /** 飞行被新飞行、立即定位或用户交互取消时调用。Called when the flight is cancelled by a new flight, immediate view change, or user input. */
  cancel?: () => void
  /** 控制飞行时间插值的缓动函数。Easing function that controls flight time interpolation. */
  easingFunction?: CameraFlightEasingFunction
}

/**
 * 已加载 3D Tiles 图层的控制句柄。
 *
 * Handle for a loaded 3D Tiles layer.
 */
export interface TilesetLayer {
  /** 图层 id。Layer id. */
  readonly id: string
  /** 底层 3D Tiles renderer。Underlying 3D Tiles renderer. */
  readonly tileset: TilesRenderer
  /** 是否显示该图层。Whether the layer is visible. */
  show: boolean
  /**
   * 从 Viewer 中移除该图层并释放资源。
   *
   * Removes the layer from Viewer and releases its resources.
   */
  remove(): void
}

/**
 * Cesium Ion 影像数据源配置，用于影像图层。
 *
 * Cesium Ion imagery source options used by imagery layers.
 */
export interface CesiumIonImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'cesium-ion'
  /** Cesium Ion 访问令牌。Cesium Ion access token. */
  apiToken: string
  /** 要加载的 Cesium Ion 资源 id。Cesium Ion asset id to load. */
  assetId: string | number
  /** 是否自动刷新 Cesium Ion endpoint 授权，默认 `true`。Refreshes Cesium Ion endpoint authorization automatically. Defaults to `true`. */
  autoRefreshToken?: boolean
}

/**
 * XYZ 瓦片影像数据源配置，用于影像图层。
 *
 * XYZ tile imagery source options used by imagery layers.
 */
export interface XYZImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'xyz'
  /**
   * 瓦片 URL 模板，支持 `{x}`、`{y}`、`{z}` 占位符。
   *
   * Tile URL template with `{x}`, `{y}`, and `{z}` placeholders.
   */
  url: string
  /**
   * 瓦片级别数量，默认 `20`。
   *
   * Number of tile levels. Defaults to `20`.
   */
  levels?: number
  /**
   * 瓦片像素尺寸，默认 `256`。
   *
   * Tile pixel size. Defaults to `256`.
   */
  tileDimension?: number
  /**
   * 投影标识，默认 `EPSG:3857`。
   *
   * Projection identifier. Defaults to `EPSG:3857`.
   */
  projection?: 'EPSG:3857' | 'EPSG:4326' | string
}

/**
 * WMS 影像数据源配置，用于影像图层。
 *
 * WMS imagery source options used by imagery layers.
 */
export interface WMSImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'wms'
  /**
   * WMS 服务基础 URL。
   *
   * WMS service base URL.
   */
  url: string
  /**
   * WMS 图层名，对应 GetMap 请求的 `LAYERS` 参数。
   *
   * WMS layer name used as the GetMap `LAYERS` parameter.
   */
  layer: string
  /**
   * 坐标参考系，默认 `EPSG:4326`。
   *
   * Coordinate reference system. Defaults to `EPSG:4326`.
   */
  crs?: 'EPSG:4326' | 'EPSG:3857' | 'CRS:84' | string
  /**
   * 图片格式，默认 `image/png`。
   *
   * Image format. Defaults to `image/png`.
   */
  format?: string
  /**
   * 瓦片像素尺寸，默认 `256`。
   *
   * Tile pixel size. Defaults to `256`.
   */
  tileDimension?: number
  /**
   * WMS 样式名，对应 GetMap 请求的 `STYLES` 参数。
   *
   * WMS style name used as the GetMap `STYLES` parameter.
   */
  styles?: string
  /**
   * WMS 版本，默认 `1.3.0`。
   *
   * WMS version. Defaults to `1.3.0`.
   */
  version?: '1.3.0' | '1.1.1' | string
  /**
   * 瓦片级别数量，默认 `18`。
   *
   * Number of tile levels. Defaults to `18`.
   */
  levels?: number
  /**
   * 是否请求透明背景，默认 `false`。
   *
   * Requests a transparent background. Defaults to `false`.
   */
  transparent?: boolean
  /**
   * 内容范围，顺序为 `[west, south, east, north]`，单位由 `crs` 决定。
   *
   * Content bounds as `[west, south, east, north]`, in the units of `crs`.
   */
  contentBoundingBox?: [number, number, number, number]
  /**
   * 瓦片请求 URL 预处理函数，可用于追加 token 或签名参数。
   *
   * Preprocesses tile request URLs, useful for appending tokens or signatures.
   */
  preprocessURL?: (url: string) => string | null
  /**
   * 瓦片请求配置。
   *
   * Tile request options.
   */
  fetchOptions?: RequestInit
}

/**
 * GeoJSON 几何对象。
 *
 * GeoJSON geometry object.
 */
export interface GeoJSONGeometry {
  /** GeoJSON 几何类型。GeoJSON geometry type. */
  type: string
  /** 几何坐标。Geometry coordinates. */
  coordinates?: unknown
  /** GeometryCollection 中的子几何。Child geometries in a GeometryCollection. */
  geometries?: GeoJSONGeometry[]
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * GeoJSON feature 属性。
 *
 * GeoJSON feature properties.
 */
export type GeoJSONFeatureProperties = Record<string, unknown>

/**
 * GeoJSON feature 对象。
 *
 * GeoJSON feature object.
 */
export interface GeoJSONFeature {
  /** GeoJSON 对象类型。GeoJSON object type. */
  type: 'Feature'
  /** Feature 几何。Feature geometry. */
  geometry: GeoJSONGeometry | null
  /** Feature 属性。Feature properties. */
  properties?: GeoJSONFeatureProperties | null
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * GeoJSON feature collection 对象。
 *
 * GeoJSON feature collection object.
 */
export interface GeoJSONFeatureCollection {
  /** GeoJSON 对象类型。GeoJSON object type. */
  type: 'FeatureCollection'
  /** Feature 列表。Feature list. */
  features: GeoJSONFeature[]
  /** 允许应用携带额外 GeoJSON 成员。Allows applications to carry extra GeoJSON members. */
  [key: string]: unknown
}

/**
 * 可作为 GeoJSON 图层输入的数据。
 *
 * GeoJSON data accepted by a GeoJSON layer.
 */
export type GeoJSONData = GeoJSONFeatureCollection | GeoJSONFeature | GeoJSONGeometry

/**
 * GeoJSON feature 样式。
 *
 * GeoJSON feature style.
 */
export interface GeoJSONFeatureStyle {
  /** 面填充颜色，使用 CSS 颜色字符串。Polygon fill color as a CSS color string. */
  fill?: string
  /** 线描边颜色，使用 CSS 颜色字符串。Line stroke color as a CSS color string. */
  stroke?: string
  /** 描边宽度（像素）。Stroke width in pixels. */
  strokeWidth?: number
  /** 点半径（像素）。Point radius in pixels. */
  radius?: number
  /** 是否渲染该 feature。Whether the feature is rendered. */
  visible?: boolean
}

/**
 * GeoJSON feature 样式回调。
 *
 * GeoJSON feature style callback.
 */
export type GeoJSONGetStyleCallback = (
  feature: GeoJSONFeature,
  properties: GeoJSONFeatureProperties | null
) => GeoJSONFeatureStyle | null

/**
 * GeoJSON 数据源配置，用于影像图层。
 *
 * GeoJSON source options used by imagery layers.
 */
export interface GeoJSONImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'geojson'
  /**
   * GeoJSON 数据对象。
   *
   * GeoJSON data object.
   */
  geojson?: GeoJSONData
  /**
   * GeoJSON 文件 URL。未传 `geojson` 时会在初始化时请求该 URL。
   *
   * GeoJSON file URL. When `geojson` is omitted, this URL is fetched on init.
   */
  url?: string
  /**
   * 生成 GeoJSON 纹理的画布分辨率，默认 `256`。
   *
   * Canvas resolution used to rasterize GeoJSON textures. Defaults to `256`.
   */
  resolution?: number
  /**
   * 请求 URL 预处理函数，可用于追加 token 或签名参数。
   *
   * Preprocesses request URLs, useful for appending tokens or signatures.
   */
  preprocessURL?: (url: string) => string | null
  /**
   * GeoJSON 请求配置。
   *
   * GeoJSON request options.
   */
  fetchOptions?: RequestInit
}

/**
 * MVT feature 样式。
 *
 * MVT feature style.
 */
export interface MVTFeatureStyle {
  /** 面填充颜色，使用 CSS 颜色字符串。Polygon fill color as a CSS color string. */
  fill?: string
  /** 线描边颜色，使用 CSS 颜色字符串。Line stroke color as a CSS color string. */
  stroke?: string
  /** 描边宽度（像素）。Stroke width in pixels. */
  strokeWidth?: number
  /** 点半径（像素）。Point radius in pixels. */
  radius?: number
  /** 绘制顺序，数值越小越早绘制。Draw order; lower values draw earlier. */
  order?: number
  /** 是否渲染该 feature。Whether the feature is rendered. */
  visible?: boolean
}

/**
 * MVT feature 属性。
 *
 * MVT feature properties.
 */
export type MVTFeatureProperties = Record<string, unknown>

/**
 * MVT feature 样式回调。
 *
 * MVT feature style callback.
 */
export type MVTGetStyleCallback = (
  layerName: string,
  properties: MVTFeatureProperties | null
) => MVTFeatureStyle | null

/**
 * Mapbox Vector Tile 数据源配置，用于影像图层。
 *
 * Mapbox Vector Tile source options used by imagery layers.
 */
export interface MVTImagerySourceOptions {
  /** 数据源类型。Source type. */
  type: 'mvt'
  /**
   * MVT 瓦片 URL 模板，支持 `{x}`、`{y}`、`{z}` 占位符。
   *
   * MVT tile URL template with `{x}`, `{y}`, and `{z}` placeholders.
   */
  url: string
  /**
   * 瓦片级别数量，默认 `20`。
   *
   * Number of tile levels. Defaults to `20`.
   */
  levels?: number
  /**
   * 投影标识，默认 `EPSG:3857`。
   *
   * Projection identifier. Defaults to `EPSG:3857`.
   */
  projection?: 'EPSG:3857' | 'EPSG:4326' | string
  /**
   * 生成矢量瓦片纹理的画布分辨率，默认 `512`。
   *
   * Canvas resolution used to rasterize vector tile textures. Defaults to `512`.
   */
  resolution?: number
  /**
   * 瓦片请求配置。
   *
   * Tile request options.
   */
  fetchOptions?: RequestInit
}

/**
 * 屏幕像素坐标，相对于 canvas 左上角。
 *
 * Screen pixel position relative to the top-left corner of the canvas.
 */
export interface ScreenPosition {
  /** 横向像素坐标。Horizontal pixel coordinate. */
  x: number
  /** 纵向像素坐标。Vertical pixel coordinate. */
  y: number
}

/**
 * 经纬高坐标，单位分别为度和米。
 *
 * Cartographic coordinates in degrees and meters.
 */
export interface CartographicCoordinates {
  /** 纬度（度）。Latitude in degrees. */
  latitude: number
  /** 经度（度）。Longitude in degrees. */
  longitude: number
  /** 高度（米）。Height in meters. */
  height: number
}

/**
 * 经纬高输入，顺序为 `[经度, 纬度, 高度]`。
 *
 * Cartographic input as `[longitude, latitude, height]`.
 */
export type CartographicCoordinateTuple = [longitude: number, latitude: number, height?: number]

/**
 * 经纬高输出，顺序为 `[经度, 纬度, 高度]`。
 *
 * Cartographic output as `[longitude, latitude, height]`.
 */
export type CartographicHeightTuple = [longitude: number, latitude: number, height: number]

/**
 * 高精度高度采样结果；未命中时为 `undefined`。
 *
 * Most-detailed height sampling result; `undefined` when no surface is hit.
 */
export type SampleHeightMostDetailedResult = CartographicHeightTuple | undefined

/**
 * 经纬高点位输入。
 *
 * Cartographic point input.
 */
export type CartographicInput = CartographicCoordinateTuple | CartographicCoordinates

/**
 * 高度采样的数据源范围。
 *
 * Height sampling source range.
 */
export type HeightSamplingSource = 'all' | 'terrain' | 'tileset'

/**
 * 高度采样选项。
 *
 * Height sampling options.
 */
export interface SampleHeightOptions {
  /**
   * 参与采样的数据源，默认 `'all'`。
   *
   * Source to sample from. Defaults to `'all'`.
   */
  source?: HeightSamplingSource
  /**
   * 沿当地地表法线向下采样的最低高度（米），默认 `-10000`。
   *
   * Minimum height in meters along the local surface-normal sampling ray.
   * Defaults to `-10000`.
   */
  minimumHeight?: number
  /**
   * 沿当地地表法线向下采样的最高高度（米），默认 `100000`。
   *
   * Maximum height in meters along the local surface-normal sampling ray.
   * Defaults to `100000`.
   */
  maximumHeight?: number
}

/**
 * 高精度高度采样调试选项。
 *
 * Most-detailed height sampling debug options.
 */
export interface SampleHeightMostDetailedDebugOptions {
  /**
   * 控制台日志标签。
   *
   * Console log label.
   */
  label?: string
  /**
   * 是否输出每个 batch 的诊断信息，默认 `true`。
   *
   * Whether to log diagnostics for each batch. Defaults to `true`.
   */
  logBatches?: boolean
  /**
   * 每隔多少个 batch 输出一次日志，默认 `1`。
   *
   * Batch interval for diagnostics. Defaults to `1`.
   */
  batchInterval?: number
  /**
   * 超过多少毫秒的 batch 总是输出日志，默认 `500`。
   *
   * Always log batches slower than this threshold in milliseconds. Defaults to `500`.
   */
  slowBatchMilliseconds?: number
}

/**
 * 高精度高度采样选项。
 *
 * Most-detailed height sampling options.
 */
export interface SampleHeightMostDetailedOptions extends SampleHeightOptions {
  /**
   * 离屏采样相机的像素分辨率，默认 `256`。
   *
   * Pixel resolution used by the offscreen sampling camera. Defaults to `256`.
   */
  resolution?: number
  /**
   * 等待瓦片加载和细化的最大更新帧数，默认 `120`。
   *
   * Maximum number of update frames to wait for tile loading and refinement.
   * Defaults to `120`.
   */
  maxFrames?: number
  /**
   * 是否输出高度采样调试信息。
   *
   * 传 `true` 使用默认调试配置；也可以传入对象控制日志标签、batch
   * 输出频率和慢 batch 阈值。
   *
   * Whether to log height sampling diagnostics.
   *
   * Pass `true` to use default debug settings, or pass an object to configure
   * the log label, batch logging interval, and slow batch threshold.
   */
  debug?: boolean | SampleHeightMostDetailedDebugOptions
}

/**
 * 经纬高局部坐标框架选项。
 *
 * Cartographic local frame options.
 */
export interface CartographicFrameOptions {
  /** 航向角（度），相对当地正北顺时针。Heading in degrees, clockwise from local north. */
  heading?: number
  /** 俯仰角（度）。Pitch in degrees. */
  pitch?: number
  /** 翻滚角（度）。Roll in degrees. */
  roll?: number
}

/**
 * Viewer 事件的基础信息。
 *
 * Base information for Viewer events.
 */
export interface ViewerEvent {
  /** 事件类型。Event type. */
  type: keyof ViewerEventMap
  /** 触发事件的 Viewer 实例。Viewer instance that emitted the event. */
  viewer: Viewer
}

/**
 * Viewer canvas 上的鼠标事件。
 *
 * Mouse event on the Viewer canvas.
 */
export interface ViewerMouseEvent extends ViewerEvent {
  /** 事件类型。Event type. */
  type: 'click' | 'mousemove'
  /** 原始 DOM 鼠标事件。Original DOM mouse event. */
  originalEvent: MouseEvent
  /** 相对于 canvas 左上角的像素坐标。Pixel position relative to the top-left corner of the canvas. */
  position: ScreenPosition
  /**
   * 鼠标位置对应的经纬高；未命中 3D Tiles 或椭球时为 `null`。
   *
   * Cartographic coordinates for the clicked position, or `null` when neither
   * 3D Tiles nor the ellipsoid is hit.
   */
  cartographic: CartographicCoordinates | null
}

/**
 * Viewer canvas 上的点击事件。
 *
 * Click event on the Viewer canvas.
 */
export interface ViewerClickEvent extends ViewerMouseEvent {
  /** 事件类型。Event type. */
  type: 'click'
}

/**
 * Viewer canvas 上的鼠标移动事件。
 *
 * Mouse move event on the Viewer canvas.
 */
export interface ViewerMouseMoveEvent extends ViewerMouseEvent {
  /** 事件类型。Event type. */
  type: 'mousemove'
}

/**
 * Viewer 支持的事件映射。
 *
 * Event map supported by Viewer.
 */
export interface ViewerEventMap {
  click: ViewerClickEvent
  mousemove: ViewerMouseMoveEvent
}

/**
 * Viewer 事件监听函数。
 *
 * Viewer event listener.
 */
export type ViewerEventListener<T extends keyof ViewerEventMap> = (event: ViewerEventMap[T]) => void

export type AnyViewerEventListener = (event: ViewerEventMap[keyof ViewerEventMap]) => void
