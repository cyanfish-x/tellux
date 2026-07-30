import * as THREE from 'three'
import type { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'
import type {
  AddHismLayerOptions,
  HismApplyInstanceMatrix,
  HismLayer,
  HismLayerRuntimeStats,
  HismPickResult
} from '../../types/hism'
import {
  HismCluster,
  type HismClusterPickCandidate
} from './HismCluster'
import {
  clusterCellKeyFromCartographic,
  resolveClusterReference
} from '../spatial/clusterGrid'
import { updateFrustumFromCamera } from '../spatial/frustumCull'
import { validateHismLayerOptions } from './validateHismLayerOptions'
import type { HismPickTraversalStats } from '../runtime/HismPickMetrics'

const DEFAULT_CLUSTER_CELL_SIZE_METERS = 512
const cameraPositionScratch = new THREE.Vector3()

export interface HismLayerInternalOptions extends AddHismLayerOptions {
  id: string
  rtcUniforms: RTCAutoUniforms
  applyInstanceMatrix: HismApplyInstanceMatrix
  onRemove: (layer: HismLayerImpl) => void
}

export class HismLayerImpl implements HismLayer {
  readonly id: string
  readonly root = new THREE.Group()
  readonly instanceCount: number

  private readonly clusters: HismCluster[] = []
  private readonly onUpdate?: AddHismLayerOptions['onUpdate']
  private readonly startedAt = performance.now() / 1000
  private readonly onRemove: (layer: HismLayerImpl) => void
  private isShown: boolean
  private isRemoved = false

  constructor(options: HismLayerInternalOptions) {
    validateHismLayerOptions(options)

    this.id = options.id
    this.root.name = `tellux-hism-${options.id}`
    this.onUpdate = options.onUpdate
    this.onRemove = options.onRemove
    this.isShown = options.show ?? true
    this.instanceCount = options.instances.length

    if (options.instances.length === 0) {
      return
    }

    const cellSizeMeters =
      options.clusterCellSizeMeters ?? DEFAULT_CLUSTER_CELL_SIZE_METERS
    const longitudes = options.instances.map((instance) => {
      const coordinates = instance.coordinates
      return Array.isArray(coordinates) ? coordinates[0] : coordinates.longitude
    })
    const latitudes = options.instances.map((instance) => {
      const coordinates = instance.coordinates
      return Array.isArray(coordinates) ? coordinates[1] : coordinates.latitude
    })
    const reference =
      options.referenceLatitude !== undefined &&
      options.referenceLongitude !== undefined
        ? {
            longitude: options.referenceLongitude,
            latitude: options.referenceLatitude
          }
        : resolveClusterReference(longitudes, latitudes)

    const clusterBuckets = new Map<string, HismClusterBuildBucket>()
    for (const placement of options.instances) {
      const coordinates = placement.coordinates
      const longitude = Array.isArray(coordinates)
        ? coordinates[0]
        : coordinates.longitude
      const latitude = Array.isArray(coordinates)
        ? coordinates[1]
        : coordinates.latitude
      const cellKey = clusterCellKeyFromCartographic(
        reference,
        longitude,
        latitude,
        cellSizeMeters
      )
      const bucket = clusterBuckets.get(cellKey) ?? { cellKey, items: [] }
      bucket.items.push({ placement })
      clusterBuckets.set(cellKey, bucket)
    }

    for (const bucket of clusterBuckets.values()) {
      const cluster = new HismCluster({
        cellKey: bucket.cellKey,
        cellSizeMeters,
        archetypes: options.archetypes,
        items: bucket.items,
        rtcUniforms: options.rtcUniforms,
        applyInstanceMatrix: options.applyInstanceMatrix
      })
      this.clusters.push(cluster)
      this.root.add(cluster.root)
    }

    this.root.visible = this.isShown
  }

  get visibleInstanceCount() {
    if (!this.isShown || this.isRemoved) return 0
    return this.clusters.reduce(
      (total, cluster) => total + cluster.getVisibleInstanceCount(),
      0
    )
  }

  get show() {
    return this.isShown
  }

  set show(value: boolean) {
    this.isShown = value
    this.root.visible = value
    if (!value) {
      for (const cluster of this.clusters) {
        cluster.setFrustumVisible(false)
      }
    }
  }

  collectVisiblePickMeshes() {
    if (!this.isShown || this.isRemoved) return []
    return this.clusters.flatMap((cluster) => cluster.collectVisiblePickMeshes())
  }

  collectPickCandidates(
    ray: THREE.Ray,
    stats?: HismPickTraversalStats
  ): HismClusterPickCandidate[] {
    if (!this.isShown || this.isRemoved) return []

    this.root.updateWorldMatrix(true, false)
    const candidates: HismClusterPickCandidate[] = []
    for (const cluster of this.clusters) {
      const visibleInstances = cluster.getVisibleInstanceCount()
      if (visibleInstances === 0) continue

      if (stats) {
        stats.visibleClusters += 1
        stats.visibleInstances += visibleInstances
      }

      const candidate = cluster.collectPickCandidate(ray)
      if (!candidate) continue

      if (stats) {
        stats.candidateClusters += 1
        stats.candidateInstances += candidate.instanceCount
        stats.candidateMeshes += candidate.meshes.length
      }
      candidates.push(candidate)
    }
    return candidates
  }

  /**
   * 按拾取结果解析当前 active LOD 下该实例的全部 parts。
   *
   * Resolves all parts for the picked instance at the active LOD.
   */
  resolveInstanceParts(
    pick: HismPickResult
  ): Array<{ mesh: THREE.InstancedMesh; instanceId: number }> | null {
    if (!this.isShown || this.isRemoved) return null
    const cluster = this.clusters.find(
      (item) => item.cellKey === pick.clusterKey
    )
    if (!cluster) return null
    return cluster.resolveInstanceParts(pick.archetypeIndex, pick.instanceId)
  }

  collectRuntimeStats(): HismLayerRuntimeStats {
    const stats: HismLayerRuntimeStats = {
      clusterCount: this.clusters.length,
      visibleClusters: 0,
      drawCalls: 0,
      activeLodCounts: {}
    }

    for (const cluster of this.clusters) {
      const clusterStats = cluster.collectRuntimeStats()
      stats.visibleClusters += clusterStats.visibleClusters
      stats.drawCalls += clusterStats.drawCalls
      for (const [lodIndex, count] of Object.entries(
        clusterStats.activeLodCounts
      )) {
        stats.activeLodCounts[lodIndex] =
          (stats.activeLodCounts[lodIndex] ?? 0) + count
      }
    }

    return stats
  }

  update(deltaTime: number, camera: THREE.Camera) {
    if (this.isRemoved || !this.isShown) return

    this.onUpdate?.(deltaTime, performance.now() / 1000 - this.startedAt)

    const frustum = updateFrustumFromCamera(camera)
    camera.getWorldPosition(cameraPositionScratch)

    for (const cluster of this.clusters) {
      cluster.updateLod(cameraPositionScratch)
      cluster.setFrustumVisible(cluster.intersectsFrustum(frustum))
    }
  }

  remove() {
    if (this.isRemoved) return
    this.isRemoved = true
    for (const cluster of this.clusters) {
      cluster.dispose()
    }
    this.clusters.length = 0
    this.root.parent?.remove(this.root)
    this.onRemove(this)
  }
}

interface HismClusterBuildBucket {
  cellKey: string
  items: Array<{ placement: AddHismLayerOptions['instances'][number] }>
}
