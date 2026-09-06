import type { Load3DTilesetOptions, TilesetLayer } from '../types'
import type { TilesetManager } from './TilesetManager'

export let createSceneTilesetCollection: (
  manager: TilesetManager, cancelSampling: () => void
) => SceneTilesetCollection

/**
 * 场景 3D Tiles 集合。只转发独立场景 tileset 的增删查，不暴露地形 / 裸球。
 *
 * Scene 3D Tiles collection. Forwards CRUD for independent scene tilesets
 * only; terrain and the base globe stay behind {@link Globe}.
 */
export class SceneTilesetCollection {
  static {
    createSceneTilesetCollection = (manager, cancelSampling) => new SceneTilesetCollection(manager, cancelSampling)
  }

  private readonly layers = new Map<string, TilesetLayer>()

  private constructor(
    private readonly tilesetManager: TilesetManager,
    private readonly cancelSampling: () => void
  ) {}

  /**
   * 加载独立的 3D Tiles 场景数据。
   *
   * 支持直接传入 `tileset.json` URL，或传入 Cesium Ion 3D Tiles 资源。
   * 该方法加载的是场景 3D Tiles，不参与影像 overlay 管线。
   *
   * Loads an independent 3D Tiles scene dataset.
   *
   * Supports either a direct `tileset.json` URL or a Cesium Ion 3D Tiles asset.
   * The loaded dataset is scene 3D Tiles data and does not participate in the
   * imagery overlay pipeline.
   */
  add(options: Load3DTilesetOptions): TilesetLayer {
    this.cancelSampling()
    const layer = this.wrap(this.tilesetManager.load3DTileset(options))
    this.layers.set(layer.id, layer)
    return layer
  }

  /**
   * 根据 id 获取已加载的 3D Tiles 图层。
   *
   * Gets a loaded 3D Tiles layer by id.
   */
  get(id: string): TilesetLayer | null {
    return this.layers.get(id) ?? null
  }

  /**
   * 列出全部已加载的 3D Tiles 图层。
   *
   * Lists all loaded 3D Tiles layers.
   */
  list(): TilesetLayer[] {
    return [...this.layers.values()]
  }

  /**
   * 根据 id 移除已加载的 3D Tiles 图层。
   *
   * Removes a loaded 3D Tiles layer by id.
   */
  remove(id: string): boolean {
    if (!this.layers.has(id)) return false
    this.cancelSampling()
    this.layers.delete(id)
    return this.tilesetManager.remove3DTileset(id)
  }

  private wrap(layer: TilesetLayer): TilesetLayer {
    const collection = this
    return {
      id: layer.id,
      tileset: layer.tileset,
      pointCloudShading: layer.pointCloudShading,
      get show() {
        return layer.show
      },
      set show(value: boolean) {
        if (layer.show === value) return
        collection.cancelSampling()
        layer.show = value
      },
      remove: () => {
        collection.remove(layer.id)
      }
    }
  }
}
