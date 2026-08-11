import type { LensFlareQuality } from '../types'
import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

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

class LensFlareThresholdSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['postProcess']['lensFlare']['threshold'],
    private readonly onChange: () => void
  ) {}

  /** 亮部提取阈值。Bright-pass threshold level. */
  get level() {
    return this.options.level
  }

  set level(value: number) {
    const next = sceneValueNormalizers.lensFlareThresholdLevel(value)
    if (this.options.level === next) return
    this.options.level = next
    this.onChange()
  }

  /** 亮部提取过渡宽度。Bright-pass threshold range. */
  get range() {
    return this.options.range
  }

  set range(value: number) {
    const next = sceneValueNormalizers.lensFlareThresholdRange(value)
    if (this.options.range === next) return
    this.options.range = next
    this.onChange()
  }
}

class LensFlareSettings {
  readonly threshold: LensFlareThresholdSettings
  private isEnabled: boolean
  private currentIntensity: number
  private currentQuality: LensFlareQuality
  private readonly onChange: () => void

  constructor(
    options: ResolvedSceneOptions['postProcess']['lensFlare'],
    onChange: () => void
  ) {
    this.onChange = onChange
    this.isEnabled = options.enabled
    this.currentIntensity = options.intensity
    this.currentQuality = options.quality
    this.threshold = new LensFlareThresholdSettings(options.threshold, onChange)
  }

  /**
   * 镜头光晕是否启用。
   *
   * Whether lens flare is enabled.
   */
  get enabled() {
    return this.isEnabled
  }

  set enabled(value: boolean) {
    if (this.isEnabled === value) return
    this.isEnabled = value
    this.onChange()
  }

  /** 光晕强度。Lens flare intensity. */
  get intensity() {
    return this.currentIntensity
  }

  set intensity(value: number) {
    const next = sceneValueNormalizers.lensFlareIntensity(value)
    if (this.currentIntensity === next) return
    this.currentIntensity = next
    this.onChange()
  }

  /** 光晕质量档位。Lens flare quality preset. */
  get quality() {
    return this.currentQuality
  }

  set quality(value: LensFlareQuality) {
    const next = sceneValueNormalizers.lensFlareQuality(value)
    if (this.currentQuality === next) return
    this.currentQuality = next
    this.onChange()
  }
}

export class PostProcessSettings {
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  readonly lensFlare: LensFlareSettings
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  readonly smaa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  readonly dithering: PostProcessStage

  constructor(options: ResolvedSceneOptions['postProcess'], onChange: () => void) {
    this.lensFlare = new LensFlareSettings(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa.enabled, onChange)
    this.dithering = new PostProcessStage(options.dithering.enabled, onChange)
  }
}
