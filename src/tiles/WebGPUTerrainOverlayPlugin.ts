import * as THREE from 'three'
import { ImageOverlayPlugin, type ImageOverlay } from '3d-tiles-renderer/plugins'
import type { TilesRenderer } from '3d-tiles-renderer'

type TileLike = {
  boundingVolume?: {
    region?: number[]
  }
  engineData?: {
    scene?: THREE.Object3D | null
    boundingVolume?: {
      intersectsFrustum(frustum: unknown): boolean
      distanceToPoint(point: THREE.Vector3): number
    } | null
  }
}

type OverlayProjectionLike = {
  clampToBounds(range: number[]): number[]
}

type ImageOverlayLike = ImageOverlay & {
  isReady?: boolean
  projection?: OverlayProjectionLike
}

type ViewErrorTarget = {
  inView: boolean
  error: number
  distance?: number
  distanceFromCamera?: number
}

type TilesRendererWithCameraInfo = TilesRenderer & {
  cameras?: unknown[]
  cameraInfo?: Array<{
    isOrthographic?: boolean
    pixelSize?: number
    sseDenominator?: number
    position: THREE.Vector3
    frustum: unknown
  }>
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
  overlays: ImageOverlay[]
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
    const internals = this as unknown as {
      tiles?: {
        recalculateBytesUsed(tile: TileLike): void
      } | null
      overlays: ImageOverlay[]
      overlayInfo: Map<ImageOverlay, {
        order: number
        tileInfo: Map<TileLike, {
          target: unknown
          meshInfo: Map<THREE.Mesh, { attribute: THREE.BufferAttribute }>
        }>
      }>
    }
    const { overlays, overlayInfo } = internals
    internals.tiles?.recalculateBytesUsed(tile)

    const overlay = overlays.find((item) => item.opacity !== 0)
    if (!overlay) {
      this.tileTextures.delete(tile)
      this.applyTextureToScene(tile.engineData?.scene ?? null, null)
      return
    }

    const tileInfo = overlayInfo.get(overlay)?.tileInfo.get(tile)
    if (!tileInfo?.target) {
      this.tileTextures.delete(tile)
      this.applyTextureToScene(tile.engineData?.scene ?? null, null)
      return
    }

    const texture = tileInfo.target as THREE.Texture
    this.tileTextures.set(tile, texture)

    tileInfo.meshInfo.forEach(({ attribute }, mesh) => {
      this.applyOverlayUvToMesh(mesh, attribute)
      this.applyTextureToMesh(mesh, texture)
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

  private applyTextureToScene(scene: THREE.Object3D | null, texture: THREE.Texture | null) {
    if (!scene) return

    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.material) return

      this.applyTextureToMesh(mesh, texture)
    })
  }

  private applyTextureToMesh(mesh: THREE.Mesh, texture: THREE.Texture | null) {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((material) => this.applyTextureToMaterial(material, texture))
      return
    }

    this.applyTextureToMaterial(mesh.material, texture)
  }

  private applyTextureToMaterial(material: THREE.Material, texture: THREE.Texture | null) {
    if (!('map' in material)) return

    // 3d-tiles-renderer 的 TiledImageSource 用 createImageBitmap({ imageOrientation: 'flipY' })
    // 预翻转影像，但 Texture.flipY 仍默认为 true。
    // WebGL 对 ImageBitmap 忽略 UNPACK_FLIP_Y；WebGPU 会在 copyExternalImageToTexture
    // 时再翻一次，导致单瓦片快路径贴图上下颠倒、邻接瓦片错缝。
    // TiledImageSource pre-flips imagery via createImageBitmap({ imageOrientation: 'flipY' })
    // but leaves Texture.flipY at its default true. WebGL ignores UNPACK_FLIP_Y for
    // ImageBitmap; WebGPU flips again in copyExternalImageToTexture, so the single-tile
    // fast path appears upside-down and adjacent tiles misalign.
    if (texture && typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) {
      texture.flipY = false
      texture.needsUpdate = true
    }

    ;(material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial).map = texture
    material.needsUpdate = true
  }
}

export class WebGPUTerrainOverlayPlugin {
  readonly name = 'TELLUX_WEBGPU_TERRAIN_OVERLAY_PLUGIN'
  readonly priority = -15

