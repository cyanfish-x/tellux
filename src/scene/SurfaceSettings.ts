import type { SurfaceMaterialMode } from '../types'
import type { ResolvedSceneOptions } from './SceneOptions'

export class SurfaceSettings {
  private currentMaterialMode: SurfaceMaterialMode
  private readonly onMaterialModeChange: () => void

  constructor(options: ResolvedSceneOptions['surface'], onMaterialModeChange: () => void) {
    this.currentMaterialMode = options.materialMode
    this.onMaterialModeChange = onMaterialModeChange
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
    this.onMaterialModeChange()
  }
}
