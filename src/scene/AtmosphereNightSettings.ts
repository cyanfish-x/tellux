import type * as THREE from 'three'
import type { ResolvedSceneOptions } from './SceneOptions'

export class AtmosphereNightSettings {
  constructor(
    private readonly options: ResolvedSceneOptions['atmosphere']['night'],
    private readonly onStateChange: () => void
  ) {}

  /** 是否启用自动夜间光照。Enables automatic nighttime lighting. */
  get enabled() {
    return this.options.enabled
  }

  set enabled(value: boolean) {
    if (this.options.enabled === value) return

    this.options.enabled = value
    this.onStateChange()
  }

  /** 是否启用月光照明。Enables moonlight illumination. */
  get moonLight() {
    return this.options.moonLight
  }

  set moonLight(value: boolean) {
    if (this.options.moonLight === value) return

    this.options.moonLight = value
    this.onStateChange()
  }

  /** 是否启用冷色环境补光。Enables cool ambient fill light. */
  get ambientLight() {
    return this.options.ambientLight
  }

  set ambientLight(value: boolean) {
    if (this.options.ambientLight === value) return

    this.options.ambientLight = value
    this.onStateChange()
  }

  /** 夜间光照颜色。Nighttime light color. */
  get color() {
    return this.options.color
  }

  set color(value: THREE.ColorRepresentation) {
    this.options.color = value
    this.onStateChange()
  }

  /** 月光最大强度。Maximum moonlight intensity. */
  get moonLightIntensity() {
    return this.options.moonLightIntensity
  }

  set moonLightIntensity(value: number) {
    this.options.moonLightIntensity = value
    this.onStateChange()
  }

  /** 夜间环境补光最大强度。Maximum nighttime ambient fill intensity. */
  get ambientIntensity() {
    return this.options.ambientIntensity
  }

  set ambientIntensity(value: number) {
    this.options.ambientIntensity = value
    this.onStateChange()
  }

  /** 是否按月相衰减月光强度。Attenuates moonlight by moon phase. */
  get useMoonPhase() {
    return this.options.useMoonPhase
  }

  set useMoonPhase(value: boolean) {
    if (this.options.useMoonPhase === value) return

    this.options.useMoonPhase = value
    this.onStateChange()
  }

  /** 昼夜过渡范围。Day/night transition range. */
  get transitionRange(): [number, number] {
    return [...this.options.transitionRange]
  }

  set transitionRange(value: [number, number]) {
    this.options.transitionRange = [...value]
    this.onStateChange()
  }

  apply() {
    this.onStateChange()
  }
}
