import * as THREE from 'three'
import type { Viewer, TerrainTileSnapshot } from '../../src'
import type { OceanParameters } from './parameters'
import { RIYUE_BAY_PRESET } from './RiyueBayPreset'
import type {
  TerrainFieldRevision,
  TerrainFieldWorkerConfig,
  TerrainFieldWorkerRequest,
  TerrainFieldWorkerResponse
} from './terrainFieldMessages'
import type { TerrainRasterizerInput } from './terrainRasterizer'

export interface TerrainCoastAdapterOptions {
  viewer: Viewer
  oceanRoot: THREE.Object3D
  parameters: OceanParameters
  onField: (field: TerrainFieldRevision) => void
  onStatus?: (message: string) => void
}

export class TerrainCoastAdapter {
  private readonly worker: Worker
  private readonly unsubscribe: () => void
  private readonly rootWorldInverse = new THREE.Matrix4()
  private blendingUntil = 0
  private lastComposeRequest = 0
  private isDisposed = false

  constructor(private readonly options: TerrainCoastAdapterOptions) {
    const quality = RIYUE_BAY_PRESET.quality[options.parameters.quality]
    const extent = RIYUE_BAY_PRESET.extent
    const config: TerrainFieldWorkerConfig = {
      width: quality.fieldWidth,
      height: quality.fieldHeight,
      cellSize: (extent.crossShoreMax - extent.crossShoreMin) / quality.fieldWidth,
      maxBytes: 64 * 1024 * 1024,
      blendSeconds: options.parameters.lodBlendSeconds,
      crossShoreMin: extent.crossShoreMin,
      crossShoreMax: extent.crossShoreMax,
      alongshoreMin: extent.alongshoreMin,
      alongshoreMax: extent.alongshoreMax,
      seaLevel: options.parameters.seaLevel,
      maxDepth: options.parameters.depth,
      bathymetrySlope: options.parameters.bathymetrySlope,
      hysteresis: 0.15
    }
    this.worker = new Worker(new URL('./terrainField.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', this.handleWorkerMessage)
    this.post({ type: 'init', config })
    this.unsubscribe = options.viewer.terrain.observeTiles((event) => {
      if (event.type === 'load') this.handleTileLoad(event.tile)
      if (event.type === 'reset') this.post({
        type: 'reset',
        sourceRevision: event.sourceRevision
      })
    }, {
      rectangle: terrainObservationRectangle(),
      replay: true
    })
  }

  update(nowSeconds: number) {
    if (this.isDisposed || nowSeconds > this.blendingUntil) return
    if (nowSeconds - this.lastComposeRequest < 0.5) return
    this.lastComposeRequest = nowSeconds
    this.post({ type: 'compose', nowSeconds })
  }

  updateSettings(parameters: OceanParameters) {
    this.post({
      type: 'settings',
      seaLevel: parameters.seaLevel,
      maxDepth: parameters.depth,
      bathymetrySlope: parameters.bathymetrySlope,
      blendSeconds: parameters.lodBlendSeconds
    })
  }

  dispose() {
    if (this.isDisposed) return
    this.isDisposed = true
    this.unsubscribe()
    this.worker.removeEventListener('message', this.handleWorkerMessage)
    this.worker.terminate()
  }

  private handleTileLoad(snapshot: TerrainTileSnapshot) {
    this.options.oceanRoot.updateMatrixWorld(true)
    this.rootWorldInverse.copy(this.options.oceanRoot.matrixWorld).invert()
    snapshot.model.updateMatrixWorld(true)
    const raster = copyTerrainSurface(snapshot.model, this.rootWorldInverse)
    if (!raster) return
    const nowSeconds = performance.now() / 1000
    this.blendingUntil = Math.max(this.blendingUntil, nowSeconds + this.options.parameters.lodBlendSeconds)
    const request: TerrainFieldWorkerRequest = {
      type: 'page',
      page: {
        id: snapshot.id,
        parentId: snapshot.parentId,
        sourceRevision: snapshot.sourceRevision,
        depth: snapshot.depth,
        rectangle: snapshot.rectangle,
        loadedAt: nowSeconds
      },
      raster
    }
    this.worker.postMessage(request, [
      raster.positions.buffer,
      raster.uvs.buffer,
      raster.indices.buffer
    ])
  }

  private readonly handleWorkerMessage = (event: MessageEvent<TerrainFieldWorkerResponse>) => {
    if (event.data.type === 'error') {
      this.options.onStatus?.(`Terrain field error: ${event.data.message}`)
      return
    }
    this.options.onField(event.data)
  }

  private post(message: TerrainFieldWorkerRequest) {
    this.worker.postMessage(message)
  }
}

export function copyTerrainSurface(
  model: THREE.Object3D,
  worldToOcean: THREE.Matrix4
): TerrainRasterizerInput | null {
  let result: TerrainRasterizerInput | null = null
  model.traverse((object) => {
    if (result || !(object as THREE.Mesh).isMesh) return
    const mesh = object as THREE.Mesh
    const geometry = mesh.geometry
    const position = geometry.getAttribute('position')
    const uv = geometry.getAttribute('uv')
    const surfaceGroup = geometry.groups[0]
    if (!position || !uv || !surfaceGroup) return

    const positions = new Float32Array(position.count * 3)
    const uvs = new Float32Array(uv.count * 2)
    for (let index = 0; index < position.count; index += 1) {
      positions[index * 3] = position.getX(index)
      positions[index * 3 + 1] = position.getY(index)
      positions[index * 3 + 2] = position.getZ(index)
    }
    for (let index = 0; index < uv.count; index += 1) {
      uvs[index * 2] = uv.getX(index)
      uvs[index * 2 + 1] = uv.getY(index)
    }

    const sourceIndex = geometry.index
    const groupCount = Math.min(surfaceGroup.count, sourceIndex?.count ?? position.count)
    const indices = new Uint32Array(groupCount)
    for (let index = 0; index < groupCount; index += 1) {
      indices[index] = sourceIndex
        ? sourceIndex.getX(surfaceGroup.start + index)
        : surfaceGroup.start + index
    }
    const matrix = worldToOcean.clone().multiply(mesh.matrixWorld).toArray()
    result = {
      size: 65,
      positions,
      uvs,
      indices,
      indexStart: 0,
      indexCount: indices.length,
      matrix
    }
  })
  return result
}

function terrainObservationRectangle() {
  const corners = [
    [RIYUE_BAY_PRESET.extent.crossShoreMin, RIYUE_BAY_PRESET.extent.alongshoreMin],
    [RIYUE_BAY_PRESET.extent.crossShoreMin, RIYUE_BAY_PRESET.extent.alongshoreMax],
    [RIYUE_BAY_PRESET.extent.crossShoreMax, RIYUE_BAY_PRESET.extent.alongshoreMin],
    [RIYUE_BAY_PRESET.extent.crossShoreMax, RIYUE_BAY_PRESET.extent.alongshoreMax]
  ].map(([x, z]) => {
    const center = RIYUE_BAY_PRESET.center
    const seaward = RIYUE_BAY_PRESET.seawardBearing * Math.PI / 180
    const alongshore = RIYUE_BAY_PRESET.alongshoreHeading * Math.PI / 180
    const east = x * Math.sin(seaward) + z * Math.sin(alongshore)
    const north = x * Math.cos(seaward) + z * Math.cos(alongshore)
    return {
      longitude: center.longitude + east / (111_320 * Math.cos(center.latitude * Math.PI / 180)),
      latitude: center.latitude + north / 110_540
    }
  })
  return {
    west: Math.min(...corners.map((point) => point.longitude)),
    south: Math.min(...corners.map((point) => point.latitude)),
    east: Math.max(...corners.map((point) => point.longitude)),
    north: Math.max(...corners.map((point) => point.latitude))
  }
}
