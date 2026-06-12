import * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer } from '3d-tiles-renderer'
import {
  CesiumIonAuthPlugin,
  GLTFExtensionsPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
} from '3d-tiles-renderer/plugins'
import { TileCreasedNormalsPlugin } from '../TileCreasedNormalsPlugin'
import type { ImageryLayer } from '../LayerManager'
import { TilesetSamplingAdapter } from './TilesetSamplingAdapter'
import { HeightSamplingTilesetPool } from './HeightSamplingTilesetPool'
import {
  ImageryOverlayFactory,
  type ImageryOverlayContext
} from './ImageryOverlayFactory'
import { SurfaceTilesetFactory } from './SurfaceTilesetFactory'
import { TerrainTilesetFactory } from './TerrainTilesetFactory'
import {
  SceneTilesetMaterialPlugin,
  SurfaceMaterialPlugin,
  TileUnlitMaterialPlugin,
  createMaterialsUnlitCompatibilityPlugin,
  type ResolvedSurfaceMaterialMode,
  type SceneTilesetMaterialMode,
  type TileModelProcessingOptions
} from './TilesetModelPlugins'
import type {
  Load3DTilesetOptions,
  HeightSamplingSource,
  TerrainOptions,
  TilesetLayer,
} from '../types'
import type { ThreeRendererWithEffects } from '../effects'

export type HeightSamplingTilesetEntry = {
  source: TilesRenderer
  tileset: TilesRenderer
  poolKey?: string
  poolRevision?: number
  useSamplingCamera?: boolean
  regionMask?: boolean
}

export interface TilesetManagerOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: ThreeRendererWithEffects
  dracoLoader: DRACOLoader
  transparentOverlayTexture: THREE.Texture
  terrain?: TerrainOptions
  surfaceMaterialMode: ResolvedSurfaceMaterialMode
  sceneTilesetMaterialMode: SceneTilesetMaterialMode
}

export class TilesetManager {
  private activeSurfaceTileset: TilesRenderer
  private activeTerrainTileset: TilesRenderer | null = null
  private readonly sceneTilesets = new Map<string, TilesRenderer>()
  private readonly sceneTilesetOptions = new Map<string, Load3DTilesetOptions>()
  private readonly sceneTilesetMaterialPlugins = new WeakMap<TilesRenderer, SceneTilesetMaterialPlugin>()
  private readonly surfaceMaterialPlugins = new WeakMap<TilesRenderer, SurfaceMaterialPlugin>()
  private readonly heightSamplingAdapter = new TilesetSamplingAdapter()
  private readonly heightSamplingTilesetPool: HeightSamplingTilesetPool
  private readonly imageryOverlayFactory: ImageryOverlayFactory
  private readonly surfaceTilesetFactory: SurfaceTilesetFactory
  private readonly terrainTilesetFactory: TerrainTilesetFactory
  private readonly imageryOverlayContexts = new WeakMap<TilesRenderer, ImageryOverlayContext>()
  private currentImageryLayers: ImageryLayer[] = []
  private currentTerrain: TerrainOptions | undefined
  private sceneTilesetId = 0

