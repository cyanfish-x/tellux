import * as THREE from 'three'
import type { CloudsEffect } from '@takram/three-clouds'
import type { ViewerOptions } from './types'

class SceneToggle {
  private isShown: boolean
  private readonly onChange: () => void

  constructor(isShown: boolean, onChange: () => void) {
    this.isShown = isShown
    this.onChange = onChange
  }

  /**
   * 场景功能是否可见。
   *
   * Whether the scene feature is visible.
   */
  get show() {
    return this.isShown
  }

  set show(value: boolean) {
    if (this.isShown === value) return
    this.isShown = value
    this.onChange()
  }
}

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

class PostProcessStages {
  /** 镜头光晕后处理阶段。Lens flare post-processing stage. */
  lensFlare: PostProcessStage
  /** SMAA 抗锯齿后处理阶段。SMAA anti-aliasing post-processing stage. */
  smaa: PostProcessStage
  /** 抖动后处理阶段。Dithering post-processing stage. */
  dithering: PostProcessStage

  constructor(options: Required<NonNullable<ViewerOptions['scene']>>, onChange: () => void) {
    this.lensFlare = new PostProcessStage(options.lensFlare, onChange)
    this.smaa = new PostProcessStage(options.smaa, onChange)
    this.dithering = new PostProcessStage(options.dithering, onChange)
  }
}

/**
 * 场景级控制项和底层 Three.js 场景。
 *
 * 通常通过 {@link Viewer.scene} 访问。
 *
 * Scene-level controls and the underlying Three.js scene.
 *
 * Access this through {@link Viewer.scene}.
 */
export class Scene {
  /**
   * 底层 Three.js 场景，可用于添加自定义对象。
   *
   * Underlying Three.js scene for adding custom objects.
   */
  readonly threeScene = new THREE.Scene()
  /**
   * 云层可见性开关。
   *
   * Cloud visibility toggle.
   */
  clouds: SceneToggle
  /**
   * 大气可见性开关。
   *
   * Atmosphere visibility toggle.
   */
  skyAtmosphere: SceneToggle
  /**
   * 后处理阶段控制项。
   *
   * Post-processing stage controls.
   */
  postProcessStages: PostProcessStages
  private currentCloudCoverage: number
  private readonly getCloudsEffect: () => CloudsEffect | null

  constructor(
    options: Required<NonNullable<ViewerOptions['scene']>>,
    getCloudsEffect: () => CloudsEffect | null,
    onEffectsChange: () => void
  ) {
    this.currentCloudCoverage = options.cloudCoverage
    this.getCloudsEffect = getCloudsEffect
    this.clouds = new SceneToggle(options.clouds, onEffectsChange)
    this.skyAtmosphere = new SceneToggle(options.skyAtmosphere, onEffectsChange)
    this.postProcessStages = new PostProcessStages(options, onEffectsChange)
  }

  /**
   * 云覆盖率，范围 `0` 到 `1`。
   *
   * Cloud coverage from `0` to `1`.
   */
  get cloudCoverage() {
    return this.currentCloudCoverage
  }

  set cloudCoverage(value: number) {
    this.currentCloudCoverage = value
    const clouds = this.getCloudsEffect()
    if (clouds) clouds.coverage = value
  }
}
