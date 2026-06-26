import type { SurfaceMaterialMode } from '../types'
import type { SurfaceMaterialOptions } from '../materials/materialMode'
import type { ResolvedSceneOptions } from './SceneOptions'

export class SurfaceMaterialSettings {
  constructor(
    private readonly options: SurfaceMaterialOptions,
    private readonly onChange: () => void
  ) {}

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

export class SurfaceSettings {
  private currentMaterialMode: SurfaceMaterialMode
  private readonly onMaterialChange: () => void
  readonly material: SurfaceMaterialSettings

  constructor(options: ResolvedSceneOptions['surface'], onMaterialChange: () => void) {
    this.currentMaterialMode = options.materialMode
    this.onMaterialChange = onMaterialChange
    this.material = new SurfaceMaterialSettings(options.material, this.onMaterialChange)
  }

  /**
   * 基础地球表面瓦片材质模式。
   *
   * `auto` 会根据大气光照模式选择材质。
   *
   * Base globe surface tile material mode.
   *
   * `auto` derives the material from the atmosphere lighting mode.
   */
  get materialMode() {
    return this.currentMaterialMode
  }

  set materialMode(value: SurfaceMaterialMode) {
    if (this.currentMaterialMode === value) return
    this.currentMaterialMode = value
    this.onMaterialChange()
  }
}

function clamp01(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) : fallback
}
