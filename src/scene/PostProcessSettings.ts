import type { ResolvedSceneOptions } from './SceneOptions'

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

export class PostProcessSettings {
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
