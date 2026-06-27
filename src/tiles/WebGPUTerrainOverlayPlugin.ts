import * as THREE from 'three'
import { ImageOverlayPlugin, type ImageOverlay } from '3d-tiles-renderer/plugins'
import type { TilesRenderer } from '3d-tiles-renderer'

type TileLike = {
  boundingVolume?: {
    region?: number[]
  }
}

type OverlayEntry = {
  overlay: ImageOverlay
  order: number
}

type TileOverlayRecord = {
  overlay: DirectTerrainImageOverlay
  range: number[]
}

type DirectTerrainImageOverlay = ImageOverlay & {
  projection: {
    clampToBounds(range: number[]): number[]
    toNormalizedRange(range: number[]): number[]
  }
  init(): Promise<unknown> | unknown
  whenReady(): Promise<unknown> | unknown
  hasContent(range: number[], level?: number | null): boolean
  getTexture(range: number[], level?: number | null): Promise<THREE.Texture | null> | THREE.Texture | null
  lockTexture(range: number[], level?: number | null): Promise<unknown> | unknown
  releaseTexture(range: number[], level?: number | null): void
  setResolution(resolution: number): void
}

type SplittingPlugin = ImageOverlayPlugin & {
  name: string
  enableTileSplitting: boolean
  init(tiles: TilesRenderer): void
  processTileModel(scene: THREE.Object3D, tile: TileLike): Promise<unknown>
  disposeTile(tile: TileLike): void
  dispose(): void
  fetchData(url: string, options?: unknown): ArrayBuffer | undefined
  parseToMesh(buffer: ArrayBuffer, tile: TileLike, extension: string, url: string): THREE.Object3D | undefined
  calculateBytesUsed(tile: TileLike): number
  getAttributions(target: unknown[]): void
  resetFailedOverlays(): void
  getTexture(tile: TileLike): THREE.Texture | null
}

class WebGPUTerrainOverlaySplittingPlugin extends ImageOverlayPlugin {
  name = 'TELLUX_WEBGPU_TERRAIN_OVERLAY_SPLITTING_PLUGIN'
  private readonly tileTextures = new WeakMap<TileLike, THREE.Texture>()

  constructor(overlays: ImageOverlay[], resolution: number, enableTileSplitting: boolean) {
    super({
      renderer: {} as THREE.WebGLRenderer,
      overlays,
      resolution,
      enableTileSplitting
    })
  }

  _wrapMaterials() {}

  _updateLayers(tile: TileLike) {
    const overlays = (this as unknown as {
      overlays: ImageOverlay[]
      overlayInfo: Map<ImageOverlay, {
        order: number
        tileInfo: Map<TileLike, {
          target: unknown
          meshInfo: Map<THREE.Mesh, { attribute: THREE.BufferAttribute }>
        }>
      }>
    }).overlays
    const overlayInfo = (this as unknown as {
      overlayInfo: Map<ImageOverlay, {
        order: number
        tileInfo: Map<TileLike, {
          target: unknown
          meshInfo: Map<THREE.Mesh, { attribute: THREE.BufferAttribute }>
        }>
      }>
    }).overlayInfo
    const overlay = overlays.find((item) => item.opacity !== 0)
    if (!overlay) return

    const tileInfo = overlayInfo.get(overlay)?.tileInfo.get(tile)
    if (!tileInfo?.target) {
      this.tileTextures.delete(tile)
      return
    }

    this.tileTextures.set(tile, tileInfo.target as THREE.Texture)

    tileInfo.meshInfo.forEach(({ attribute }, mesh) => {
      this.applyOverlayUvToMesh(mesh, attribute)
    })
  }

  disposeTile(tile: TileLike) {
    ;(
      ImageOverlayPlugin.prototype as unknown as {
        disposeTile(this: ImageOverlayPlugin, tile: TileLike): void
      }
    ).disposeTile.call(this, tile)
    this.tileTextures.delete(tile)
  }

  getTexture(tile: TileLike) {
    return this.tileTextures.get(tile) ?? null
  }

  private applyOverlayUvToMesh(mesh: THREE.Mesh, attribute: THREE.BufferAttribute) {
    const array = new Float32Array(attribute.count * 2)
    for (let index = 0; index < attribute.count; index += 1) {
      array[index * 2] = attribute.getX(index)
      array[index * 2 + 1] = attribute.getY(index)
    }

    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(array, 2))
    mesh.geometry.dispose()
  }
}

