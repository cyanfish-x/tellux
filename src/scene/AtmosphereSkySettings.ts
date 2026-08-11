import type { ResolvedSceneOptions } from './SceneOptions'
import { sceneValueNormalizers } from './SceneValueNormalization'
import { SceneToggle } from './SceneToggle'

class AtmosphereStarsSettings {
  private readonly visibility: SceneToggle

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['sky']['stars'],
    private readonly onStateChange: () => void
  ) {
    this.visibility = new SceneToggle(options.show, onStateChange)
  }

  /**
   * 星空是否显示。
   *
   * Whether the star field is shown.
   */
  get show() {
    return this.visibility.show
  }

  set show(value: boolean) {
    this.visibility.show = value
  }

  /** 星空亮度缩放。Star field brightness scale. */
  get intensity() {
    return this.options.intensity
  }

  set intensity(value: number) {
    this.options.intensity = sceneValueNormalizers.starsIntensity(value)
    this.onStateChange()
  }

  /** 星点大小（像素点）。Star point size in pixels. */
  get pointSize() {
    return this.options.pointSize
  }

  set pointSize(value: number) {
    this.options.pointSize = sceneValueNormalizers.starsPointSize(value)
    this.onStateChange()
  }
}

export class AtmosphereSkySettings {
  readonly stars: AtmosphereStarsSettings

  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['sky'],
    private readonly onStateChange: () => void
  ) {
    this.stars = new AtmosphereStarsSettings(options.stars, onStateChange)
  }

  /** 是否在天空中绘制太阳盘。Renders the sun disc in the sky. */
  get sun() {
    return this.options.sun
  }

  set sun(value: boolean) {
    this.options.sun = value
    this.onStateChange()
  }

  /** 是否在天空中绘制月亮。Renders the moon in the sky. */
  get moon() {
    return this.options.moon
  }

  set moon(value: boolean) {
    this.options.moon = value
    this.onStateChange()
  }

  /** 是否绘制大气天空里的地面。Renders the ground term in the atmospheric sky. */
  get ground() {
    return this.options.ground
  }

  set ground(value: boolean) {
    this.options.ground = value
    this.onStateChange()
  }

  /** 太阳角半径（弧度）。Sun angular radius in radians. */
  get sunAngularRadius() {
    return this.options.sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.options.sunAngularRadius = sceneValueNormalizers.sunAngularRadius(value)
    this.onStateChange()
  }

  /** 月亮角半径（弧度）。Moon angular radius in radians. */
  get moonAngularRadius() {
    return this.options.moonAngularRadius
  }

  set moonAngularRadius(value: number) {
    this.options.moonAngularRadius = sceneValueNormalizers.moonAngularRadius(value)
    this.onStateChange()
  }

  /** 月光辐射亮度缩放。Lunar radiance scale. */
  get lunarRadianceScale() {
    return this.options.lunarRadianceScale
  }

  set lunarRadianceScale(value: number) {
    this.options.lunarRadianceScale = sceneValueNormalizers.lunarRadianceScale(value)
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}
