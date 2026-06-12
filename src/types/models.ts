import type { AnimationClip, Object3D } from 'three'
import type { CartographicInput } from './spatial'

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
