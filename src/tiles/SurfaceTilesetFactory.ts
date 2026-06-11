import { TilesRenderer } from '3d-tiles-renderer'
import * as TilesRendererPlugins from '3d-tiles-renderer/plugins'
import type { ImageOverlay } from '3d-tiles-renderer/plugins'
import type { ImageryLayer } from '../LayerManager'
import {
  type ImageryOverlayContext,
  type ImageryOverlayFactory
} from './ImageryOverlayFactory'
import {
  SurfaceMaterialPlugin,
  type ResolvedSurfaceMaterialMode
} from './TilesetModelPlugins'

type GeneratedSurfacePluginConstructor = new (options?: {
  overlay?: ImageOverlay | null
  shape?: 'ellipsoid' | 'planar'
  applyOverlayTexture?: boolean
}) => object

export type SurfaceTilesetFactoryOptions = {
  imageryOverlayFactory: ImageryOverlayFactory
  getSurfaceMaterialMode: () => ResolvedSurfaceMaterialMode
  registerCommonTilesetPlugins: (tileset: TilesRenderer) => void
}

export type SurfaceTilesetCreation = {
  tileset: TilesRenderer
  imageryContext: ImageryOverlayContext
  surfaceMaterialPlugin: SurfaceMaterialPlugin
}

const { GeneratedSurfacePlugin } = TilesRendererPlugins as unknown as {
  GeneratedSurfacePlugin: GeneratedSurfacePluginConstructor
}

export class SurfaceTilesetFactory {
  constructor(private readonly options: SurfaceTilesetFactoryOptions) {}

  create(layers: ImageryLayer[], getLayerOrder: (layer: ImageryLayer) => number): SurfaceTilesetCreation {
    const tileset = new TilesRenderer()
    const imageryContext = this.options.imageryOverlayFactory.createContext(layers, getLayerOrder)
    const tilingOverlay = imageryContext.overlays.values().next().value ?? null
    const surfaceMaterialPlugin = new SurfaceMaterialPlugin(this.options.getSurfaceMaterialMode())

    tileset.registerPlugin(tilingOverlay ? new GeneratedSurfacePlugin({
      overlay: tilingOverlay,
      shape: 'ellipsoid',
      applyOverlayTexture: false
    }) : new GeneratedSurfacePlugin({ shape: 'ellipsoid' }))
    tileset.registerPlugin(imageryContext.plugin)
    tileset.registerPlugin(surfaceMaterialPlugin)
    this.options.registerCommonTilesetPlugins(tileset)

    return {
      tileset,
      imageryContext,
      surfaceMaterialPlugin
    }
  }
}