export class WebGPUTerrainOverlayPlugin {
  readonly name = 'TELLUX_WEBGPU_TERRAIN_OVERLAY_PLUGIN'
  readonly priority = -15

  private readonly splittingPlugin: SplittingPlugin
  private readonly directPlugin: WebGPUTerrainDirectOverlayPlugin

  constructor(
    overlays: ImageOverlay[] = [],
    resolution = 256,
    enableTileSplitting = true
  ) {
    this.splittingPlugin = new WebGPUTerrainOverlaySplittingPlugin(
      overlays,
      resolution,
      enableTileSplitting
    ) as unknown as SplittingPlugin
    this.directPlugin = new WebGPUTerrainDirectOverlayPlugin(
      overlays,
      resolution,
      (tile) => this.splittingPlugin.getTexture(tile)
    )
  }

  get overlays() {
    return this.directPlugin.overlays
  }

  get enableTileSplitting() {
    return this.splittingPlugin.enableTileSplitting
  }

  set enableTileSplitting(value: boolean) {
    this.splittingPlugin.enableTileSplitting = value
  }

  init(tiles: TilesRenderer) {
    this.splittingPlugin.init(tiles)
    this.directPlugin.init(tiles)
  }

  addOverlay(overlay: ImageOverlay, order?: number) {
    this.splittingPlugin.addOverlay(overlay, order)
    this.directPlugin.addOverlay(overlay, order)
  }

  setOverlayOrder(overlay: ImageOverlay, order?: number) {
    this.splittingPlugin.setOverlayOrder(overlay, order)
    this.directPlugin.setOverlayOrder(overlay, order)
  }

  deleteOverlay(overlay: ImageOverlay) {
    this.splittingPlugin.deleteOverlay(overlay)
    this.directPlugin.deleteOverlay(overlay)
  }

  async processTileModel(scene: THREE.Object3D, tile: TileLike) {
    await this.splittingPlugin.processTileModel(scene, tile)
    await this.directPlugin.processTileModel(scene, tile)
  }

  disposeTile(tile: TileLike) {
    this.splittingPlugin.disposeTile(tile)
    this.directPlugin.disposeTile(tile)
  }

  dispose() {
    this.splittingPlugin.dispose()
    this.directPlugin.dispose()
  }

  fetchData(url: string, options?: unknown) {
    return this.splittingPlugin.fetchData(url, options)
  }

  parseToMesh(buffer: ArrayBuffer, tile: TileLike, extension: string, url: string) {
    return this.splittingPlugin.parseToMesh(buffer, tile, extension, url)
  }

  calculateBytesUsed(tile: TileLike) {
    return this.splittingPlugin.calculateBytesUsed(tile)
  }

  getAttributions(target: unknown[]) {
    this.splittingPlugin.getAttributions(target)
  }

  resetFailedOverlays() {
    this.splittingPlugin.resetFailedOverlays()
  }
}

class WebGPUTerrainDirectOverlayPlugin {
  private tiles: TilesRenderer | null = null
  private readonly entries: OverlayEntry[] = []
  private readonly tileRecords = new WeakMap<TileLike, TileOverlayRecord>()
  private readonly tileVersions = new WeakMap<TileLike, { value: number }>()

  constructor(
    overlays: ImageOverlay[] = [],
    private readonly resolution = 256,
    private readonly getPreparedTexture: (tile: TileLike) => THREE.Texture | null = () => null
  ) {
    overlays.forEach((overlay, index) => {
      this.addOverlay(overlay, index)
    })
  }

  get overlays() {
    return this.entries.map((entry) => entry.overlay)
  }

  init(tiles: TilesRenderer) {
    this.tiles = tiles
    this.entries.forEach((entry) => {
      void this.prepareOverlay(entry.overlay)
    })
  }

  addOverlay(overlay: ImageOverlay, order = this.entries.length) {
    if (this.entries.some((entry) => entry.overlay === overlay)) return

    this.entries.push({ overlay, order })
    this.sortEntries()
    if (!this.tiles) return

    void this.prepareOverlay(overlay).then(() => {
      this.refreshLoadedModels()
    })
  }

