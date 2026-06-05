import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer } from '3d-tiles-renderer'
import * as TilesRendererPlugins from '3d-tiles-renderer/plugins'
import {
  CesiumIonAuthPlugin,
  CesiumIonOverlay,
  GLTFExtensionsPlugin,
  ImageOverlayPlugin,
  QuantizedMeshPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
  type ImageOverlay,
  XYZTilesOverlay,
  XYZTilesPlugin
} from '3d-tiles-renderer/plugins'
import { TerrainFetchPlugin } from '../TerrainFetchPlugin'
import { TileCreasedNormalsPlugin } from '../TileCreasedNormalsPlugin'
import type {
  ImageryOverlayResourceOptions,
  ImageryProviderOptions,
  ImageryProviderResourceOptions,
  MVTGetStyleCallback,
  MVTResourceOptions,
  TerrainOptions
} from '../types'
import type { ThreeRendererWithEffects } from '../effects'

type MVTOverlayOptions = {
  url: string
  levels?: number
  projection?: string
  resolution?: number
  opacity?: number
  color?: THREE.ColorRepresentation
  alphaMask?: boolean
  alphaInvert?: boolean
  getStyle?: MVTGetStyleCallback
}

type MVTOverlayInstance = ImageOverlay & {
  fetchOptions: RequestInit
  getTexture(range: number[]): THREE.Texture | null
  lockTexture(range: number[]): Promise<THREE.Texture | null>
}

type MVTOverlayConstructor = new (options: MVTOverlayOptions) => MVTOverlayInstance

type GeneratedSurfacePluginConstructor = new (options: {
  overlay?: ImageOverlay | null
  shape?: 'ellipsoid' | 'planar'
  applyOverlayTexture?: boolean
}) => object

const { GeneratedSurfacePlugin, MVTOverlay } = TilesRendererPlugins as unknown as {
  GeneratedSurfacePlugin: GeneratedSurfacePluginConstructor
  MVTOverlay: MVTOverlayConstructor
}

export interface TilesetManagerOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: ThreeRendererWithEffects
  dracoLoader: DRACOLoader
  transparentOverlayTexture: THREE.Texture
  imageryProvider?: ImageryProviderOptions
  imageryOverlays?: ImageryOverlayResourceOptions[]
  terrain?: TerrainOptions
  creasedNormals?: boolean
}

export class TilesetManager {
  private activeSurfaceTileset: TilesRenderer
  private activeTerrainTileset: TilesRenderer | null = null
  private currentImageryProvider: ImageryProviderOptions | undefined
  private currentImageryOverlays: ImageryOverlayResourceOptions[]
  private currentTerrain: TerrainOptions | undefined

  constructor(private readonly options: TilesetManagerOptions) {
    this.currentImageryProvider = options.imageryProvider
    this.currentImageryOverlays = options.imageryOverlays ?? []
    this.currentTerrain = options.terrain

    this.activeSurfaceTileset = this.createSurfaceTileset(this.currentImageryProvider?.resource, this.currentImageryOverlays)
    this.options.scene.add(this.activeSurfaceTileset.group)
    if (this.currentTerrain) {
      this.activeTerrainTileset = this.createTerrainTileset(
        this.currentTerrain,
        this.currentImageryProvider?.resource,
        this.currentImageryOverlays
      )
      this.options.scene.add(this.activeTerrainTileset.group)
    }
    this.syncSurfaceVisibility()
    this.syncActiveTilesetReference()
  }

  get tileset() {
    return this.activeTerrainTileset ?? this.activeSurfaceTileset
  }

  get surfaceTileset() {
    return this.activeSurfaceTileset
  }

  get terrainTileset() {
    return this.activeTerrainTileset
  }

