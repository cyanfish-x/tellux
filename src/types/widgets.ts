import type { SpringControlOptions } from '../SpringControl'
import type { AtmosphereLightingMode, SurfaceMaterialMode } from './scene'

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
