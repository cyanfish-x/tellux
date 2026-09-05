import type { CameraOrientation, CameraProjectionOptions } from '../Camera'
import type { ImageryLayerOptions } from './imagery'
import type { ViewerHighlightOptions } from './highlight'
import type { ViewerPostProcessOptions, ViewerSceneOptions } from './scene'
import type { TerrainOptions } from './terrain'
import type { ViewerWidgetOptions } from './widgets'
import type { ClockOptions } from '../Clock'
import type { LonLatHeightLike } from './spatial'

/**
 * Viewer 使用的 Three.js renderer 类型。
 *
 * Three.js renderer type used by Viewer.
 */
export type ViewerRendererType = 'webgl' | 'webgpu'

/**
 * 创建 Viewer 内部 Three.js renderer 时使用的配置项。
 *
 * Options used to create the internal Three.js renderer for Viewer.
 */
export interface ViewerRendererOptions {
  /**
   * Renderer 类型，默认 `webgl`。
   *
   * WebGPU 目前是实验能力；首版会降级 WebGL-only 的大气、云和后处理。
   *
   * Renderer type. Defaults to `webgl`.
   *
   * WebGPU is experimental; the first version degrades WebGL-only atmosphere,
   * clouds, and post-processing features.
   */
  type?: ViewerRendererType
  /**
   * 是否启用透明渲染背景，默认 `false`。
   *
   * 仅初始化可配置：canvas 的 alpha 在 renderer 构造时确定，运行时没有
   * `viewer.renderer.transparent`。
   *
   * Enables a transparent rendering background. Defaults to `false`.
   *
   * Init-only: canvas alpha is fixed when the renderer is constructed; there is
   * no runtime `viewer.renderer.transparent`.
   */
  transparent?: boolean
  /**
   * 是否启用 renderer 级抗锯齿（硬件 MSAA），必须在创建时决定。
   * 图像空间抗锯齿见 {@link ViewerPostProcessOptions.smaa} / {@link ViewerPostProcessOptions.taa}，运行时可切。
   *
   * Whether to enable renderer-level antialiasing (hardware MSAA). Must be
   * decided at creation. Image-space AA is {@link ViewerPostProcessOptions.smaa}
   * / {@link ViewerPostProcessOptions.taa} and can be toggled at runtime.
   */
  antialias?: boolean
  /**
   * 多重采样数量。与 {@link ViewerRendererOptions.antialias} 同属硬件 MSAA，init-only。
   *
   * Number of multisampling samples. Same hardware-MSAA family as
   * {@link ViewerRendererOptions.antialias}; init-only.
   */
  samples?: number
  /**
   * WebGPU renderer 是否强制使用 Three.js WebGL2 fallback backend。
   *
   * 仅当 `type` 为 `webgpu` 时生效。这不是第二套后端选择：
   * `type:'webgpu' + forceWebGL:true` 仍走 TSL 管线，WebGL-only 的大气、云和后处理
   * **依然不可用**。它不等于 `type:'webgl'`。
   *
   * Whether the WebGPU renderer should force Three.js' WebGL2 fallback backend.
   *
   * Only applies when `type` is `webgpu`. This is not a second backend selector:
   * `type:'webgpu' + forceWebGL:true` still uses the TSL pipeline, so WebGL-only
   * atmosphere, clouds, and post-processing remain unavailable. It is not
   * equivalent to `type:'webgl'`.
   */
  forceWebGL?: boolean
  /**
   * 渲染器像素比，默认 `Math.min(window.devicePixelRatio, 2)`。
   *
   * Renderer pixel ratio. Defaults to `Math.min(window.devicePixelRatio, 2)`.
   */
  resolutionScale?: number
}

/**
 * 创建 {@link Viewer} 时使用的配置项。
 *
 * Options used to create a {@link Viewer}.
 */
