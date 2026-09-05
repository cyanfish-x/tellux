import type { SpringControlOptions } from '../SpringControl'
import type {
  ViewerAtmosphereOptions,
  ViewerCloudOptions,
  ViewerPostProcessOptions
} from './scene'

/**
 * Viewer 调试设置面板的初始值。形状与 {@link ViewerSceneOptions} /
 * {@link ViewerPostProcessOptions} 对应领域同构。
 *
 * Initial values for the Viewer debug settings panel. Nested the same way as
 * the corresponding {@link ViewerSceneOptions} / {@link ViewerPostProcessOptions}
 * domains.
 */
export interface DebugSettingsPanelOptions {
  /** 大气初始值。Atmosphere initial values. */
  atmosphere?: ViewerAtmosphereOptions
  /** 体积云初始值。Volumetric cloud initial values. */
  clouds?: ViewerCloudOptions
  /** 后处理初始值。Post-process initial values. */
  postProcess?: Pick<
    ViewerPostProcessOptions,
    'toneMappingExposure' | 'lensFlare' | 'smaa' | 'taa' | 'dithering'
  >
  /** 渲染器初始值。Renderer initial values. */
  renderer?: {
    /** 像素比。Pixel ratio. */
    resolutionScale?: number
  }
  /** 是否显示 FPS，默认 `true`。Whether to show FPS. Defaults to `true`. */
  showFps?: boolean
}

/**
 * Viewer 时间条控件配置。
 *
 * Timeline widget options for a Viewer.
 */
export interface TimelineOptions {
  /**
   * 时间条起始时间。默认使用当前时钟所在本地日期的 00:00。
   *
   * Timeline start time. Defaults to 00:00 local time on the current clock date.
   */
  startTime?: Date | string | number
  /**
   * 时间条结束时间。默认动态日范围使用下一本地日期的 00:00；显式提供起始时间时，默认使用其后 24 小时。
   *
   * Timeline end time. Dynamic day ranges default to 00:00 on the next local
   * date; with an explicit start time, defaults to 24 hours after it.
   */
  endTime?: Date | string | number
  /**
   * 是否将播放态下的 `clock.multiplier` 联动到 `scene.clouds.speed`，默认 `false`。
   *
   * 开启后：播放时为挂载时快照的基准云速 × 倍率（倍率上限 `60`），暂停时为 `0`；
   * 销毁时恢复基准云速。
   *
   * Whether to link play-state `clock.multiplier` to `scene.clouds.speed`.
   * Defaults to `false`.
   *
   * When enabled: playing uses base cloud speed captured at mount × multiplier
   * (capped at `60`), paused uses `0`; dispose restores the base speed.
   */
  linkCloudSpeed?: boolean
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
  settingsPanel?: boolean | DebugSettingsPanelOptions
  /**
   * 是否挂载内置时间条，默认 `false`。
   *
   * 传入对象时可配置显示范围与交互。时钟初始状态通过 `ViewerOptions.clock`
   * 配置；启用时间条且未显式设置 `clock.shouldAnimate` 时默认自动推进，完整
   * Clock 配置省略时从当前真实时间以 `1×` 流动；云速联动需显式设置
   * `linkCloudSpeed: true`。
   *
   * Whether to mount the built-in timeline. Defaults to `false`.
   *
   * Pass an object to configure the displayed range and interaction. Clock
   * state is initialized through `ViewerOptions.clock`. Enabling the timeline
   * advances time unless `clock.shouldAnimate` is explicitly set. With clock
   * options omitted, it follows real time at `1x`. Cloud-speed linking requires
   * `linkCloudSpeed: true`.
   */
  timeline?: boolean | TimelineOptions
}
