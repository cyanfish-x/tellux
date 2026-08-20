import type {
  TerrainMaterialDecorator,
  TerrainOptions,
  TerrainTileListener,
  TerrainTileObserverOptions
} from '../types'
import type { TerrainTileLifecycleManager } from './TerrainTileLifecycleManager'

export interface TerrainRuntimeOptions {
  lifecycle: TerrainTileLifecycleManager
  getOptions: () => TerrainOptions | undefined
  setTerrain: (terrain: TerrainOptions | null) => void
}

/**
 * Viewer 的地形运行时控制门面。
 *
 * Runtime terrain control facade for a Viewer.
 */
export class TerrainRuntime {
  constructor(private readonly runtime: TerrainRuntimeOptions) {}

  /** 当前地形配置。Current terrain options. */
  get options(): Readonly<TerrainOptions> | undefined {
    return this.runtime.getOptions()
  }

  /**
   * 切换或移除当前地形。省略参数或传入 `null` 时移除地形。
   *
   * Switches or removes the current terrain. Omitting the argument or passing
   * `null` removes terrain.
   */
  set(options?: TerrainOptions | null) {
    this.runtime.setTerrain(options ?? null)
  }

  /**
   * 观察当前地形的流式瓦片生命周期。
   *
   * Observes streaming tile lifecycle events for the current terrain.
   */
  observeTiles(listener: TerrainTileListener, options?: TerrainTileObserverOptions) {
    return this.runtime.lifecycle.observeTiles(listener, options)
  }

  /**
   * 注册受控地形材质装饰器，并返回幂等注销函数。
   *
   * Registers a controlled terrain material decorator and returns an idempotent
   * unregister function.
   */
  addMaterialDecorator(decorator: TerrainMaterialDecorator) {
    return this.runtime.lifecycle.addMaterialDecorator(decorator)
  }
}