  setImageryProvider(imageryProvider: ImageryProviderOptions) {
    this.currentImageryProvider = imageryProvider
    this.replaceSurfaceTileset(this.createSurfaceTileset(this.currentImageryProvider.resource, this.currentImageryOverlays))
    if (this.currentTerrain) {
      this.replaceTerrainTileset(this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider.resource, this.currentImageryOverlays))
    }
  }

  setImageryOverlays(imageryOverlays: ImageryOverlayResourceOptions[] = []) {
    this.currentImageryOverlays = imageryOverlays
    this.replaceSurfaceTileset(this.createSurfaceTileset(this.currentImageryProvider?.resource, this.currentImageryOverlays))
    if (this.currentTerrain) {
      this.replaceTerrainTileset(this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider?.resource, this.currentImageryOverlays))
    }
  }

  setTerrain(terrain: TerrainOptions | null | undefined) {
    this.currentTerrain = terrain ?? undefined
    this.replaceTerrainTileset(
      this.currentTerrain
        ? this.createTerrainTileset(this.currentTerrain, this.currentImageryProvider?.resource, this.currentImageryOverlays)
        : null
    )
  }

  update() {
    this.tileset.update()
  }

  resize() {
    this.activeSurfaceTileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
    this.activeTerrainTileset?.setResolutionFromRenderer(this.options.camera, this.options.renderer)
  }

  dispose() {
    this.activeTerrainTileset?.dispose()
    this.activeSurfaceTileset.dispose()
  }

  private createSurfaceTileset(
    resource: ImageryProviderResourceOptions | undefined,
    overlays: ImageryOverlayResourceOptions[] = []
  ) {
    const tileset = new TilesRenderer()
    if (overlays.length > 0) {
      this.registerSurfaceImageryStack(tileset, resource, overlays)
    } else {
      this.registerImageryProvider(tileset, resource, false)
    }
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private createTerrainTileset(
    terrain: TerrainOptions,
    resource: ImageryProviderResourceOptions | undefined,
    overlays: ImageryOverlayResourceOptions[] = []
  ) {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    this.registerTerrainProvider(tileset, terrain)
    this.registerTerrainImagery(tileset, resource, overlays)
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private registerCommonTilesetPlugins(tileset: TilesRenderer) {
    tileset.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: this.options.dracoLoader, autoDispose: false }))
    if (this.options.creasedNormals) {
      tileset.registerPlugin(new TileCreasedNormalsPlugin())
    }
    tileset.registerPlugin(new TilesFadePlugin())
    tileset.registerPlugin(new UpdateOnChangePlugin())
    tileset.setCamera(this.options.camera)
    tileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
  }

  private replaceSurfaceTileset(nextTileset: TilesRenderer) {
    const previousTileset = this.activeSurfaceTileset

    this.options.scene.remove(previousTileset.group)
    previousTileset.dispose()
    this.activeSurfaceTileset = nextTileset
    this.options.scene.remove(nextTileset.group)
    this.options.scene.add(nextTileset.group)
    if (this.activeTerrainTileset) {
      this.options.scene.remove(this.activeTerrainTileset.group)
      this.options.scene.add(this.activeTerrainTileset.group)
    }
    this.syncSurfaceVisibility()
    this.syncActiveTilesetReference()
    this.resize()
  }

  private replaceTerrainTileset(nextTileset: TilesRenderer | null) {
    const previousTileset = this.activeTerrainTileset

    if (previousTileset) {
      this.options.scene.remove(previousTileset.group)
      previousTileset.dispose()
    }
    this.activeTerrainTileset = nextTileset
    if (nextTileset) {
      this.options.scene.add(nextTileset.group)
    }
    this.syncSurfaceVisibility()
    this.syncActiveTilesetReference()
    this.resize()
  }

  private syncActiveTilesetReference() {
    this.options.camera.userData.tilesRenderer = this.tileset
  }

  private syncSurfaceVisibility() {
    this.activeSurfaceTileset.group.visible = this.activeTerrainTileset === null
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
    tileset.registerPlugin(new TerrainFetchPlugin(terrain.url))
  }

  private registerImageryProvider(tileset: TilesRenderer, resource: ImageryProviderResourceOptions | undefined, useOverlay: boolean) {
    if (!resource) return

    switch (resource.type) {
      case 'template-url': {
        const xyzOptions = {
          url: resource.url,
          levels: resource.levels,
          tileDimension: resource.tileDimension,
          projection: resource.projection
        }

        if (useOverlay) {
          tileset.registerPlugin(
            new ImageOverlayPlugin({
              renderer: this.options.renderer,
              overlays: [new XYZTilesOverlay(xyzOptions)]
            })
          )
        } else {
          tileset.registerPlugin(new XYZTilesPlugin({ ...xyzOptions, shape: 'ellipsoid' }))
        }
        return
      }
      case 'mvt':
        this.registerImageryOverlays(tileset, [resource])
        return
      case 'cesium-ion':
        if (useOverlay) {
          tileset.registerPlugin(
            new ImageOverlayPlugin({
              renderer: this.options.renderer,
              overlays: [
                new CesiumIonOverlay({
                  apiToken: resource.apiToken,
                  assetId: resource.assetId,
                  autoRefreshToken: resource.autoRefreshToken ?? true
                })
              ]
            })
          )
        } else {
          tileset.registerPlugin(
            new CesiumIonAuthPlugin({
              apiToken: resource.apiToken,
              assetId: String(resource.assetId),
              autoRefreshToken: resource.autoRefreshToken ?? true
            })
          )
        }
    }
  }

  private registerTerrainImagery(
    tileset: TilesRenderer,
    resource: ImageryProviderResourceOptions | undefined,
    resources: ImageryOverlayResourceOptions[]
  ) {
    const overlays: ImageOverlay[] = []
    const baseOverlay = this.createImageryOverlay(resource)
    if (baseOverlay) {
      overlays.push(baseOverlay)
    }

    resources.forEach((overlayResource) => {
      overlays.push(this.createMVTOverlay(overlayResource))
    })

    if (overlays.length === 0) return

    tileset.registerPlugin(
      new ImageOverlayPlugin({
        renderer: this.options.renderer,
        overlays,
        enableTileSplitting: resources.length === 0
      })
    )
  }

  private registerSurfaceImageryStack(
    tileset: TilesRenderer,
    resource: ImageryProviderResourceOptions | undefined,
    resources: ImageryOverlayResourceOptions[]
  ) {
    const overlays: ImageOverlay[] = []
    const baseOverlay = this.createImageryOverlay(resource)
    if (baseOverlay) {
      overlays.push(baseOverlay)
    }

    resources.forEach((overlayResource) => {
      overlays.push(this.createMVTOverlay(overlayResource))
    })

    const tilingOverlay = baseOverlay ?? overlays[0] ?? null
    tileset.registerPlugin(
      new GeneratedSurfacePlugin({
        overlay: tilingOverlay,
        shape: 'ellipsoid',
        applyOverlayTexture: false
      })
    )

    if (overlays.length > 0) {
      tileset.registerPlugin(
        new ImageOverlayPlugin({
          renderer: this.options.renderer,
          overlays,
          enableTileSplitting: false
        })
      )
    }
  }

  private createImageryOverlay(resource: ImageryProviderResourceOptions | undefined): ImageOverlay | null {
    if (!resource) return null

    switch (resource.type) {
      case 'template-url':
        return new XYZTilesOverlay({
          url: resource.url,
          levels: resource.levels,
          tileDimension: resource.tileDimension,
          projection: resource.projection
        })
      case 'cesium-ion':
        return new CesiumIonOverlay({
          apiToken: resource.apiToken,
          assetId: resource.assetId,
          autoRefreshToken: resource.autoRefreshToken ?? true
        })
      case 'mvt':
        return this.createMVTOverlay(resource)
    }
  }

  private registerImageryOverlays(tileset: TilesRenderer, resources: ImageryOverlayResourceOptions[]) {
    if (resources.length === 0) return

    const overlays = resources.map((resource) => {
      switch (resource.type) {
        case 'mvt':
          return this.createMVTOverlay(resource)
      }
    })

    tileset.registerPlugin(
      new ImageOverlayPlugin({
        renderer: this.options.renderer,
        overlays,
        enableTileSplitting: false
      })
    )
  }

  private createMVTOverlay(resource: MVTResourceOptions) {
    const overlay = new MVTOverlay({
      url: resource.url,
      levels: resource.levels,
      projection: resource.projection,
      resolution: resource.resolution,
      opacity: resource.opacity,
      color: resource.color,
      alphaMask: resource.alphaMask,
      alphaInvert: resource.alphaInvert,
      getStyle: resource.getStyle
    })

    if (resource.fetchOptions) {
      overlay.fetchOptions = resource.fetchOptions
    }

    const getTexture = overlay.getTexture.bind(overlay)
    overlay.getTexture = (range: number[]) => {
      return getTexture(range) ?? this.options.transparentOverlayTexture
    }
    const lockTexture = overlay.lockTexture.bind(overlay)
    overlay.lockTexture = async (range: number[]) => {
      return (await lockTexture(range)) ?? this.options.transparentOverlayTexture
    }

    return overlay
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
