import type { EntityTransparencyMode } from '../types'
import type { ResolvedSceneOptions } from './SceneOptions'

class EntityTransparencySettings {
  constructor(
    private readonly options: ResolvedSceneOptions['entities']['transparency'],
    private readonly onChange: (mode: EntityTransparencyMode) => void
  ) {}

  /**
   * 实体透明渲染模式。与初始化 {@link ViewerSceneOptions.entities}`.transparency.mode` 同构。
   *
   * `auto` 在 WebGL 后处理管线可用时使用 weighted OIT，否则退回排序透明。
   *
   * Entity transparency rendering mode. Isomorphic with
   * {@link ViewerSceneOptions.entities}`.transparency.mode`.
   *
   * `auto` uses weighted OIT when the WebGL post-processing pipeline is
   * available, otherwise sorted transparency.
   */
  get mode() {
    return this.options.mode
  }

  set mode(value: EntityTransparencyMode) {
    if (this.options.mode === value) return
    this.options.mode = value
    this.onChange(value)
  }
}

/**
 * 实体渲染运行时设置。
 *
 * Entity rendering runtime settings.
 */
export class EntitySettings {
  /**
   * 实体透明渲染设置。
   *
   * Entity transparency rendering settings.
   */
  readonly transparency: EntityTransparencySettings

  constructor(
    options: ResolvedSceneOptions['entities'],
    onTransparencyModeChange: (mode: EntityTransparencyMode) => void
  ) {
    this.transparency = new EntityTransparencySettings(
      options.transparency,
      onTransparencyModeChange
    )
  }
}