  private readonly splittingPlugin: SplittingPlugin
  private tiles: TilesRendererWithCameraInfo | null = null

  constructor(
    overlays: ImageOverlay[] = [],
    private readonly resolution = 256,
    enableTileSplitting = true
  ) {
    this.splittingPlugin = new WebGPUTerrainOverlaySplittingPlugin(
      overlays,
      resolution,
      enableTileSplitting
    ) as unknown as SplittingPlugin
  }

  get overlays() {
    return this.splittingPlugin.overlays
  }

  get enableTileSplitting() {
    return this.splittingPlugin.enableTileSplitting
  }

  set enableTileSplitting(value: boolean) {
    this.splittingPlugin.enableTileSplitting = value
  }

  init(tiles: TilesRenderer) {
    this.tiles = tiles as TilesRendererWithCameraInfo
    this.splittingPlugin.init(tiles)
  }

  addOverlay(overlay: ImageOverlay, order?: number) {
    this.splittingPlugin.addOverlay(overlay, order)
  }

  setOverlayOrder(overlay: ImageOverlay, order?: number) {
    this.splittingPlugin.setOverlayOrder(overlay, order)
  }

  deleteOverlay(overlay: ImageOverlay) {
    this.splittingPlugin.deleteOverlay(overlay)
  }

  processTileModel(scene: THREE.Object3D, tile: TileLike) {
    return this.splittingPlugin.processTileModel(scene, tile)
  }

  disposeTile(tile: TileLike) {
    this.splittingPlugin.disposeTile(tile)
  }

  dispose() {
    this.splittingPlugin.dispose()
    this.tiles = null
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

  calculateTileViewError(tile: TileLike, target: ViewErrorTarget) {
    if (!this.enableTileSplitting) return false

    const imageryGeometricError = this.calculateImageryGeometricError(tile)
    if (imageryGeometricError === null) return false

    const viewError = this.calculateImageryViewError(tile, imageryGeometricError)
    if (!viewError.inView) return false

    target.inView = true
    target.error = viewError.error
    target.distance = viewError.distance
    target.distanceFromCamera = viewError.distance
    return true
  }

  private calculateImageryGeometricError(tile: TileLike) {
    const overlay = this.getActiveOverlay()
    const region = tile.boundingVolume?.region
    if (!overlay?.isReady || !overlay.projection || !region) return null

    const [west, south, east, north] = overlay.projection.clampToBounds(region.slice(0, 4))
    const longitudeSpan = Math.abs(east - west)
    const latitudeSpan = Math.abs(north - south)
    if (longitudeSpan === 0 || latitudeSpan === 0) return null

    const radius = this.getEllipsoidRadius()
    const midLatitude = (south + north) * 0.5
    const widthMeters = radius * longitudeSpan * Math.max(Math.cos(midLatitude), 0.001)
    const heightMeters = radius * latitudeSpan
    return Math.max(widthMeters, heightMeters) / this.resolution
  }

  private calculateImageryViewError(tile: TileLike, geometricError: number) {
    const boundingVolume = tile.engineData?.boundingVolume
    const cameraInfo = this.tiles?.cameraInfo ?? []
    let inView = false
    let error = 0
    let distance = Infinity

    if (!boundingVolume || cameraInfo.length === 0) {
      return { inView, error, distance }
    }

    cameraInfo.forEach((info) => {
      const cameraDistance = info.isOrthographic
        ? Infinity
        : boundingVolume.distanceToPoint(info.position)
      const cameraError = info.isOrthographic
        ? geometricError / (info.pixelSize ?? Infinity)
        : cameraDistance === 0
          ? Infinity
          : geometricError / (cameraDistance * (info.sseDenominator ?? Infinity))

      if (boundingVolume.intersectsFrustum(info.frustum)) {
        inView = true
        error = Math.max(error, cameraError)
        distance = Math.min(distance, cameraDistance)
      }
    })

    return { inView, error, distance }
  }

  private getActiveOverlay() {
    return (this.splittingPlugin.overlays as ImageOverlayLike[])
      .find((overlay) => overlay.opacity !== 0) ?? null
  }

  private getEllipsoidRadius() {
    const radius = this.tiles?.ellipsoid?.radius
    return radius ? Math.max(radius.x, radius.y, radius.z) : 6378137
  }
}
