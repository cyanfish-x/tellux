import * as THREE from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'
import { RAD2DEG } from '../constants'
import type { TilesetManager } from '../tiles/TilesetManager'
import type { Picked3DTilesFeature, ScreenPosition, TilesetFeatureProperties } from '../types'

type BatchTableLike = {
  count?: number
  getDataFromId?: (id: number, target?: object) => object
}

type MetadataObject = THREE.Object3D & {
  batchTable?: BatchTableLike
  featureTable?: unknown
}

type MeshFeatureInfo = {
  propertyTable?: number | string | null
}

type MeshFeaturesLike = {
  getFeatureInfo?: () => MeshFeatureInfo[]
  getFeatures?: (triangle: number, barycoord: THREE.Vector3) => Array<number | null>
}

type StructuralMetadataLike = {
  getPropertyTableData?: (tableIndex: number, id: number, target?: object | null) => object
}

type FeatureMetadata = {
  featureId: number | null
  properties: TilesetFeatureProperties
}

const BATCH_ID_ATTRIBUTE_NAMES = new Set([
  '_BATCHID',
  'BATCHID',
  '_BATCH_ID',
  'BATCH_ID',
  'BATCHID_0',
  '_BATCHID_0'
])

export class TilesetFeaturePicker {
  private readonly coords = new THREE.Vector2()
  private readonly raycaster = new THREE.Raycaster()
  private readonly matrix = new THREE.Matrix4()
  private readonly point = new THREE.Vector3()
  private readonly localPoint = new THREE.Vector3()
  private readonly barycoord = new THREE.Vector3()
  private readonly triangleA = new THREE.Vector3()
  private readonly triangleB = new THREE.Vector3()
  private readonly triangleC = new THREE.Vector3()
  private readonly cartographicScratch = { lat: 0, lon: 0, height: 0 }

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly tilesets: TilesetManager
  ) {}

  pick(position: ScreenPosition): Picked3DTilesFeature | null {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (!width || !height) return null

    this.coords.set((position.x / width) * 2 - 1, -(position.y / height) * 2 + 1)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(this.coords, this.camera)

    let picked: Picked3DTilesFeature | null = null
    for (const { id, tileset } of this.tilesets.loadedSceneTilesetEntries) {
      if (!tileset.group.visible) continue

      const hit = this.pickTilesetFeature(id, tileset)
      if (hit && (!picked || hit.distance < picked.distance)) {
        picked = hit
      }
    }

    return picked
  }

  private pickTilesetFeature(layerId: string, tileset: TilesRenderer): Picked3DTilesFeature | null {
    tileset.group.updateMatrixWorld(true)
    this.matrix.copy(tileset.group.matrixWorld).invert()

    const hit = this.raycaster.intersectObject(tileset.group, true).find((intersection) => {
      return !this.isPickingIgnored(intersection.object)
    })
    if (!hit) return null

    this.point.copy(hit.point).applyMatrix4(this.matrix)
    const cartographic = tileset.ellipsoid.getPositionToCartographic(this.point, this.cartographicScratch)
    const metadata = this.getFeatureMetadata(hit, tileset)

    return {
      layerId,
      tileset,
      object: hit.object,
      point: hit.point.clone(),
      distance: hit.distance,
      faceIndex: hit.faceIndex ?? null,
      featureId: metadata.featureId,
      properties: metadata.properties,
      cartographic: {
        latitude: cartographic.lat * RAD2DEG,
        longitude: cartographic.lon * RAD2DEG,
        height: cartographic.height
      }
    }
  }

  private getFeatureMetadata(hit: THREE.Intersection, tileset: TilesRenderer): FeatureMetadata {
    const structuralMetadata = this.getStructuralMetadata(hit)
    const meshFeatureMetadata = this.getMeshFeatureMetadata(hit, structuralMetadata)
    if (meshFeatureMetadata) return meshFeatureMetadata

    const batchTable = this.getBatchTable(hit.object, tileset)
    const featureId = this.getBatchFeatureId(hit, batchTable)
    const properties = featureId === null ? {} : this.readBatchTableProperties(batchTable, featureId)
    return { featureId, properties }
  }

  private getMeshFeatureMetadata(
    hit: THREE.Intersection,
    structuralMetadata: StructuralMetadataLike | null
  ): FeatureMetadata | null {
    if (hit.faceIndex === undefined || hit.faceIndex === null || !hit.face) return null
    if (!this.isMesh(hit.object)) return null

    const meshFeatures = hit.object.userData.meshFeatures as MeshFeaturesLike | undefined
    if (!meshFeatures?.getFeatures || !meshFeatures.getFeatureInfo) return null

    const barycoord = this.getBarycoord(hit)
    if (!barycoord) return null

    const featureIds = meshFeatures.getFeatures(hit.faceIndex, barycoord)
    const featureInfo = meshFeatures.getFeatureInfo()
    for (let i = 0; i < featureIds.length; i += 1) {
      const featureId = featureIds[i]
      if (featureId === null || featureId === undefined) continue

      const propertyTable = Number(featureInfo[i]?.propertyTable)
      const properties = Number.isFinite(propertyTable) && structuralMetadata?.getPropertyTableData
        ? this.normalizeProperties(structuralMetadata.getPropertyTableData(propertyTable, featureId))
        : {}

      return { featureId, properties }
    }

    return null
  }

  private getBatchFeatureId(hit: THREE.Intersection, batchTable: BatchTableLike | null) {
    if (hit.instanceId !== undefined) return hit.instanceId
    if (this.isMesh(hit.object)) {
      const attribute = this.getBatchIdAttribute(hit.object.geometry)
      const vertexIndex = attribute ? this.getHitVertexIndex(hit) : null
      if (attribute && vertexIndex !== null) {
        return Math.round(attribute.getX(vertexIndex))
      }
    }

    return batchTable?.count === 1 ? 0 : null
  }

  private getBatchTable(object: THREE.Object3D, tileset: TilesRenderer): BatchTableLike | null {
    let current: THREE.Object3D | null = object
    while (current) {
      const metadataObject = current as MetadataObject
      if (metadataObject.batchTable) return metadataObject.batchTable
      if (current === tileset.group) break
      current = current.parent
    }

    return null
  }

  private getStructuralMetadata(hit: THREE.Intersection): StructuralMetadataLike | null {
    let current: THREE.Object3D | null = hit.object
    while (current) {
      const metadata = current.userData.structuralMetadata as StructuralMetadataLike | undefined
      if (metadata?.getPropertyTableData) return metadata
      current = current.parent
    }

    return null
  }

  private readBatchTableProperties(batchTable: BatchTableLike | null, featureId: number) {
    if (!batchTable?.getDataFromId) return {}
    return this.normalizeProperties(batchTable.getDataFromId(featureId))
  }

  private normalizeProperties(properties: object | null | undefined): TilesetFeatureProperties {
    if (!properties) return {}
    return { ...(properties as TilesetFeatureProperties) }
  }

  private getBarycoord(hit: THREE.Intersection) {
    if (!hit.face || !this.isMesh(hit.object)) return null

    const position = hit.object.geometry.getAttribute('position')
    if (!position) return null

    this.triangleA.fromBufferAttribute(position, hit.face.a)
    this.triangleB.fromBufferAttribute(position, hit.face.b)
    this.triangleC.fromBufferAttribute(position, hit.face.c)
    this.localPoint.copy(hit.point)
    hit.object.worldToLocal(this.localPoint)

    THREE.Triangle.getBarycoord(
      this.localPoint,
      this.triangleA,
      this.triangleB,
      this.triangleC,
      this.barycoord
    )
    return this.barycoord
  }

  private getHitVertexIndex(hit: THREE.Intersection) {
    if (hit.face) return hit.face.a
    if (!this.isMesh(hit.object) || hit.faceIndex === undefined || hit.faceIndex === null) return null

    const index = hit.object.geometry.index
    return index ? index.getX(hit.faceIndex * 3) : hit.faceIndex * 3
  }

  private getBatchIdAttribute(geometry: THREE.BufferGeometry) {
    for (const key of Object.keys(geometry.attributes)) {
      if (BATCH_ID_ATTRIBUTE_NAMES.has(key.toUpperCase())) {
        return geometry.getAttribute(key)
      }
    }

    return null
  }

  private isMesh(object: THREE.Object3D): object is THREE.Mesh {
    return (object as THREE.Mesh).isMesh === true
  }

  private isPickingIgnored(object: THREE.Object3D) {
    let current: THREE.Object3D | null = object
    while (current) {
      if (current.userData.telluxPickingIgnore === true) return true
      current = current.parent
    }

    return false
  }
}