  constructor(private readonly options: TilesetManagerOptions) {
    this.heightSamplingTilesetPool = new HeightSamplingTilesetPool({
      isReusable: (tileset) => this.heightSamplingAdapter.isReusableForHeightSampling(tileset)
    })
    this.imageryOverlayFactory = new ImageryOverlayFactory({
      renderer: options.renderer,
      transparentOverlayTexture: options.transparentOverlayTexture
    })
    this.surfaceTilesetFactory = new SurfaceTilesetFactory({
      imageryOverlayFactory: this.imageryOverlayFactory,
      getSurfaceMaterialMode: () => this.options.surfaceMaterialMode,
      registerCommonTilesetPlugins: (tileset) => this.registerCommonTilesetPlugins(tileset)
    })
    this.terrainTilesetFactory = new TerrainTilesetFactory({
      imageryOverlayFactory: this.imageryOverlayFactory,
      getSurfaceMaterialMode: () => this.options.surfaceMaterialMode,
      registerCommonTilesetPlugins: (tileset) => this.registerCommonTilesetPlugins(tileset)
    })
    this.currentTerrain = options.terrain

    this.activeSurfaceTileset = this.createSurfaceTileset(this.currentImageryLayers)
    this.options.scene.add(this.activeSurfaceTileset.group)
    if (this.currentTerrain) {
      this.activeTerrainTileset = this.createTerrainTileset(this.currentTerrain, this.currentImageryLayers)
      this.options.scene.add(this.activeTerrainTileset.group)
    }
    this.syncSurfaceVisibility()
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

  get terrainOptions() {
    return this.currentTerrain
  }

  get loadedSceneTilesets() {
    return [...this.sceneTilesets.values()]
  }

  get loadedSceneTilesetEntries() {
    return Array.from(this.sceneTilesets, ([id, tileset]) => ({ id, tileset }))
  }

  setSurfaceMaterialMode(mode: ResolvedSurfaceMaterialMode) {
    this.options.surfaceMaterialMode = mode
    this.surfaceMaterialPlugins.get(this.activeSurfaceTileset)?.setMode(mode, this.activeSurfaceTileset)
    if (this.activeTerrainTileset) {
      this.surfaceMaterialPlugins.get(this.activeTerrainTileset)?.setMode(mode, this.activeTerrainTileset)
    }
  }

  setSceneTilesetMaterialMode(mode: SceneTilesetMaterialMode) {
    this.options.sceneTilesetMaterialMode = mode
    this.sceneTilesets.forEach((tileset) => {
      this.sceneTilesetMaterialPlugins.get(tileset)?.setMode(mode, tileset)
    })
  }

  setImageryLayers(layers: ImageryLayer[] = []) {
    this.invalidateHeightSamplingTilesetPool()
    this.currentImageryLayers = layers
    this.replaceSurfaceTileset(this.createSurfaceTileset(this.currentImageryLayers))
    if (this.currentTerrain) {
      this.replaceTerrainTileset(this.createTerrainTileset(this.currentTerrain, this.currentImageryLayers))
    }
  }

  syncImageryLayer(layer: ImageryLayer) {
    this.syncTilesetImageryLayer(this.activeSurfaceTileset, layer)
    if (this.activeTerrainTileset) {
      this.syncTilesetImageryLayer(this.activeTerrainTileset, layer)
    }
  }

  syncImageryLayerOrder(layers: ImageryLayer[] = []) {
    this.currentImageryLayers = layers
    this.syncTilesetImageryLayerOrder(this.activeSurfaceTileset)
    if (this.activeTerrainTileset) {
      this.syncTilesetImageryLayerOrder(this.activeTerrainTileset)
    }
  }

  setTerrain(terrain: TerrainOptions | null | undefined) {
    this.invalidateHeightSamplingTilesetPool()
    this.currentTerrain = terrain ?? undefined
    this.replaceTerrainTileset(
      this.currentTerrain
        ? this.createTerrainTileset(this.currentTerrain, this.currentImageryLayers)
        : null
    )
  }

  load3DTileset(options: Load3DTilesetOptions): TilesetLayer {
    const id = options.id ?? this.createSceneTilesetId()
    if (this.sceneTilesets.has(id)) {
      throw new Error(`TilesetManager: 3D Tiles layer "${id}" already exists.`)
    }

    const tileset = this.createSceneTileset(options)
    this.registerCommonTilesetPlugins(tileset, this.getSceneTilesetModelProcessingOptions(options))
    this.registerSceneTilesetMaterialPlugins(tileset, options)
    this.sceneTilesets.set(id, tileset)
    this.sceneTilesetOptions.set(id, { ...options, id })
    this.options.scene.add(tileset.group)

    return {
      id,
      tileset,
      get show() {
        return tileset.group.visible
      },
      set show(value: boolean) {
        tileset.group.visible = value
      },
      remove: () => {
        this.remove3DTileset(id)
      }
    }
  }

  get3DTileset(id: string) {
    return this.sceneTilesets.get(id) ?? null
  }

  remove3DTileset(id: string) {
    const tileset = this.sceneTilesets.get(id)
    if (!tileset) return false

    this.options.scene.remove(tileset.group)
    tileset.dispose()
    this.sceneTilesets.delete(id)
    this.sceneTilesetOptions.delete(id)
    this.invalidateHeightSamplingTilesetPool()
    return true
  }

  createHeightSamplingTilesets(source: HeightSamplingSource = 'all'): HeightSamplingTilesetEntry[] {
    const entries: HeightSamplingTilesetEntry[] = []

    if (source !== 'terrain') {
      this.sceneTilesets.forEach((sourceTileset, id) => {
        if (!sourceTileset.group.visible) return

        const options = this.sceneTilesetOptions.get(id)
        if (!options) return

        const poolKey = `tileset:${id}`
        const tileset = this.acquireHeightSamplingTileset(poolKey, () => {
          const samplingTileset = this.createSceneTileset(options)
          this.registerGltfExtensionsPlugin(samplingTileset)
          this.registerSceneTilesetMaterialPlugins(samplingTileset, options)
          return samplingTileset
        })
        this.copyTilesetTransform(sourceTileset, tileset)
        entries.push({
          source: sourceTileset,
          tileset,
          poolKey,
          poolRevision: this.heightSamplingTilesetPool.revision,
          useSamplingCamera: true,
          regionMask: true
        })
      })
    }

    if (source !== 'tileset' && this.activeTerrainTileset && this.currentTerrain) {
      const poolKey = 'terrain'
      const tileset = this.acquireHeightSamplingTileset(poolKey, () => this.createHeightSamplingTerrainTileset(this.currentTerrain!))
      this.copyTilesetTransform(this.activeTerrainTileset, tileset)
      entries.push({
        source: this.activeTerrainTileset,
        tileset,
        poolKey,
        poolRevision: this.heightSamplingTilesetPool.revision,
        useSamplingCamera: true,
        regionMask: true
      })
    }

    return entries
  }

  createSceneRegionHeightSamplingTilesets(source: HeightSamplingSource = 'all'): HeightSamplingTilesetEntry[] {
    const entries: HeightSamplingTilesetEntry[] = []

    if (source !== 'terrain') {
      this.sceneTilesets.forEach((tileset) => {
        if (!tileset.group.visible) return
        entries.push({
          source: tileset,
          tileset,
          useSamplingCamera: false,
          regionMask: false
        })
      })
    }

    if (source !== 'tileset' && this.activeTerrainTileset) {
      entries.push({
        source: this.activeTerrainTileset,
        tileset: this.activeTerrainTileset,
        useSamplingCamera: false,
        regionMask: false
      })
    }

    return entries
  }

  disposeHeightSamplingTilesets(entries: HeightSamplingTilesetEntry[]) {
    entries.forEach((entry) => {
      this.releaseHeightSamplingTileset(entry)
    })
  }

  update() {
    this.tileset.update()
    this.sceneTilesets.forEach((tileset) => {
      if (tileset.group.visible) {
        tileset.update()
      }
    })
  }

  resize() {
    this.activeSurfaceTileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
    this.activeTerrainTileset?.setResolutionFromRenderer(this.options.camera, this.options.renderer)
    this.sceneTilesets.forEach((tileset) => {
      tileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
    })
  }

  dispose() {
    this.invalidateHeightSamplingTilesetPool()
    this.sceneTilesets.forEach((tileset) => {
      this.options.scene.remove(tileset.group)
      tileset.dispose()
    })
    this.sceneTilesets.clear()
    this.sceneTilesetOptions.clear()
    this.activeTerrainTileset?.dispose()
    this.activeSurfaceTileset.dispose()
  }

  private createSurfaceTileset(layers: ImageryLayer[] = []) {
    const creation = this.surfaceTilesetFactory.create(layers, (layer) => this.getLayerOrder(layer))

    this.imageryOverlayContexts.set(creation.tileset, creation.imageryContext)
    this.surfaceMaterialPlugins.set(creation.tileset, creation.surfaceMaterialPlugin)
    return creation.tileset
  }

  private createTerrainTileset(
    terrain: TerrainOptions,
    layers: ImageryLayer[] = []
  ) {
    const creation = this.terrainTilesetFactory.create(
      terrain,
      layers,
      (layer) => this.getLayerOrder(layer)
    )

    this.imageryOverlayContexts.set(creation.tileset, creation.imageryContext)
    this.surfaceMaterialPlugins.set(creation.tileset, creation.surfaceMaterialPlugin)
    return creation.tileset
  }

  private registerCommonTilesetPlugins(tileset: TilesRenderer, modelProcessing: TileModelProcessingOptions = {}) {
    this.registerGltfExtensionsPlugin(tileset)
    this.registerTileModelProcessingPlugins(tileset, modelProcessing)
    tileset.registerPlugin(new TilesFadePlugin())
    tileset.registerPlugin(new UpdateOnChangePlugin())
    tileset.setCamera(this.options.camera)
    tileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
  }

  private registerGltfExtensionsPlugin(tileset: TilesRenderer) {
    tileset.registerPlugin(new GLTFExtensionsPlugin({
      dracoLoader: this.options.dracoLoader,
      plugins: [createMaterialsUnlitCompatibilityPlugin],
      autoDispose: false
    }))
  }

  private registerTileModelProcessingPlugins(tileset: TilesRenderer, options: TileModelProcessingOptions) {
    if (options.creasedNormals) {
      tileset.registerPlugin(new TileCreasedNormalsPlugin())
    }
  }

  private getSceneTilesetModelProcessingOptions(options: Load3DTilesetOptions): TileModelProcessingOptions {
    return {
      creasedNormals: options.creasedNormals ?? false
    }
  }

  private registerSceneTilesetMaterialPlugins(tileset: TilesRenderer, options: Load3DTilesetOptions) {
    if (options.materialMode === 'unlit') {
      tileset.registerPlugin(new TileUnlitMaterialPlugin())
      return
    }

    const plugin = new SceneTilesetMaterialPlugin(this.options.sceneTilesetMaterialMode)
    tileset.registerPlugin(plugin)
    this.sceneTilesetMaterialPlugins.set(tileset, plugin)
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
    this.resize()
  }

  private syncSurfaceVisibility() {
    this.activeSurfaceTileset.group.visible = this.activeTerrainTileset === null
  }

  private createHeightSamplingTerrainTileset(terrain: TerrainOptions) {
    return this.terrainTilesetFactory.createHeightSamplingTileset(terrain, (tileset) => {
      this.registerGltfExtensionsPlugin(tileset)
    })
  }

  private acquireHeightSamplingTileset(poolKey: string, createTileset: () => TilesRenderer) {
    return this.heightSamplingTilesetPool.acquire(poolKey, createTileset)
  }

  private releaseHeightSamplingTileset(entry: HeightSamplingTilesetEntry) {
    this.heightSamplingTilesetPool.release(entry)
  }

  private invalidateHeightSamplingTilesetPool() {
    this.heightSamplingTilesetPool.invalidate()
  }

  private copyTilesetTransform(source: TilesRenderer, target: TilesRenderer) {
    source.group.updateMatrixWorld(true)
    target.group.matrixAutoUpdate = source.group.matrixAutoUpdate
    target.group.position.copy(source.group.position)
    target.group.quaternion.copy(source.group.quaternion)
    target.group.scale.copy(source.group.scale)
    target.group.matrix.copy(source.group.matrix)
    target.group.updateMatrixWorld(true)
  }

  private syncTilesetImageryLayer(tileset: TilesRenderer, layer: ImageryLayer) {
    const context = this.imageryOverlayContexts.get(tileset)
    if (!context) return

    let overlay = context.overlays.get(layer.id)
    if (!layer.isVisible()) {
      if (overlay) {
        context.plugin.deleteOverlay(overlay)
        context.overlays.delete(layer.id)
        this.requestTilesetRender(tileset)
      }
      return
    }

    if (!overlay) {
      const nextOverlay = this.imageryOverlayFactory.createOverlay(layer.source, layer.getStyle())
      if (!nextOverlay) return

      overlay = nextOverlay
      context.overlays.set(layer.id, overlay)
      context.plugin.addOverlay(overlay, this.getLayerOrder(layer))
    } else {
      context.plugin.setOverlayOrder(overlay, this.getLayerOrder(layer))
    }

    this.imageryOverlayFactory.applyLayerStyleToOverlay(layer, overlay)
    this.requestTilesetRender(tileset)
  }

  private syncTilesetImageryLayerOrder(tileset: TilesRenderer) {
    const context = this.imageryOverlayContexts.get(tileset)
    if (!context) return

    this.currentImageryLayers.forEach((layer, index) => {
      const overlay = context.overlays.get(layer.id)
      if (overlay) {
        context.plugin.setOverlayOrder(overlay, index)
      }
    })
    this.requestTilesetRender(tileset)
  }

  private getLayerOrder(layer: ImageryLayer) {
    const index = this.currentImageryLayers.findIndex((item) => item.id === layer.id)
    return index === -1 ? this.currentImageryLayers.length : index
  }

  private requestTilesetRender(tileset: TilesRenderer) {
    tileset.dispatchEvent({ type: 'needs-render' })
  }

  private createSceneTileset(options: Load3DTilesetOptions) {
    switch (options.type) {
      case 'url':
        return new TilesRenderer(options.url)
      case 'cesium-ion': {
        const tileset = new TilesRenderer()
        tileset.registerPlugin(
          new CesiumIonAuthPlugin({
            apiToken: options.apiToken,
            assetId: String(options.assetId),
            autoRefreshToken: options.autoRefreshToken ?? true,
            assetTypeHandler: (type) => {
              throw new Error(`TilesetManager: Cesium Ion asset type "${type}" is not supported by load3DTileset.`)
            }
          })
        )
        return tileset
      }
    }
  }

  private createSceneTilesetId() {
    do {
      this.sceneTilesetId += 1
    } while (this.sceneTilesets.has(`tileset-${this.sceneTilesetId}`))

    return `tileset-${this.sceneTilesetId}`
  }

}
