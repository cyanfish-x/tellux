import type { SurfaceMaterialMode } from '../types'
import type { SurfaceMaterialOptions } from '../materials/materialMode'

/**
 * 地球皮肤着色参数。不是 Three.js `Material`，没有 `color` / `map`。
 *
 * Globe skin shading settings. This is not a Three.js `Material` and has
 * no `color` / `map`.
 */
export class SurfaceMaterialSettings {
  constructor(
    private readonly options: SurfaceMaterialOptions,
    private currentMode: SurfaceMaterialMode,
    private readonly onChange: () => void
  ) {}

  /**
   * 地球皮肤材质模式。
   *
   * `auto` 会根据大气光照模式选择材质。
   *
   * Globe skin material mode.
   *
   * `auto` derives the material from the atmosphere lighting mode.
   */
  get mode() {
    return this.currentMode
  }

  set mode(value: SurfaceMaterialMode) {
    if (this.currentMode === value) return
    this.currentMode = value
    this.onChange()
  }

  /** 表面粗糙度。Surface roughness. */
  get roughness() {
    return this.options.roughness
  }

  set roughness(value: number) {
    const nextValue = clamp01(value, 1)
    if (this.options.roughness === nextValue) return

    this.options.roughness = nextValue
    this.onChange()
  }

  /** 表面金属度。Surface metalness. */
  get metalness() {
    return this.options.metalness
  }

  set metalness(value: number) {
    const nextValue = clamp01(value, 0)
    if (this.options.metalness === nextValue) return

    this.options.metalness = nextValue
    this.onChange()
  }

  /** 是否沿用地形或上游材质提供的粗糙度贴图。Whether to keep upstream roughness maps. */
  get useRoughnessMap() {
    return this.options.useRoughnessMap
  }

  set useRoughnessMap(value: boolean) {
    if (this.options.useRoughnessMap === value) return

    this.options.useRoughnessMap = value
    this.onChange()
  }
}

export function clamp01(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback
}
