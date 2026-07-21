import type { ImageryLayerOptions } from './imagery'
import type { ViewerSceneOptions } from './scene'
import type { TerrainOptions } from './terrain'
import type { ViewerWidgetOptions } from './widgets'

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
   * 是否启用透明渲染背景。
   *
   * 优先级高于 {@link ViewerOptions.transparent}。
   *
   * Enables a transparent rendering background.
   *
   * Takes precedence over {@link ViewerOptions.transparent}.
   */
  transparent?: boolean
  /**
   * 是否启用 renderer 级抗锯齿。
   *
   * Whether to enable renderer-level antialiasing.
   */
  antialias?: boolean
  /**
   * 多重采样数量。
   *
   * Number of multisampling samples.
   */
  samples?: number
  /**
   * WebGPU renderer 是否强制使用 Three.js WebGL2 fallback backend。
   *
   * 仅当 `type` 为 `webgpu` 时生效。
   *
   * Whether the WebGPU renderer should force Three.js' WebGL2 fallback backend.
   *
   * Only applies when `type` is `webgpu`.
   */
  forceWebGL?: boolean
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
   * 支持 Cesium quantized-mesh URL / Ion 地形，以及天地图 swdx `elv_c` 高程地形。
   *
   * Terrain tile resource options.
   *
   * Supports Cesium quantized-mesh URL / Ion terrain and Tianditu swdx `elv_c`
   * heightmap terrain.
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
   * Three.js renderer 配置。
   *
   * Three.js renderer options.
   */
  renderer?: ViewerRendererOptions
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
   *
   * Prefer `renderer.transparent` for new code.
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
  /**
   * HISM 子系统选项。
   *
   * HISM subsystem options.
   */
  hism?: {
    /**
     * 拾取时是否显示黄色命中点标记，默认 `true`。
     *
     * Whether to show the yellow pick-point marker. Defaults to `true`.
     */
    showPickMarker?: boolean
  }
}