  setOverlayOrder(overlay: ImageOverlay, order = this.entries.length) {
    const entry = this.entries.find((item) => item.overlay === overlay)
    if (!entry) return

    entry.order = order
    this.sortEntries()
    this.refreshLoadedModels()
  }

  deleteOverlay(overlay: ImageOverlay) {
    const index = this.entries.findIndex((entry) => entry.overlay === overlay)
    if (index === -1) return

    this.entries.splice(index, 1)
    this.refreshLoadedModels()
  }

  async processTileModel(scene: THREE.Object3D, tile: TileLike) {
    const overlay = await this.getActiveOverlay()
    if (!overlay) {
      this.clearTile(scene, tile)
      return
    }

    const preparedTexture = this.getPreparedTexture(tile)
    if (preparedTexture) {
      this.releaseTileRecord(tile)
      this.applyTexture(scene, preparedTexture)
      return
    }

    const region = tile.boundingVolume?.region
    if (!region) {
      this.clearTile(scene, tile)
      return
    }

    const range = overlay.projection.toNormalizedRange(
      overlay.projection.clampToBounds(region.slice(0, 4))
    )
    if (!overlay.hasContent(range)) {
      this.clearTile(scene, tile)
      return
    }

    this.releaseTileRecord(tile)
    const version = this.bumpTileVersion(tile)
    await overlay.lockTexture(range)
    if (!this.isCurrentTileVersion(tile, version)) {
      overlay.releaseTexture(range)
      return
    }
    const texture = await overlay.getTexture(range)
    if (!texture) {
      this.clearTile(scene, tile)
      return
    }

    this.tileRecords.set(tile, { overlay, range })
    this.applyTexture(scene, texture)
  }

  disposeTile(tile: TileLike) {
    this.bumpTileVersion(tile)
    this.releaseTileRecord(tile)
  }

  dispose() {
    this.tiles?.forEachLoadedModel((_scene, tile) => {
      this.releaseTileRecord(tile as TileLike)
    })
    this.entries.length = 0
    this.tiles = null
  }

  private async prepareOverlay(overlay: ImageOverlay) {
    const directOverlay = overlay as DirectTerrainImageOverlay
    await directOverlay.init()
    directOverlay.setResolution(this.resolution)
  }

  private async getActiveOverlay() {
    const entry = this.entries.find((item) => item.overlay.opacity !== 0)
    if (!entry) return null

    const overlay = entry.overlay as DirectTerrainImageOverlay
    await overlay.whenReady()
    overlay.setResolution(this.resolution)
    return overlay
  }

  private applyTexture(scene: THREE.Object3D, texture: THREE.Texture) {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => this.applyTextureToMaterial(material, texture))
        return
      }

      this.applyTextureToMaterial(mesh.material, texture)
    })
  }

  private applyTextureToMaterial(material: THREE.Material, texture: THREE.Texture | null) {
    if (!('map' in material)) return

    ;(material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map = texture
    material.needsUpdate = true
  }

  private clearTile(scene: THREE.Object3D, tile: TileLike) {
    this.releaseTileRecord(tile)
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return

      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((material) => this.applyTextureToMaterial(material, null))
        return
      }

      this.applyTextureToMaterial(mesh.material, null)
    })
  }

  private releaseTileRecord(tile: TileLike) {
    const record = this.tileRecords.get(tile)
    if (!record) return

    record.overlay.releaseTexture(record.range)
    this.tileRecords.delete(tile)
  }

  private bumpTileVersion(tile: TileLike) {
    const version = this.tileVersions.get(tile) ?? { value: 0 }
    version.value += 1
    this.tileVersions.set(tile, version)
    return version.value
  }

  private isCurrentTileVersion(tile: TileLike, value: number) {
    return this.tileVersions.get(tile)?.value === value
  }

  private refreshLoadedModels() {
    if (!this.tiles) return

    this.tiles.forEachLoadedModel((scene, tile) => {
      void this.processTileModel(scene, tile as TileLike)
    })
    this.tiles.dispatchEvent({ type: 'needs-render' })
  }

  private sortEntries() {
    this.entries.sort((left, right) => left.order - right.order)
  }
}
