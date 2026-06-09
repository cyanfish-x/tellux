import * as THREE from 'three'
import type { GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { TilesRenderer } from '3d-tiles-renderer'
import * as TilesRendererPlugins from '3d-tiles-renderer/plugins'
import {
  CesiumIonAuthPlugin,
  CesiumIonOverlay,
  GeoJSONOverlay,
  GLTFExtensionsPlugin,
  ImageOverlayPlugin,
  QuantizedMeshPlugin,
  TilesFadePlugin,
  UpdateOnChangePlugin,
  WMSTilesOverlay,
  type ImageOverlay,
  XYZTilesOverlay
} from '3d-tiles-renderer/plugins'
import { TerrainFetchPlugin } from '../TerrainFetchPlugin'
import { TileCreasedNormalsPlugin } from '../TileCreasedNormalsPlugin'
import type { ImageryLayer } from '../LayerManager'
import type {
  ImageryLayerSourceOptions,
  ImageryLayerStyleOptions,
  Load3DTilesetOptions,
  GeoJSONGetStyleCallback,
  GeoJSONImagerySourceOptions,
  MVTGetStyleCallback,
  MVTImagerySourceOptions,
  HeightSamplingSource,
  TerrainOptions,
  SurfaceMaterialMode,
  TilesetLayer,
  WMSImagerySourceOptions
} from '../types'
import type { ThreeRendererWithEffects } from '../effects'

interface TileModelPlugin {
  processTileModel: (scene: THREE.Object3D) => void
}

type MVTOverlayOptions = {
  url: string
  levels?: number
  projection?: string
  resolution?: number
  opacity?: number
  color?: THREE.ColorRepresentation
  getStyle?: MVTGetStyleCallback
}

type MVTOverlayInstance = ImageOverlay & {
  fetchOptions: RequestInit
  getTexture(range: number[]): THREE.Texture | null
  lockTexture(range: number[]): Promise<THREE.Texture | null>
}

type MVTOverlayConstructor = new (options: MVTOverlayOptions) => MVTOverlayInstance

type GeoJSONOverlayOptions = {
  geojson?: GeoJSONImagerySourceOptions['geojson']
  url?: string
  resolution?: number
  pointRadius?: number
  strokeStyle?: string
  strokeWidth?: number
  fillStyle?: string
  opacity?: number
  color?: THREE.ColorRepresentation
  getStyle?: GeoJSONGetStyleCallback
  preprocessURL?: (url: string) => string | null
}

type FetchableImageSource = {
  fetchData(url: string, options?: RequestInit): Promise<Response>
}

type GeoJSONOverlayInstance = ImageOverlay & {
  imageSource?: FetchableImageSource
  getTexture(range: number[]): THREE.Texture | null
  lockTexture(range: number[]): Promise<THREE.Texture | null>
  fetch(url: string, options?: RequestInit): Promise<Response>
}

type GeoJSONOverlayConstructor = new (options: GeoJSONOverlayOptions) => GeoJSONOverlayInstance

type ReleasableImageSource = {
  release(...args: number[]): void
}

type WMSOverlayInstance = InstanceType<typeof WMSTilesOverlay> & {
  imageSource?: ReleasableImageSource
  getTexture(range: number[], level?: number | null): THREE.Texture | null
  lockTexture(range: number[], level?: number | null): Promise<THREE.Texture | null>
}

type RegionVisibleOverlayInstance = ImageOverlay & {
  setRegionVisible(range: number[], visible: boolean): void
}

type GeneratedSurfacePluginConstructor = new (options?: {
  overlay?: ImageOverlay | null
  shape?: 'ellipsoid' | 'planar'
  applyOverlayTexture?: boolean
}) => object

type ImageryOverlayContextOptions = {
  resolution?: number
  enableTileSplitting?: boolean
}

type ImageryOverlayContext = {
  plugin: ImageOverlayPlugin
  overlays: Map<string, ImageOverlay>
}

export type HeightSamplingTilesetEntry = {
  source: TilesRenderer
  tileset: TilesRenderer
  poolKey?: string
  poolRevision?: number
  useSamplingCamera?: boolean
  regionMask?: boolean
}

const DEFAULT_TERRAIN_ERROR_TARGET = 1

const { GeneratedSurfacePlugin, MVTOverlay } = TilesRendererPlugins as unknown as {
  GeneratedSurfacePlugin: GeneratedSurfacePluginConstructor
  MVTOverlay: MVTOverlayConstructor
}

const TelluxGeoJSONOverlay = GeoJSONOverlay as unknown as GeoJSONOverlayConstructor

const KHR_MATERIALS_UNLIT = 'KHR_materials_unlit'

type MaterialParams = Record<string, unknown>
type ResolvedSurfaceMaterialMode = Exclude<SurfaceMaterialMode, 'auto'>

type UnlitCompatibilityPlugin = GLTFLoaderPlugin & {
  extendParams(materialParams: MaterialParams, materialDef: Record<string, any>, parser: GLTFParser): Promise<unknown[]>
}

function createMaterialsUnlitCompatibilityPlugin(parser: GLTFParser): GLTFLoaderPlugin {
  const unlitExtension: UnlitCompatibilityPlugin = {
    name: KHR_MATERIALS_UNLIT,
    getMaterialType: () => THREE.MeshBasicMaterial,
    extendParams(materialParams, materialDef, gltfParser) {
      const pending: Promise<unknown>[] = []
      const metallicRoughness = materialDef.pbrMetallicRoughness

      materialParams.color = new THREE.Color(1, 1, 1)
      materialParams.opacity = 1

      if (metallicRoughness) {
        if (Array.isArray(metallicRoughness.baseColorFactor)) {
          const color = materialParams.color as THREE.Color
          color.setRGB(
            metallicRoughness.baseColorFactor[0],
            metallicRoughness.baseColorFactor[1],
            metallicRoughness.baseColorFactor[2],
            THREE.LinearSRGBColorSpace
          )
          materialParams.opacity = metallicRoughness.baseColorFactor[3]
        }

        if (metallicRoughness.baseColorTexture) {
          pending.push(gltfParser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture, THREE.SRGBColorSpace))
        }
      }

      return Promise.all(pending)
    }
  }

  return {
    name: 'TELLUX_materials_unlit_compatibility',
    beforeRoot() {
      const hasUnlitMaterial = (parser.json.materials ?? []).some((material: Record<string, any>) => {
        return Boolean(material.extensions?.[KHR_MATERIALS_UNLIT])
      })

      if (hasUnlitMaterial && !parser.extensions[KHR_MATERIALS_UNLIT]) {
        parser.extensions[KHR_MATERIALS_UNLIT] = unlitExtension
      }

      return null
    }
  }
}

