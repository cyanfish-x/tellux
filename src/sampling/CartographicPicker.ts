import * as THREE from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'
import { RAD2DEG } from '../constants'
import type { TilesetManager } from '../tiles/TilesetManager'
import type { CartographicCoordinates, ScreenPosition } from '../types'

export class CartographicPicker {
  private readonly coords = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()
  private readonly ray = new THREE.Ray()
  private readonly point = new THREE.Vector3()
  private readonly matrix = new THREE.Matrix4()
  private readonly cartographicScratch = { lat: 0, lon: 0, height: 0 }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly tilesets: TilesetManager
  ) {}

  pick(position: ScreenPosition): CartographicCoordinates | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return null

    this.coords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.coords, this.camera)

    for (const tileset of this.tilesets.loadedSceneTilesets) {
      if (!tileset.group.visible) continue

      const tilesetHit = this.pickTilesetCartographic(tileset)
      if (tilesetHit) return tilesetHit
    }

    if (this.tilesets.terrainTileset) {
      const terrainHit = this.pickTilesetCartographic(this.tilesets.terrainTileset)
      if (terrainHit) return terrainHit
    }

    return this.pickTilesetCartographic(this.tilesets.surfaceTileset) ?? this.pickEllipsoidCartographic()
  }

  private pickTilesetCartographic(tileset: TilesRenderer): CartographicCoordinates | null {
    tileset.group.updateMatrixWorld(true)
    this.matrix.copy(tileset.group.matrixWorld).invert()

    const hit = this.raycaster.intersectObject(tileset.group, true)[0]
    if (!hit) return null

    this.point.copy(hit.point).applyMatrix4(this.matrix)
    return this.toCartographicCoordinates(this.point, tileset)
  }

  private pickEllipsoidCartographic() {
    this.tilesets.surfaceTileset.group.updateMatrixWorld(true)
    this.matrix.copy(this.tilesets.surfaceTileset.group.matrixWorld).invert()
    this.ray.copy(this.raycaster.ray).applyMatrix4(this.matrix)

    const point = this.tilesets.surfaceTileset.ellipsoid.intersectRay(this.ray, this.point)
    if (!point) return null

    return this.toCartographicCoordinates(point, this.tilesets.surfaceTileset)
  }

  private toCartographicCoordinates(point: THREE.Vector3, tileset: TilesRenderer): CartographicCoordinates {
    const cartographic = tileset.ellipsoid.getPositionToCartographic(point, this.cartographicScratch)
    return {
      latitude: cartographic.lat * RAD2DEG,
      longitude: cartographic.lon * RAD2DEG,
      height: cartographic.height
    }
  }
}
