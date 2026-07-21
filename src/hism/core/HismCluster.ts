import * as THREE from 'three'
import {
  applyRTCInstancing,
  setRTCMatrixAt,
  type RTCInstancedMeshHandle
} from '../../rendering/applyRTCInstancing'
import type { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'
import type { HismApplyInstanceMatrix, HismArchetype, HismInstancePlacement } from '../../types/hism'
import { getArchetypeLodLevels, getMaxArchetypeLodCount } from '../lod/archetypeLod'
import { resolveLodLevel } from '../lod/resolveLodLevel'
import { createClusterCellBounds } from '../spatial/clusterGrid'
import { intersectsSphere } from '../spatial/frustumCull'
import {
  cloneGeometryForHismInstancing,
  disposeHismInstancedMesh
} from './instancingResources'

export interface HismClusterBuildItem {
  placement: HismInstancePlacement
}

export interface HismClusterOptions {
  cellKey: string
  cellSizeMeters: number
  archetypes: HismArchetype[]
  items: HismClusterBuildItem[]
  rtcUniforms: RTCAutoUniforms
  applyInstanceMatrix: HismApplyInstanceMatrix
}

interface LodMeshGroup {
  lodIndex: number
  maxDistanceMeters: number
  meshes: THREE.InstancedMesh[]
}

export interface HismClusterRuntimeStats {
  clusterCount: 1
  visibleClusters: 0 | 1
  drawCalls: number
  activeLodCounts: Record<string, number>
}

export class HismCluster {
  readonly root = new THREE.Group()
  readonly cellKey: string
  readonly boundingSphere = new THREE.Sphere()
  private readonly rtcHandles: RTCInstancedMeshHandle[] = []
  private readonly lodGroups: LodMeshGroup[] = []
  private readonly lodDistanceLevels: Array<{ maxDistanceMeters: number }> = []
  private instanceCount = 0
  private visibleInstanceCount = 0
  private frustumVisible = true
  private activeLodIndex = 0

  constructor(options: HismClusterOptions) {
    this.cellKey = options.cellKey
    this.root.name = `tellux-hism-cluster-${options.cellKey}`

    const buckets = options.archetypes.map(
      () => [] as HismClusterBuildItem[]
    )
    for (const item of options.items) {
      const bucket = buckets[item.placement.archetype]
      if (!bucket) {
        throw new Error(
          `HISM: invalid archetype index ${item.placement.archetype}.`
        )
      }
      bucket.push(item)
    }

    const maxLodCount = getMaxArchetypeLodCount(options.archetypes)

    for (let lodIndex = 0; lodIndex < maxLodCount; lodIndex += 1) {
      const maxDistanceMeters = this.resolveClusterLodDistance(
        options.archetypes,
        lodIndex
      )
      this.lodDistanceLevels.push({ maxDistanceMeters })

      const meshes: THREE.InstancedMesh[] = []

      for (
        let archetypeIndex = 0;
        archetypeIndex < options.archetypes.length;
        archetypeIndex += 1
      ) {
        const archetype = options.archetypes[archetypeIndex]
        const bucket = buckets[archetypeIndex]
        if (!archetype || bucket.length === 0) continue

        const lodLevels = getArchetypeLodLevels(archetype)
        const lodLevel = lodLevels[lodIndex] ?? lodLevels[lodLevels.length - 1]
        if (!lodLevel) continue

        for (let partIndex = 0; partIndex < lodLevel.parts.length; partIndex += 1) {
          const part = lodLevel.parts[partIndex]
          if (!part) continue

          const geometry = cloneGeometryForHismInstancing(part.geometry)
          const mesh = new THREE.InstancedMesh(
            geometry,
            part.material,
            bucket.length
          )
          mesh.name =
            part.name ??
            `archetype-${archetypeIndex}-lod-${lodIndex}-part-${partIndex}`
          mesh.castShadow = false
          mesh.receiveShadow = false
          mesh.frustumCulled = false
          mesh.userData.hismClusterKey = options.cellKey
          mesh.userData.hismArchetypeIndex = archetypeIndex
          mesh.userData.hismLodIndex = lodIndex
          mesh.userData.hismPartIndex = partIndex

          this.rtcHandles.push(applyRTCInstancing(mesh, options.rtcUniforms))

          const matrix = new THREE.Matrix4()
          const origins: THREE.Vector3[] = []

          bucket.forEach(({ placement }, index) => {
            options.applyInstanceMatrix(
              placement.coordinates,
              {
                heading: placement.heading,
                pitch: placement.pitch,
                roll: placement.roll
              },
              placement.scale,
              matrix
            )
            setRTCMatrixAt(mesh, index, matrix)

            if (partIndex === 0 && lodIndex === 0) {
              origins.push(
                new THREE.Vector3(
                  matrix.elements[12],
                  matrix.elements[13],
                  matrix.elements[14]
                )
              )
            }
          })

          if (lodIndex === 0 && origins.length > 0) {
            this.recomputeBounds(origins, options.cellSizeMeters)
          }

          meshes.push(mesh)
          this.root.add(mesh)
        }

        if (lodIndex === 0) {
          this.instanceCount += bucket.length
        }
      }

      this.lodGroups.push({
        lodIndex,
        maxDistanceMeters,
        meshes
      })
    }

    if (this.boundingSphere.radius === 0) {
      this.boundingSphere.center.set(0, 0, 0)
      this.boundingSphere.radius = options.cellSizeMeters
    }

    this.applyVisibility()
  }

  getInstanceCount() {
    return this.instanceCount
  }

  getVisibleInstanceCount() {
    return this.visibleInstanceCount
  }

  getActiveLodIndex() {
    return this.activeLodIndex
  }

  collectVisiblePickMeshes() {
    if (!this.frustumVisible) return []
    const group = this.lodGroups[this.activeLodIndex]
    return group?.meshes ?? []
  }

  /**
   * 解析指定原型实例在当前 active LOD 下的全部 mesh parts（不依赖 frustum）。
   *
   * Resolves all mesh parts for an archetype instance at the active LOD
   * (independent of frustum visibility).
   */
  resolveInstanceParts(
    archetypeIndex: number,
    instanceId: number
  ): Array<{ mesh: THREE.InstancedMesh; instanceId: number }> | null {
    const group = this.lodGroups[this.activeLodIndex]
    if (!group) return null

    const parts = group.meshes.filter(
      (mesh) => mesh.userData.hismArchetypeIndex === archetypeIndex
    )
    if (parts.length === 0) return null

    const first = parts[0]
    if (!first || instanceId < 0 || instanceId >= first.count) return null

    return parts.map((mesh) => ({ mesh, instanceId }))
  }

  collectRuntimeStats(): HismClusterRuntimeStats {
    const visible = this.frustumVisible
    const activeMeshes = visible ? this.collectVisiblePickMeshes() : []
    return {
      clusterCount: 1,
      visibleClusters: visible ? 1 : 0,
      drawCalls: activeMeshes.length,
      activeLodCounts: visible
        ? { [String(this.activeLodIndex)]: this.instanceCount }
        : {}
    }
  }

  updateLod(cameraPosition: THREE.Vector3) {
    const distance = cameraPosition.distanceTo(this.boundingSphere.center)
    const nextLod = resolveLodLevel(distance, this.lodDistanceLevels)
    if (nextLod === this.activeLodIndex) return
    this.activeLodIndex = nextLod
    this.applyVisibility()
  }

  setFrustumVisible(visible: boolean) {
    if (this.frustumVisible === visible) return
    this.frustumVisible = visible
    this.applyVisibility()
  }

  intersectsFrustum(frustum: THREE.Frustum) {
    return intersectsSphere(frustum, this.boundingSphere)
  }

  dispose() {
    this.root.parent?.remove(this.root)
    for (const handle of this.rtcHandles) {
      handle.dispose()
    }
    for (const mesh of this.lodGroups.flatMap((group) => group.meshes)) {
      disposeHismInstancedMesh(mesh)
    }
    this.lodGroups.length = 0
    this.rtcHandles.length = 0
  }

  private applyVisibility() {
    for (const group of this.lodGroups) {
      const lodVisible =
        this.frustumVisible && group.lodIndex === this.activeLodIndex
      for (const mesh of group.meshes) {
        mesh.visible = lodVisible
      }
    }
    this.visibleInstanceCount =
      this.frustumVisible && this.lodGroups.length > 0 ? this.instanceCount : 0
  }

  private resolveClusterLodDistance(
    archetypes: HismArchetype[],
    lodIndex: number
  ) {
    let maxDistance = Number.POSITIVE_INFINITY
    for (const archetype of archetypes) {
      const level = getArchetypeLodLevels(archetype)[lodIndex]
      if (level) {
        maxDistance = Math.min(maxDistance, level.maxDistanceMeters)
      }
    }
    return maxDistance
  }

  private recomputeBounds(origins: THREE.Vector3[], cellSizeMeters: number) {
    const center = new THREE.Vector3()
    for (const origin of origins) {
      center.add(origin)
    }
    center.multiplyScalar(1 / origins.length)

    let maxRadius = 0
    for (const origin of origins) {
      maxRadius = Math.max(maxRadius, origin.distanceTo(center))
    }

    const cellBounds = createClusterCellBounds(this.cellKey, cellSizeMeters)
    const cellRadius =
      Math.hypot(
        cellBounds.eastMax - cellBounds.eastMin,
        cellBounds.northMax - cellBounds.northMin
      ) * 0.5

    this.boundingSphere.center.copy(center)
    this.boundingSphere.radius = maxRadius + cellRadius + 128
  }
}
