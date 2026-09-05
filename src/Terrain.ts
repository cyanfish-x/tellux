import type { TerrainOptions } from './types'

/**
 * 地形门面。Viewer 中地形是单例，用 `set` / `clear` 而非集合动词。
 *
 * Terrain facade. Terrain is a singleton on Viewer, so it uses `set` / `clear`
 * instead of collection verbs.
 */
export class Terrain {
  constructor(
    private readonly getOptions: () => TerrainOptions | undefined,
    private readonly apply: (terrain: TerrainOptions | null) => void
  ) {}

  /**
   * 切换 Cesium quantized-mesh / Ion 或天地图地形，并保留当前影像、相机和控制器状态。
   *
   * Switches Cesium quantized-mesh / Ion or Tianditu terrain while preserving
   * the current imagery, camera, and controls.
   */
  set(options: TerrainOptions): void {
    this.apply(options)
  }

  /**
   * 移除当前地形并回到无地形模式。
   *
   * Removes the current terrain and returns to the non-terrain globe.
   */
  clear(): void {
    this.apply(null)
  }

  /**
   * 当前地形配置；未启用地形时为 `undefined`。
   *
   * Current terrain options, or `undefined` when terrain is not enabled.
   */
  get current(): TerrainOptions | undefined {
    return this.getOptions()
  }
}