export interface ViewerOptions {
  /**
   * 初始表面叠加图层列表。
   *
   * 图层会按数组顺序从下到上贴到裸球或地形表面。
   *
   * Initial surface overlay layer list.
   *
   * Layers are drawn from bottom to top on the globe or terrain surface.
   */
  overlays?: ImageryLayerOptions[]
  /**
   * 地形瓦片资源配置。
   *
   * 支持 Cesium quantized-mesh URL / Ion 地形，以及天地图 swdx `elv_c` 高程地形。
   *
   * Terrain tile resource options.
   *
   * Supports Cesium quantized-mesh URL / Ion terrain and Tianditu swdx `elv_c`
   * heightmap terrain.
   */
  terrain?: TerrainOptions
  /**
   * 初始相机视角。与运行时 {@link Camera.setView} 同构，并另含投影参数。
   *
   * 一旦提供 `destination`，高度必填。省略 `destination` 时使用默认初始视角。
   *
   * Initial camera view. Isomorphic with runtime {@link Camera.setView}, plus
   * projection parameters.
   *
   * When `destination` is provided, height is required. Omitting `destination`
   * uses the default initial view.
   */
  camera?: {
    /**
     * 初始相机位置。高度必填；初始化不存在「保持当前高度」。
     *
     * Initial camera position. Height is required; there is no current height
     * to keep at initialization.
     */
    destination?: LonLatHeightLike
    /** 初始相机姿态。Initial camera orientation. */
    orientation?: CameraOrientation
    /** 透视投影参数，仅初始化可配置。Perspective projection; init-only. */
    projection?: CameraProjectionOptions
  }
  /**
   * 初始场景时钟配置。
   *
   * `currentTime` 支持 `Date`、日期字符串或毫秒时间戳；运行时请通过
   * `viewer.clock.currentTime = date` 赋值有效的 `Date` 对象。
   * 启用 `widgets.timeline` 且未显式设置 `shouldAnimate` 时默认自动推进；若
   * `currentTime` 和 `multiplier` 也省略，则从当前真实时间开始以 `1×` 流动。
   *
   * Initial scene clock options.
   *
   * `currentTime` accepts a `Date`, date string, or millisecond timestamp.
   * At runtime, assign a valid `Date` through `viewer.clock.currentTime = date`.
   * When `widgets.timeline` is enabled and `shouldAnimate` is omitted, time
   * advances by default. If `currentTime` and `multiplier` are also omitted,
   * it starts at the current system time and follows real time at `1x`.
   */
  clock?: ClockOptions
  /**
   * 初始场景配置。
   *
   * Initial scene options.
   */
  scene?: ViewerSceneOptions
  /**
   * 初始后处理配置。与运行时 {@link Viewer.postProcess} 同构。
   *
   * Initial post-process options. Isomorphic with runtime {@link Viewer.postProcess}.
   */
  postProcess?: ViewerPostProcessOptions
  /**
   * 初始高亮样式。与运行时 {@link Viewer.highlighter} 的 `outline` / `overlay` 同构。
   *
   * Initial highlight style. Isomorphic with runtime {@link Viewer.highlighter}
   * `outline` / `overlay`.
   */
  highlighter?: ViewerHighlightOptions
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
   * Three.js renderer 配置。
   *
   * Three.js renderer options.
   */
  renderer?: ViewerRendererOptions
  /**
   * Draco 解码器文件的公开 URL 路径。
   *
   * 默认 `/draco/`，对应 three.js 完整 Draco decoder（同时支持 glTF mesh 与点云）。
   * 若只加载 glTF mesh、需要更小的 wasm，可改为 `/draco/gltf/`。
   *
   * Public URL path for Draco decoder files.
   *
   * Defaults to `/draco/`, the full three.js Draco decoder (meshes and point clouds).
   * Use `/draco/gltf/` only when you need the smaller glTF-only decoder.
   */
  dracoDecoderPath?: string
  /**
   * HISM 子系统选项。
   *
   * HISM subsystem options.
   */
  hism?: {
    /**
     * 拾取时是否显示黄色命中点标记，默认 `true`。与运行时 {@link HismManager.showPickMarker} 同构。
     *
     * Whether to show the yellow pick-point marker. Defaults to `true`.
     * Isomorphic with runtime {@link HismManager.showPickMarker}.
     */
    showPickMarker?: boolean
  }
}
