import type { TilesRenderer } from '3d-tiles-renderer'
import type { PointCloudShading } from '../tiles/PointCloudShading'

/**
 * 已加载 3D Tiles 图层的控制句柄。
 *
 * Handle for a loaded 3D Tiles layer.
 */
export interface TilesetLayer {
  /** 图层 id。Layer id. */
  readonly id: string
  /** 底层 3D Tiles renderer。Underlying 3D Tiles renderer. */
  readonly tileset: TilesRenderer
  /**
   * 点云着色（Cesium 形 API）。非点云图层修改通常无可见效果。
   *
   * Point-cloud shading (Cesium-shaped API). Changes usually have no visible
   * effect on non-point-cloud layers.
   */
  readonly pointCloudShading: PointCloudShading
  /** 是否显示该图层。Whether the layer is visible. */
  show: boolean
  /**
   * 从 Viewer 中移除该图层并释放资源。
   *
   * Removes the layer from Viewer and releases its resources.
   */
  remove(): void
}
