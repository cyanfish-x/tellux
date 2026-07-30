import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'

export class AtmosphereShadowSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['shadow'],
    private readonly onStateChange: () => void
  ) {}

  /** 云影采样的屏幕模糊半径。Screen-space blur radius for cloud shadow sampling. */
  get radius() {
    return this.options.radius
  }

  set radius(value: number) {
    this.options.radius = sceneValueNormalizers.shadowRadius(value)
    this.onStateChange()
  }

  /** 云影 PCF 采样数量，范围 `1` 到 `16`。Cloud shadow PCF sample count from `1` to `16`. */
  get sampleCount() {
    return this.options.sampleCount
  }

  set sampleCount(value: number) {
    this.options.sampleCount = sceneValueNormalizers.shadowSampleCount(value)
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}
