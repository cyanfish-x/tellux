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

type DirectTextureOverlay = ImageOverlay & {
  init(): Promise<unknown> | unknown
  whenReady(): Promise<unknown> | unknown
  hasContent(range: number[], level?: number | null): boolean
  getTexture(range: number[], level?: number | null): Promise<unknown> | unknown
  lockTexture(range: number[], level?: number | null): Promise<unknown> | unknown
  releaseTexture(range: number[], level?: number | null): void
  setResolution(resolution: number): void
}

export type SurfaceTilesetFactoryOptions = {
  imageryOverlayFactory: ImageryOverlayFactory
  getSurfaceMaterialMode: () => ResolvedSurfaceMaterialMode
  useDirectOverlayTexture: boolean
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

const DIRECT_TEXTURE_RANGE_EPSILON = 2e-10

export class SurfaceTilesetFactory {
  constructor(private readonly options: SurfaceTilesetFactoryOptions) {}

  create(layers: ImageryLayer[], getLayerOrder: (layer: ImageryLayer) => number): SurfaceTilesetCreation {
    const tileset = new TilesRenderer()
    const imageryContext = this.options.imageryOverlayFactory.createContext(layers, getLayerOrder)
    const tilingOverlay = imageryContext.overlays.values().next().value ?? null
    const generatedSurfaceOverlay =
      tilingOverlay && this.options.useDirectOverlayTexture
        ? this.createCompositedDirectTextureOverlay(tilingOverlay)
        : tilingOverlay
    const surfaceMaterialPlugin = new SurfaceMaterialPlugin(this.options.getSurfaceMaterialMode())

    tileset.registerPlugin(generatedSurfaceOverlay ? new GeneratedSurfacePlugin({
      overlay: generatedSurfaceOverlay,
      shape: 'ellipsoid',
      applyOverlayTexture: this.options.useDirectOverlayTexture
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

  private createCompositedDirectTextureOverlay(overlay: ImageOverlay) {
    const source = overlay as DirectTextureOverlay
    const directOverlay = Object.create(overlay) as DirectTextureOverlay
    directOverlay.init = () => source.init()
    directOverlay.whenReady = () => source.whenReady()
    directOverlay.setResolution = (resolution) => source.setResolution(resolution)
    directOverlay.hasContent = (range, level) => source.hasContent(this.expandTextureRange(range), level)
    directOverlay.getTexture = (range, level) => source.getTexture(this.expandTextureRange(range), level)
    directOverlay.lockTexture = (range, level) => source.lockTexture(this.expandTextureRange(range), level)
    directOverlay.releaseTexture = (range, level) => source.releaseTexture(this.expandTextureRange(range), level)
    return directOverlay
  }

  private expandTextureRange(range: number[]) {
    const epsilon = DIRECT_TEXTURE_RANGE_EPSILON
    return [
      Math.max(0, range[0] - epsilon),
      Math.max(0, range[1] - epsilon),
      Math.min(1, range[2] + epsilon),
      Math.min(1, range[3] + epsilon)
    ]
  }
}
