import { TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins'
import { QuantizedMeshPlugin } from '3d-tiles-renderer/plugins'
import { TerrainFetchPlugin } from '../TerrainFetchPlugin'
import type { ImageryLayer } from '../LayerManager'
import type { SurfaceMaterialOptions } from '../materials/materialMode'
import { TiandituTerrainPlugin } from './TiandituTerrainPlugin'
import type {
  CesiumIonTerrainOptions,
  TerrainOptions,
  TerrainRenderOptions,
  TiandituTerrainOptions,
  UrlTerrainOptions
} from '../types'
import {
  type ImageryOverlayContext,
  type ImageryOverlayFactory
} from './ImageryOverlayFactory'
import {
  SurfaceMaterialPlugin,
  type ResolvedSurfaceMaterialMode
} from './TilesetModelPlugins'
import { WebGPUTerrainOverlayPlugin } from './WebGPUTerrainOverlayPlugin'

export type TerrainTilesetFactoryOptions = {
  imageryOverlayFactory: ImageryOverlayFactory
  getSurfaceMaterialMode: () => ResolvedSurfaceMaterialMode
  getSurfaceMaterialOptions: () => SurfaceMaterialOptions
  useDirectOverlayTexture: boolean
  registerCommonTilesetPlugins: (tileset: TilesRenderer) => void
}

export type TerrainTilesetCreation = {
  tileset: TilesRenderer
  imageryContext: ImageryOverlayContext
  surfaceMaterialPlugin: SurfaceMaterialPlugin
}

type QuantizedMeshTerrainOptions = ConstructorParameters<typeof QuantizedMeshPlugin>[0] & {
  generateNormals?: boolean
}

const DEFAULT_TERRAIN_ERROR_TARGET = 1

export class TerrainTilesetFactory {
  constructor(private readonly options: TerrainTilesetFactoryOptions) {}

  create(
    terrain: TerrainOptions,
    layers: ImageryLayer[],
    getLayerOrder: (layer: ImageryLayer) => number
  ): TerrainTilesetCreation {
    const tileset = this.createTerrainRenderer(terrain)
    const imageryContext = this.options.imageryOverlayFactory.createContext(layers, getLayerOrder, {
      resolution: terrain.tileLoading?.imageryResolution,
      enableTileSplitting: terrain.tileLoading?.enableTileSplitting
    })
    const imageryPlugin = this.options.useDirectOverlayTexture
      ? new WebGPUTerrainOverlayPlugin(
          [...imageryContext.overlays.values()],
          terrain.tileLoading?.imageryResolution,
          terrain.tileLoading?.enableTileSplitting ?? true
        )
      : imageryContext.plugin
    const surfaceMaterialPlugin = new SurfaceMaterialPlugin(
      this.options.getSurfaceMaterialMode(),
      this.options.getSurfaceMaterialOptions()
    )

    this.registerTerrainProvider(tileset, terrain)
    imageryContext.plugin = imageryPlugin
    tileset.registerPlugin(imageryPlugin)
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
    const tileset = this.createTerrainRenderer(terrain)
    this.registerTerrainProvider(tileset, terrain)
    configureTileset(tileset)
    return tileset
  }

  private createTerrainRenderer(terrain: TerrainOptions) {
    if (this.isTiandituTerrainOptions(terrain)) {
      return new TilesRenderer(this.getTiandituRootUrl(terrain))
    }

    if (this.isUrlTerrainOptions(terrain)) {
      return new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    }

    return new TilesRenderer()
  }

  private registerTerrainProvider(tileset: TilesRenderer, terrain: TerrainOptions | undefined) {
    if (!terrain) return

    if (this.isTiandituTerrainOptions(terrain)) {
      tileset.registerPlugin(
        new TiandituTerrainPlugin({
          token: terrain.token,
          urls: terrain.urls,
          subdomains: terrain.subdomains,
          topLevel: terrain.topLevel,
          bottomLevel: terrain.bottomLevel,
          useRecommendedSettings: terrain.useRecommendedSettings,
          skirtLength: terrain.skirtLength ?? undefined,
          generateNormals: terrain.generateNormals
        })
      )
      this.applyTerrainLoadingOptions(tileset, terrain)
      return
    }

    const terrainOptions = this.createQuantizedMeshTerrainOptions(terrain)

    if (this.isCesiumIonTerrainOptions(terrain)) {
      this.registerCesiumIonTerrainProvider(tileset, terrain, terrainOptions)
      return
    }

    tileset.registerPlugin(new QuantizedMeshPlugin(terrainOptions))
    this.applyTerrainLoadingOptions(tileset, terrain)
    tileset.registerPlugin(new TerrainFetchPlugin(terrain.url))
  }

  private registerCesiumIonTerrainProvider(
    tileset: TilesRenderer,
    terrain: CesiumIonTerrainOptions,
    terrainOptions: QuantizedMeshTerrainOptions
  ) {
    tileset.registerPlugin(
      new CesiumIonAuthPlugin({
        apiToken: terrain.apiToken,
        assetId: String(terrain.assetId),
        autoRefreshToken: terrain.autoRefreshToken ?? true,
        useRecommendedSettings: terrain.useRecommendedSettings ?? true,
        assetTypeHandler: (type, terrainTileset) => {
          if (type !== 'TERRAIN') {
            throw new Error(`TerrainTilesetFactory: Cesium Ion asset type "${type}" is not supported by terrain.`)
          }

          if (!terrainTileset.getPluginByName('QUANTIZED_MESH_PLUGIN')) {
            terrainTileset.registerPlugin(new QuantizedMeshPlugin(terrainOptions))
          }
          this.applyTerrainLoadingOptions(terrainTileset, terrain)
        }
      })
    )
  }

  private createQuantizedMeshTerrainOptions(terrain: TerrainRenderOptions): QuantizedMeshTerrainOptions {
    return {
      useRecommendedSettings: terrain.useRecommendedSettings,
      skirtLength: terrain.skirtLength ?? undefined,
      smoothSkirtNormals: terrain.smoothSkirtNormals,
      generateNormals: terrain.generateNormals,
      solid: terrain.solid
    }
  }

  private applyTerrainLoadingOptions(tileset: { errorTarget: number }, terrain: TerrainRenderOptions) {
    tileset.errorTarget = terrain.tileLoading?.errorTarget ?? DEFAULT_TERRAIN_ERROR_TARGET
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

  private getTiandituRootUrl(terrain: TiandituTerrainOptions) {
    const url = terrain.urls?.[0]
    if (url) {
      const rootUrl = new URL(url, location.href)
      if (!rootUrl.pathname.endsWith('/')) {
        rootUrl.pathname += '/'
      }
      return rootUrl.toString()
    }

    return 'https://t0.tianditu.gov.cn/mapservice/swdx/'
  }

  private isTiandituTerrainOptions(terrain: TerrainOptions): terrain is TiandituTerrainOptions {
    return terrain.type === 'tianditu'
  }

  private isCesiumIonTerrainOptions(terrain: TerrainOptions): terrain is CesiumIonTerrainOptions {
    return terrain.type === 'cesium-ion'
  }

  private isUrlTerrainOptions(terrain: TerrainOptions): terrain is UrlTerrainOptions {
    return terrain.type === undefined || terrain.type === 'url'
  }
}