class TileUnlitMaterialPlugin implements TileModelPlugin {
  readonly priority = -10

  processTileModel(tileScene: THREE.Object3D) {
    tileScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => this.toUnlitMaterial(material))
        : this.toUnlitMaterial(mesh.material)
    })
  }

  private toUnlitMaterial(material: THREE.Material) {
    if (material instanceof THREE.MeshBasicMaterial) return material

    const source = material as THREE.MeshStandardMaterial
    const unlit = new THREE.MeshBasicMaterial()
    unlit.name = material.name
    unlit.color.copy(source.color ?? new THREE.Color(1, 1, 1))
    unlit.map = source.map ?? null
    unlit.alphaMap = source.alphaMap ?? null
    unlit.lightMap = source.lightMap ?? null
    unlit.aoMap = source.aoMap ?? null
    unlit.envMap = source.envMap ?? null
    unlit.wireframe = 'wireframe' in source ? Boolean(source.wireframe) : false
    unlit.transparent = material.transparent
    unlit.opacity = material.opacity
    unlit.alphaTest = material.alphaTest
    unlit.side = material.side
    unlit.depthTest = material.depthTest
    unlit.depthWrite = material.depthWrite
    unlit.colorWrite = material.colorWrite
    unlit.blending = material.blending
    unlit.blendSrc = material.blendSrc
    unlit.blendDst = material.blendDst
    unlit.blendEquation = material.blendEquation
    unlit.polygonOffset = material.polygonOffset
    unlit.polygonOffsetFactor = material.polygonOffsetFactor
    unlit.polygonOffsetUnits = material.polygonOffsetUnits
    unlit.toneMapped = material.toneMapped
    unlit.userData = { ...material.userData }
    return unlit
  }
}

class SurfaceMaterialPlugin implements TileModelPlugin {
  readonly priority = -20

  constructor(private currentMode: ResolvedSurfaceMaterialMode) {}

  processTileModel(tileScene: THREE.Object3D) {
    this.applyToScene(tileScene)
  }

