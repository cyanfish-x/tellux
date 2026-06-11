import { TilesRenderer } from '3d-tiles-renderer'
import { QuantizedMeshPlugin } from '3d-tiles-renderer/plugins'
import { TerrainFetchPlugin } from '../TerrainFetchPlugin'
import type { ImageryLayer } from '../LayerManager'
import type { TerrainOptions } from '../types'
import {
  type ImageryOverlayContext,
  type ImageryOverlayFactory
} from './ImageryOverlayFactory'
import {
  SurfaceMaterialPlugin,
  type ResolvedSurfaceMaterialMode
} from './TilesetModelPlugins'

export type TerrainTilesetFactoryOptions = {
  imageryOverlayFactory: ImageryOverlayFactory
  getSurfaceMaterialMode: () => ResolvedSurfaceMaterialMode
  registerCommonTilesetPlugins: (tileset: TilesRenderer) => void
}

export type TerrainTilesetCreation = {
  tileset: TilesRenderer
  imageryContext: ImageryOverlayContext
  surfaceMaterialPlugin: SurfaceMaterialPlugin
}

const DEFAULT_TERRAIN_ERROR_TARGET = 1

export class TerrainTilesetFactory {
  constructor(private readonly options: TerrainTilesetFactoryOptions) {}

  create(
    terrain: TerrainOptions,
    layers: ImageryLayer[],
    getLayerOrder: (layer: ImageryLayer) => number
  ): TerrainTilesetCreation {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    const imageryContext = this.options.imageryOverlayFactory.createContext(layers, getLayerOrder, {
      resolution: terrain.tileLoading?.imageryResolution,
      enableTileSplitting: terrain.tileLoading?.enableTileSplitting
    })
    const surfaceMaterialPlugin = new SurfaceMaterialPlugin(this.options.getSurfaceMaterialMode())

    this.registerTerrainProvider(tileset, terrain)
    tileset.registerPlugin(imageryContext.plugin)
    tileset.registerPlugin(surfaceMaterialPlugin)
    this.options.registerCommonTilesetPlugins(tileset)

    return {
      tileset,
      imageryContext,
      surfaceMaterialPlugin
    }
  }

  createHeightSamplingTileset(
    terrain: TerrainOptions,
    configureTileset: (tileset: TilesRenderer) => void
  ) {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    this.registerTerrainProvider(tileset, terrain)
    configureTileset(tileset)
    return tileset
  }

  private registerTerrainProvider(tileset: TilesRenderer, terrain: TerrainOptions | undefined) {
    if (!terrain) return

    const terrainOptions: ConstructorParameters<typeof QuantizedMeshPlugin>[0] & { generateNormals?: boolean } = {
      useRecommendedSettings: terrain.useRecommendedSettings,
      skirtLength: terrain.skirtLength ?? undefined,
      smoothSkirtNormals: terrain.smoothSkirtNormals,
      generateNormals: terrain.generateNormals,
      solid: terrain.solid
    }

    tileset.registerPlugin(new QuantizedMeshPlugin(terrainOptions))
    tileset.errorTarget = terrain.tileLoading?.errorTarget ?? DEFAULT_TERRAIN_ERROR_TARGET
    tileset.registerPlugin(new TerrainFetchPlugin(terrain.url))
  }

  private normalizeTerrainUrl(url: string) {
    const terrainUrl = new URL(url, location.href)
    if (terrainUrl.pathname.endsWith('/layer.json')) {
      terrainUrl.pathname = terrainUrl.pathname.slice(0, -'layer.json'.length)
    } else if (!terrainUrl.pathname.endsWith('/')) {
      terrainUrl.pathname += '/'
    }

    return terrainUrl.toString()
  }
}
