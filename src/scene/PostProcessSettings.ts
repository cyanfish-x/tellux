import type { LensFlareQuality } from '../types'
import type { ResolvedPostProcessOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

class PostProcessStage {
  #isEnabled: boolean
  readonly #onChange: () => void

  constructor(isEnabled: boolean, onChange: () => void) {
    this.#isEnabled = isEnabled
    this.#onChange = onChange
  }

  /**
   * 该后处理阶段是否启用。
   *
   * Whether this post-processing stage is enabled.
   */
  get enabled() {
    return this.#isEnabled
  }

  set enabled(value: boolean) {
    if (this.#isEnabled === value) return
    this.#isEnabled = value
    this.#onChange()
  }
}

class BloomSettings {
  readonly #options: ResolvedPostProcessOptions['bloom']
  readonly #onChange: () => void

  constructor(
    options: ResolvedPostProcessOptions['bloom'],
    onChange: () => void
  ) {
    this.#options = options
    this.#onChange = onChange
  }

  /** Bloom 是否启用。Whether bloom is enabled. */
  get enabled() {
    return this.#options.enabled
  }

  set enabled(value: boolean) {
    if (this.#options.enabled === value) return
    this.#options.enabled = value
    this.#onChange()
  }

  /** Bloom 强度（亮部混合系数）。Bloom intensity (bright-pass mix). */
  get intensity() {
    return this.#options.intensity
  }

  set intensity(value: number) {
    this.#setNumber('intensity', sceneValueNormalizers.bloomIntensity(value))
  }

  /** 亮度提取阈值。Luminance threshold. */
  get luminanceThreshold() {
    return this.#options.luminanceThreshold
  }

  set luminanceThreshold(value: number) {
    this.#setNumber(
      'luminanceThreshold',
      sceneValueNormalizers.bloomLuminanceThreshold(value)
    )
  }

  /** 亮度阈值过渡宽度。Luminance threshold smoothing. */
  get luminanceSmoothing() {
    return this.#options.luminanceSmoothing
  }

  set luminanceSmoothing(value: number) {
    this.#setNumber(
      'luminanceSmoothing',
      sceneValueNormalizers.bloomLuminanceSmoothing(value)
    )
  }

  /** Bloom 扩散半径。Bloom radius. */
  get radius() {
    return this.#options.radius
  }

  set radius(value: number) {
    this.#setNumber('radius', sceneValueNormalizers.bloomRadius(value))
  }

  #setNumber(
    key: 'intensity' | 'luminanceThreshold' | 'luminanceSmoothing' | 'radius',
    value: number
  ) {
    if (this.#options[key] === value) return
    this.#options[key] = value
    this.#onChange()
  }
}

class LensFlareThresholdSettings {
  readonly #options: ResolvedPostProcessOptions['lensFlare']['threshold']
  readonly #onChange: () => void

  constructor(
    options: ResolvedPostProcessOptions['lensFlare']['threshold'],
    onChange: () => void
  ) {
    this.#options = options
    this.#onChange = onChange
  }

  /** 亮部提取阈值。Bright-pass threshold level. */
  get level() {
    return this.#options.level
  }

  set level(value: number) {
    const next = sceneValueNormalizers.lensFlareThresholdLevel(value)
    if (this.#options.level === next) return
    this.#options.level = next
    this.#onChange()
  }

  /** 亮部提取过渡宽度。Bright-pass threshold range. */
  get range() {
    return this.#options.range
  }

  set range(value: number) {
    const next = sceneValueNormalizers.lensFlareThresholdRange(value)
    if (this.#options.range === next) return
    this.#options.range = next
    this.#onChange()
  }
}

class LensFlareSettings {
  readonly threshold: LensFlareThresholdSettings
  #isEnabled: boolean
  #currentIntensity: number
  #currentQuality: LensFlareQuality
  readonly #onChange: () => void

  constructor(
    options: ResolvedPostProcessOptions['lensFlare'],
    onChange: () => void
  ) {
    this.#onChange = onChange
    this.#isEnabled = options.enabled
    this.#currentIntensity = options.intensity
    this.#currentQuality = options.quality
    this.threshold = new LensFlareThresholdSettings(options.threshold, onChange)
  }

  /**
   * 镜头光晕是否启用。
   *
   * Whether lens flare is enabled.
   */
  get enabled() {
    return this.#isEnabled
  }

  set enabled(value: boolean) {
    if (this.#isEnabled === value) return
    this.#isEnabled = value
    this.#onChange()
  }

  /** 光晕强度。Lens flare intensity. */
  get intensity() {
    return this.#currentIntensity
  }

  set intensity(value: number) {
    const next = sceneValueNormalizers.lensFlareIntensity(value)
    if (this.#currentIntensity === next) return
    this.#currentIntensity = next
    this.#onChange()
  }

  /** 光晕质量档位。Lens flare quality preset. */
  get quality() {
    return this.#currentQuality
  }

  set quality(value: LensFlareQuality) {
    const next = sceneValueNormalizers.lensFlareQuality(value)
    if (this.#currentQuality === next) return
    this.#currentQuality = next
    this.#onChange()
  }
}

class AutoExposureSettings {
  readonly #options: ResolvedPostProcessOptions['autoExposure']

  constructor(options: ResolvedPostProcessOptions['autoExposure']) {
    this.#options = options
  }

  /**
   * 是否启用自动曝光。
   *
   * Whether auto exposure is enabled.
   */
  get enabled() {
    return this.#options.enabled
  }

  set enabled(value: boolean) {
    this.#options.enabled = value
  }

  /** 白天曝光下限。Daytime exposure floor. */
  get min() {
    return this.#options.min
  }

  set min(value: number) {
    this.#options.min = sceneValueNormalizers.autoExposureMin(value)
  }

  /** 夜晚曝光上限。Nighttime exposure ceiling. */
  get max() {
    return this.#options.max
  }

  set max(value: number) {
    this.#options.max = sceneValueNormalizers.autoExposureMax(value)
  }

  /** 适应速度。Adaptation speed. */
  get speed() {
    return this.#options.speed
  }

  set speed(value: number) {
    this.#options.speed = sceneValueNormalizers.autoExposureSpeed(value)
  }
}

export class PostProcessSettings {
  /** Bloom 后处理阶段。Bloom post-processing stage. */
  readonly bloom: BloomSettings
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  readonly lensFlare: LensFlareSettings
  /**
   * SMAA 抗锯齿后处理阶段。图像空间、运行时可切。
   * 硬件 MSAA 见 `viewer.renderer` 初始化配置的 `antialias` / `samples`，创建后不可改。
   *
   * SMAA anti-aliasing post-processing stage. Image-space and runtime-togglable.
   * Hardware MSAA is `antialias` / `samples` on `viewer.renderer` init options and
   * cannot change after creation.
   */
  readonly smaa: PostProcessStage
  /**
   * TAA 时间抗锯齿后处理阶段。图像空间、运行时可切；有拖影代价。
   * 硬件 MSAA 见 `viewer.renderer` 初始化配置的 `antialias` / `samples`。
   *
   * TAA temporal anti-aliasing post-processing stage. Image-space and
   * runtime-togglable; may cause ghosting. Hardware MSAA is `antialias` /
   * `samples` on `viewer.renderer` init options.
   */
  readonly taa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  readonly dithering: PostProcessStage
  /**
   * 自动曝光。用夜因子在 min（白天）与 max（夜晚）之间平滑插值曝光。
   *
   * Auto exposure. Smoothly interpolates exposure between min (day) and max
   * (night) from the night factor.
   */
  readonly autoExposure: AutoExposureSettings

  constructor(
    private readonly options: ResolvedPostProcessOptions,
    onChange: () => void,
    private readonly onToneMappingExposureChange: (value: number) => void = () => {}
  ) {
    this.bloom = new BloomSettings(options.bloom, onChange)
    this.lensFlare = new LensFlareSettings(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa.enabled, onChange)
    this.taa = new PostProcessStage(options.taa.enabled, onChange)
    this.dithering = new PostProcessStage(options.dithering.enabled, onChange)
    this.autoExposure = new AutoExposureSettings(options.autoExposure)
  }

  /**
   * 渲染器色调映射曝光值。
   *
   * 不要直接写 `viewer.renderer.raw.toneMappingExposure`：实体与高亮颜色的 AgX
   * 反求补偿会用旧曝光值。
   *
   * Renderer tone mapping exposure.
   *
   * Do not write `viewer.renderer.raw.toneMappingExposure` directly: entity and
   * highlight AgX inverse compensation would keep using the previous exposure.
   */
  get toneMappingExposure() {
    return this.options.toneMappingExposure
  }

  set toneMappingExposure(value: number) {
    if (this.options.toneMappingExposure === value) return
    this.options.toneMappingExposure = value
    this.onToneMappingExposureChange(value)
  }
}