  setMode(mode: ResolvedSurfaceMaterialMode, tileset: TilesRenderer) {
    if (this.currentMode === mode) return

    this.currentMode = mode
    tileset.forEachLoadedModel((tileScene) => {
      this.applyToScene(tileScene)
    })
    tileset.dispatchEvent({ type: 'needs-render' })
  }

  private applyToScene(tileScene: THREE.Object3D) {
    tileScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((material) => this.toModeMaterial(material))
        : this.toModeMaterial(mesh.material)
    })
  }

  private toModeMaterial(material: THREE.Material) {
    return this.currentMode === 'standard'
      ? this.toStandardMaterial(material)
      : this.toBasicMaterial(material)
  }

  private toStandardMaterial(material: THREE.Material) {
    if (material instanceof THREE.MeshStandardMaterial) return material
    if (!(material instanceof THREE.MeshBasicMaterial)) return material

    const lit = new THREE.MeshStandardMaterial({
      color: material.color,
      map: material.map,
      alphaMap: material.alphaMap,
      aoMap: material.aoMap,
      envMap: material.envMap,
      lightMap: material.lightMap,
      metalness: 0,
      roughness: 1
    })
    this.copyMaterialState(material, lit)
    material.dispose()
    return lit
  }

  private toBasicMaterial(material: THREE.Material) {
    if (material instanceof THREE.MeshBasicMaterial) return material

    const source = material as THREE.MeshStandardMaterial
    const basic = new THREE.MeshBasicMaterial({
      color: source.color ?? new THREE.Color(1, 1, 1),
      map: source.map ?? null,
      alphaMap: source.alphaMap ?? null,
      aoMap: source.aoMap ?? null,
      envMap: source.envMap ?? null,
      lightMap: source.lightMap ?? null
    })
    basic.wireframe = 'wireframe' in source ? Boolean(source.wireframe) : false
    this.copyMaterialState(material, basic)
    material.dispose()
    return basic
  }

  private copyMaterialState(source: THREE.Material, target: THREE.Material) {
    target.name = source.name
    target.transparent = source.transparent
    target.opacity = source.opacity
    target.alphaTest = source.alphaTest
    target.side = source.side
    target.depthTest = source.depthTest
    target.depthWrite = source.depthWrite
    target.colorWrite = source.colorWrite
    target.blending = source.blending
    target.blendSrc = source.blendSrc
    target.blendDst = source.blendDst
    target.blendEquation = source.blendEquation
    target.polygonOffset = source.polygonOffset
    target.polygonOffsetFactor = source.polygonOffsetFactor
    target.polygonOffsetUnits = source.polygonOffsetUnits
    target.toneMapped = source.toneMapped
    target.defines = source.defines ? { ...source.defines } : undefined
    target.onBeforeCompile = source.onBeforeCompile
    target.customProgramCacheKey = source.customProgramCacheKey
    target.userData = { ...source.userData }

    Object.getOwnPropertySymbols(source).forEach((symbol) => {
      ;(target as unknown as Record<symbol, unknown>)[symbol] =
        (source as unknown as Record<symbol, unknown>)[symbol]
    })
    target.needsUpdate = true
  }
}

export interface TilesetManagerOptions {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: ThreeRendererWithEffects
  dracoLoader: DRACOLoader
  transparentOverlayTexture: THREE.Texture
  terrain?: TerrainOptions
  creasedNormals?: boolean
  surfaceMaterialMode: ResolvedSurfaceMaterialMode
}

export class TilesetManager {
  private activeSurfaceTileset: TilesRenderer
  private activeTerrainTileset: TilesRenderer | null = null
  private readonly sceneTilesets = new Map<string, TilesRenderer>()
  private readonly sceneTilesetOptions = new Map<string, Load3DTilesetOptions>()
  private readonly heightSamplingTilesetPool = new Map<string, TilesRenderer[]>()
  private readonly imageryOverlayContexts = new WeakMap<TilesRenderer, ImageryOverlayContext>()
  private surfaceMaterialPlugin!: SurfaceMaterialPlugin
  private currentImageryLayers: ImageryLayer[] = []
  private currentTerrain: TerrainOptions | undefined
  private sceneTilesetId = 0
  private heightSamplingPoolRevision = 0

