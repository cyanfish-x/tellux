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

class BloomSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['postProcess']['bloom'],
    private readonly onChange: () => void
  ) {}

  /** Bloom 是否启用。Whether bloom is enabled. */
  get enabled() {
    return this.options.enabled
  }

  set enabled(value: boolean) {
    if (this.options.enabled === value) return
    this.options.enabled = value
    this.onChange()
  }

  /** Bloom 强度。Bloom intensity. */
  get intensity() {
    return this.options.intensity
  }

  set intensity(value: number) {
    this.setNumber('intensity', sceneValueNormalizers.bloomIntensity(value))
  }

  /** 亮度提取阈值。Luminance threshold. */
  get luminanceThreshold() {
    return this.options.luminanceThreshold
  }

  set luminanceThreshold(value: number) {
    this.setNumber(
      'luminanceThreshold',
      sceneValueNormalizers.bloomLuminanceThreshold(value)
    )
  }

  /** 亮度阈值过渡宽度。Luminance threshold smoothing. */
  get luminanceSmoothing() {
    return this.options.luminanceSmoothing
  }

  set luminanceSmoothing(value: number) {
    this.setNumber(
      'luminanceSmoothing',
      sceneValueNormalizers.bloomLuminanceSmoothing(value)
    )
  }

  /** Bloom 扩散半径。Bloom radius. */
  get radius() {
    return this.options.radius
  }

  set radius(value: number) {
    this.setNumber('radius', sceneValueNormalizers.bloomRadius(value))
  }

  private setNumber(
    key: 'intensity' | 'luminanceThreshold' | 'luminanceSmoothing' | 'radius',
    value: number
  ) {
    if (this.options[key] === value) return
    this.options[key] = value
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
  /** Bloom 后处理阶段。Bloom post-processing stage. */
  readonly bloom: BloomSettings
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  readonly lensFlare: LensFlareSettings
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  readonly smaa: PostProcessStage
  /** TAA 时间抗锯齿后处理阶段。TAA temporal anti-aliasing post-processing stage. */
  readonly taa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  readonly dithering: PostProcessStage

  constructor(options: ResolvedSceneOptions['postProcess'], onChange: () => void) {
    this.bloom = new BloomSettings(options.bloom, onChange)
    this.lensFlare = new LensFlareSettings(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa.enabled, onChange)
    this.taa = new PostProcessStage(options.taa.enabled, onChange)
    this.dithering = new PostProcessStage(options.dithering.enabled, onChange)
  }
}