  constructor(private readonly options: TilesetManagerOptions) {
    this.currentTerrain = options.terrain

    this.activeSurfaceTileset = this.createSurfaceTileset(this.currentImageryLayers)
    this.options.scene.add(this.activeSurfaceTileset.group)
    if (this.currentTerrain) {
      this.activeTerrainTileset = this.createTerrainTileset(this.currentTerrain, this.currentImageryLayers)
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

  get terrainOptions() {
    return this.currentTerrain
  }

  get loadedSceneTilesets() {
    return [...this.sceneTilesets.values()]
  }

  setSurfaceMaterialMode(mode: ResolvedSurfaceMaterialMode) {
    this.options.surfaceMaterialMode = mode
    this.surfaceMaterialPlugin.setMode(mode, this.activeSurfaceTileset)
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
    this.registerCommonTilesetPlugins(tileset)
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
          this.registerSamplingTilesetPlugins(samplingTileset)
          this.registerSceneTilesetMaterialPlugins(samplingTileset, options)
          this.configureHeightSamplingTileset(samplingTileset)
          return samplingTileset
        })
        this.copyTilesetTransform(sourceTileset, tileset)
        entries.push({
          source: sourceTileset,
          tileset,
          poolKey,
          poolRevision: this.heightSamplingPoolRevision,
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
        poolRevision: this.heightSamplingPoolRevision,
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
    const tileset = new TilesRenderer()
    const surfaceMaterialPlugin = new SurfaceMaterialPlugin(this.options.surfaceMaterialMode)

    this.surfaceMaterialPlugin = surfaceMaterialPlugin
    this.registerSurfaceImageryStack(tileset, layers)
    tileset.registerPlugin(surfaceMaterialPlugin)
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private createTerrainTileset(
    terrain: TerrainOptions,
    layers: ImageryLayer[] = []
  ) {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    this.registerTerrainProvider(tileset, terrain)
    this.registerTerrainImagery(tileset, terrain, layers)
    this.registerCommonTilesetPlugins(tileset)
    return tileset
  }

  private registerCommonTilesetPlugins(tileset: TilesRenderer) {
    this.registerSamplingTilesetPlugins(tileset)
    tileset.registerPlugin(new TilesFadePlugin())
    tileset.registerPlugin(new UpdateOnChangePlugin())
    tileset.setCamera(this.options.camera)
    tileset.setResolutionFromRenderer(this.options.camera, this.options.renderer)
  }

  private registerSamplingTilesetPlugins(tileset: TilesRenderer) {
    tileset.registerPlugin(new GLTFExtensionsPlugin({
      dracoLoader: this.options.dracoLoader,
      plugins: [createMaterialsUnlitCompatibilityPlugin],
      autoDispose: false
    }))
    if (this.options.creasedNormals) {
      tileset.registerPlugin(new TileCreasedNormalsPlugin())
    }
  }

  private registerSceneTilesetMaterialPlugins(tileset: TilesRenderer, options: Load3DTilesetOptions) {
    if (options.materialMode === 'unlit') {
      tileset.registerPlugin(new TileUnlitMaterialPlugin())
    }
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
    tileset.errorTarget = terrain.tileLoading?.errorTarget ?? DEFAULT_TERRAIN_ERROR_TARGET
    tileset.registerPlugin(new TerrainFetchPlugin(terrain.url))
  }

  private createHeightSamplingTerrainTileset(terrain: TerrainOptions) {
    const tileset = new TilesRenderer(this.normalizeTerrainUrl(terrain.url))
    this.registerTerrainProvider(tileset, terrain)
    this.registerSamplingTilesetPlugins(tileset)
    this.configureHeightSamplingTileset(tileset)
    return tileset
  }

  private acquireHeightSamplingTileset(poolKey: string, createTileset: () => TilesRenderer) {
    const pool = this.heightSamplingTilesetPool.get(poolKey)
    const tileset = pool?.pop() ?? createTileset()
    this.configureHeightSamplingTileset(tileset)
    return tileset
  }

  private releaseHeightSamplingTileset(entry: HeightSamplingTilesetEntry) {
    if (!entry.poolKey || entry.poolRevision === undefined) {
      return
    }

    if (
      entry.poolRevision !== this.heightSamplingPoolRevision ||
      !this.isHeightSamplingTilesetReusable(entry.tileset)
    ) {
      entry.tileset.dispose()
      return
    }

    let pool = this.heightSamplingTilesetPool.get(entry.poolKey)
    if (!pool) {
      pool = []
      this.heightSamplingTilesetPool.set(entry.poolKey, pool)
    }
    pool.push(entry.tileset)
  }

  private isHeightSamplingTilesetReusable(tileset: TilesRenderer) {
    const renderer = tileset as TilesRenderer & {
      isLoading?: boolean
      loadingTiles?: Set<unknown>
    }

    return !(
      renderer.isLoading ||
      renderer.downloadQueue.running ||
      renderer.parseQueue.running ||
      renderer.processNodeQueue.running ||
      (renderer.loadingTiles?.size ?? 0) > 0
    )
  }

  private invalidateHeightSamplingTilesetPool() {
    this.heightSamplingPoolRevision += 1
    this.heightSamplingTilesetPool.forEach((pool) => {
      pool.forEach((tileset) => {
        tileset.dispose()
      })
    })
    this.heightSamplingTilesetPool.clear()
  }

  private configureHeightSamplingTileset(tileset: TilesRenderer) {
    tileset.displayActiveTiles = true
    tileset.loadAncestors = true
    tileset.loadSiblings = false
    tileset.errorTarget = 0
    tileset.maxTilesProcessed = 8
    tileset.downloadQueue.maxJobs = Math.min(tileset.downloadQueue.maxJobs, 4)
    tileset.parseQueue.maxJobs = Math.min(tileset.parseQueue.maxJobs, 1)
    tileset.processNodeQueue.maxJobs = Math.min(tileset.processNodeQueue.maxJobs, 2)
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

  private registerTerrainImagery(tileset: TilesRenderer, terrain: TerrainOptions, layers: ImageryLayer[]) {
    const context = this.createImageryOverlayContext(layers, {
      resolution: terrain.tileLoading?.imageryResolution,
      enableTileSplitting: terrain.tileLoading?.enableTileSplitting
    })

    this.imageryOverlayContexts.set(tileset, context)
    tileset.registerPlugin(context.plugin)
  }

  private registerSurfaceImageryStack(tileset: TilesRenderer, layers: ImageryLayer[]) {
    const context = this.createImageryOverlayContext(layers)
    const tilingOverlay = context.overlays.values().next().value ?? null

    this.imageryOverlayContexts.set(tileset, context)
    tileset.registerPlugin(tilingOverlay ? new GeneratedSurfacePlugin({
      overlay: tilingOverlay,
      shape: 'ellipsoid',
      applyOverlayTexture: false
    }) : new GeneratedSurfacePlugin({ shape: 'ellipsoid' }))
    tileset.registerPlugin(context.plugin)
  }

  private createImageryOverlayContext(
    layers: ImageryLayer[],
    options: ImageryOverlayContextOptions = {}
  ): ImageryOverlayContext {
    const plugin = new ImageOverlayPlugin({
      renderer: this.options.renderer,
      overlays: [],
      resolution: options.resolution,
      enableTileSplitting: options.enableTileSplitting ?? true
    })
    const overlays = new Map<string, ImageOverlay>()

    layers.forEach((layer) => {
      if (!layer.isVisible()) return

      const overlay = this.createImageryOverlay(layer.source, layer.getStyle())
      if (overlay) {
        this.applyLayerStyleToOverlay(layer, overlay)
        overlays.set(layer.id, overlay)
        plugin.addOverlay(overlay, this.getLayerOrder(layer))
      }
    })

    return { plugin, overlays }
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
      const nextOverlay = this.createImageryOverlay(layer.source, layer.getStyle())
      if (!nextOverlay) return

      overlay = nextOverlay
      context.overlays.set(layer.id, overlay)
      context.plugin.addOverlay(overlay, this.getLayerOrder(layer))
    } else {
      context.plugin.setOverlayOrder(overlay, this.getLayerOrder(layer))
    }

    this.applyLayerStyleToOverlay(layer, overlay)
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

  private applyLayerStyleToOverlay(layer: ImageryLayer, overlay: ImageOverlay) {
    const style = layer.getStyle()
    overlay.opacity = style.opacity ?? 1
    if (style.color !== undefined) {
      overlay.color = new THREE.Color(style.color)
    } else if (overlay.color instanceof THREE.Color) {
      overlay.color.set(0xffffff)
    } else {
      overlay.color = new THREE.Color(0xffffff)
    }
  }

  private getLayerOrder(layer: ImageryLayer) {
    const index = this.currentImageryLayers.findIndex((item) => item.id === layer.id)
    return index === -1 ? this.currentImageryLayers.length : index
  }

  private requestTilesetRender(tileset: TilesRenderer) {
    tileset.dispatchEvent({ type: 'needs-render' })
  }

  private createImageryOverlay(source: ImageryLayerSourceOptions, style: ImageryLayerStyleOptions = {}): ImageOverlay | null {
    let overlay: ImageOverlay

    switch (source.type) {
      case 'xyz':
        overlay = new XYZTilesOverlay({
          url: source.url,
          levels: source.levels,
          tileDimension: source.tileDimension,
          projection: source.projection,
          opacity: style.opacity,
          color: style.color === undefined ? undefined : new THREE.Color(style.color)
        })
        break
      case 'cesium-ion':
        overlay = new CesiumIonOverlay({
          apiToken: source.apiToken,
          assetId: source.assetId,
          autoRefreshToken: source.autoRefreshToken ?? true,
          opacity: style.opacity,
          color: style.color === undefined ? undefined : new THREE.Color(style.color)
        })
        break
      case 'geojson':
        overlay = this.createGeoJSONOverlay(source, style)
        break
      case 'mvt':
        overlay = this.createMVTOverlay(source, style)
        break
      case 'wms':
        overlay = this.createWMSOverlay(source, style)
        break
    }

    this.patchRegionVisibilityGuard(overlay)
    return overlay
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

  private createGeoJSONOverlay(resource: GeoJSONImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const overlay = new TelluxGeoJSONOverlay({
      geojson: resource.geojson,
      url: resource.url ? this.normalizeResourceUrl(resource.url) : undefined,
      resolution: resource.resolution,
      pointRadius: style.pointRadius,
      strokeStyle: style.stroke,
      strokeWidth: style.strokeWidth,
      fillStyle: style.fill,
      opacity: style.opacity,
      color: style.color,
      getStyle: this.createGeoJSONGetStyle(style),
      preprocessURL: resource.preprocessURL
    })

    if (resource.fetchOptions || resource.preprocessURL) {
      const fetchOptions = resource.fetchOptions
      const fetchGeoJSON = (url: string, options: RequestInit = {}) => {
        const normalizedUrl = resource.preprocessURL ? resource.preprocessURL(url) : url
        if (normalizedUrl === null) {
          return Promise.reject(new Error('TilesetManager: GeoJSON URL preprocessing returned null.'))
        }

        return fetch(normalizedUrl, this.mergeFetchOptions(fetchOptions, options))
      }

      overlay.fetch = fetchGeoJSON
      if (overlay.imageSource) {
        overlay.imageSource.fetchData = fetchGeoJSON
      }
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

  private createGeoJSONGetStyle(style: ImageryLayerStyleOptions): GeoJSONGetStyleCallback | undefined {
    const getStyle = style.getStyle as GeoJSONGetStyleCallback | undefined
    if (!getStyle) return undefined

    const defaultStyle = {
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: style.strokeWidth,
      radius: style.pointRadius
    }

    return (feature, properties) => {
      const featureStyle = getStyle(feature, properties)
      return featureStyle === null ? null : {
        ...defaultStyle,
        ...featureStyle
      }
    }
  }

  private createMVTOverlay(resource: MVTImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const getStyle = (style.getStyle as MVTGetStyleCallback | undefined) ?? (() => ({}))
    const overlay = new MVTOverlay({
      url: resource.url,
      levels: resource.levels,
      projection: resource.projection,
      resolution: resource.resolution,
      opacity: style.opacity,
      color: style.color,
      getStyle
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

  private createWMSOverlay(resource: WMSImagerySourceOptions, style: ImageryLayerStyleOptions = {}) {
    const overlay = new WMSTilesOverlay({
      url: this.normalizeResourceUrl(resource.url),
      layer: resource.layer,
      crs: resource.crs,
      format: resource.format,
      tileDimension: resource.tileDimension,
      styles: resource.styles,
      version: resource.version,
      levels: resource.levels,
      transparent: resource.transparent,
      contentBoundingBox: this.normalizeWMSContentBoundingBox(resource),
      opacity: style.opacity,
      color: style.color === undefined ? undefined : new THREE.Color(style.color),
      preprocessURL: this.createWMSPreprocessURL(resource)
    }) as WMSOverlayInstance

    if (resource.fetchOptions) {
      overlay.fetchOptions = resource.fetchOptions
    }

    this.patchMissingWMSReleaseGuard(overlay)
    this.patchMissingTextureFallback(overlay)

    return overlay
  }

  private patchMissingWMSReleaseGuard(overlay: WMSOverlayInstance) {
    const imageSource = overlay.imageSource
    if (!imageSource) return

    const release = imageSource.release.bind(imageSource)
    imageSource.release = (...args: number[]) => {
      try {
        release(...args)
      } catch (error) {
        if (this.isMissingDataCacheReleaseError(error)) return
        throw error
      }
    }
  }

  private patchMissingTextureFallback(overlay: WMSOverlayInstance) {
    const getTexture = overlay.getTexture.bind(overlay)
    overlay.getTexture = (range: number[], level?: number | null) => {
      return getTexture(range, level) ?? this.options.transparentOverlayTexture
    }

    const lockTexture = overlay.lockTexture.bind(overlay)
    overlay.lockTexture = async (range: number[], level?: number | null) => {
      return (await lockTexture(range, level)) ?? this.options.transparentOverlayTexture
    }
  }

  private patchRegionVisibilityGuard(overlay: ImageOverlay) {
    const regionOverlay = overlay as Partial<RegionVisibleOverlayInstance>
    if (typeof regionOverlay.setRegionVisible !== 'function') return

    const setRegionVisible = regionOverlay.setRegionVisible.bind(overlay)
    const visibleRegionCounts = new Map<string, number>()

    regionOverlay.setRegionVisible = (range: number[], visible: boolean) => {
      const key = range.join('_')
      const count = visibleRegionCounts.get(key) ?? 0

      if (!visible && count === 0) return

      if (visible) {
        visibleRegionCounts.set(key, count + 1)
      } else if (count === 1) {
        visibleRegionCounts.delete(key)
      } else {
        visibleRegionCounts.set(key, count - 1)
      }

      setRegionVisible(range, visible)
    }
  }

  private isMissingDataCacheReleaseError(error: unknown) {
    return error instanceof Error &&
      error.message === 'DataCache: Attempting to release key that does not exist'
  }

  private mergeFetchOptions(base: RequestInit | undefined, override: RequestInit = {}): RequestInit {
    if (!base) return override

    const headers = new Headers(base.headers)
    new Headers(override.headers).forEach((value, key) => {
      headers.set(key, value)
    })

    return {
      ...base,
      ...override,
      headers
    }
  }

  private normalizeWMSContentBoundingBox(resource: WMSImagerySourceOptions) {
    const bbox = resource.contentBoundingBox
    if (!bbox) return undefined

    const crs = (resource.crs ?? 'EPSG:4326').toUpperCase()
    if (crs === 'EPSG:3857' || crs === 'EPSG:900913') {
      const [minX, minY, maxX, maxY] = bbox
      return [
        this.webMercatorXToLongitude(minX),
        this.webMercatorYToLatitude(minY),
        this.webMercatorXToLongitude(maxX),
        this.webMercatorYToLatitude(maxY)
      ] as [number, number, number, number]
    }

    return bbox.map((value) => value * THREE.MathUtils.DEG2RAD) as [number, number, number, number]
  }

  private webMercatorXToLongitude(x: number) {
    return x / 6378137
  }

  private webMercatorYToLatitude(y: number) {
    return 2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2
  }

  private createWMSPreprocessURL(resource: WMSImagerySourceOptions) {
    const preprocessURL = resource.preprocessURL
    if (!this.isWMS11Version(resource.version)) return preprocessURL

    return (url: string) => {
      const normalizedUrl = this.normalizeWMS11URL(url)
      return preprocessURL ? preprocessURL(normalizedUrl) : normalizedUrl
    }
  }

  private isWMS11Version(version: string | undefined) {
    return version ? /^1\.1\./.test(version) : false
  }

  private normalizeWMS11URL(url: string) {
    const nextUrl = new URL(url, location.href)
    const crs = nextUrl.searchParams.get('CRS')
    if (!crs) return url

    nextUrl.searchParams.delete('CRS')
    nextUrl.searchParams.set('SRS', crs)

    if (crs.toUpperCase() === 'EPSG:4326') {
      const bbox = nextUrl.searchParams.get('BBOX')?.split(',').map(Number)
      if (bbox?.length === 4 && bbox.every(Number.isFinite)) {
        nextUrl.searchParams.set('BBOX', [bbox[1], bbox[0], bbox[3], bbox[2]].join(','))
      }
    }

    return nextUrl.toString()
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

  private normalizeResourceUrl(url: string) {
    return new URL(url, location.href).toString()
  }
}
