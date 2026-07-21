import * as THREE from 'three'
import { getRtcInstanceMatrixAt } from '../rendering/applyRTCInstancing'
import type { HismPickResult } from '../types/hism'

export interface HismResolvedInstancePart {
  mesh: THREE.InstancedMesh
  instanceId: number
}

export type ResolveHismInstanceParts = (
  pick: HismPickResult
) => HismResolvedInstancePart[] | null

interface ProxyBinding {
  proxy: THREE.Mesh
  source: THREE.InstancedMesh
  instanceId: number
}

const instanceLocalMatrix = new THREE.Matrix4()

function hismPickKey(pick: HismPickResult) {
  return `${pick.layerId}:${pick.clusterKey}:${pick.archetypeIndex}:${pick.instanceId}`
}

function partsFingerprint(parts: HismResolvedInstancePart[]) {
  return parts.map((part) => `${part.mesh.uuid}:${part.instanceId}`).join('|')
}

/**
 * HISM 单实例描边代理：为选中实例的全部 parts 创建不可见 proxy Mesh。
 *
 * HISM single-instance outline proxy: builds invisible proxy meshes for all
 * parts of the selected instance.
 */
export class HismInstanceHighlighter {
  private readonly root = new THREE.Group()
  private readonly bindings: ProxyBinding[] = []
  private pick: HismPickResult | null = null
  private fingerprint = ''
  private readonly proxyMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false
  })

  constructor(
    private readonly scene: THREE.Scene,
    private readonly resolveParts: ResolveHismInstanceParts
  ) {
    this.root.name = 'tellux-hism-highlight-proxies'
    this.root.matrixAutoUpdate = false
    this.scene.add(this.root)
  }

  /** 供 OutlineHighlighter 使用的 proxy 根节点。Proxy root for OutlineHighlighter. */
  getOutlineRoot() {
    return this.root
  }

  get currentPick() {
    return this.pick
  }

  set(pick: HismPickResult): boolean {
    const parts = this.resolveParts(pick)
    if (!parts || parts.length === 0) {
      this.clear()
      return false
    }
    this.pick = pick
    this.rebuild(parts)
    return true
  }

  clear() {
    this.pick = null
    this.fingerprint = ''
    this.disposeBindings()
  }

  /**
   * 同步 proxy 矩阵；LOD / 网格变化时重建。
   *
   * Syncs proxy matrices; rebuilds when LOD / mesh set changes.
   * @returns whether the outline selection should be refreshed
   */
  update(): boolean {
    if (!this.pick) return false

    const parts = this.resolveParts(this.pick)
    if (!parts || parts.length === 0) {
      this.clear()
      return true
    }

    const nextFingerprint = partsFingerprint(parts)
    if (nextFingerprint !== this.fingerprint) {
      this.rebuild(parts)
      return true
    }

    for (const binding of this.bindings) {
      syncProxyMatrix(binding)
    }
    return false
  }

  dispose() {
    this.clear()
    this.root.parent?.remove(this.root)
    this.proxyMaterial.dispose()
  }

  private rebuild(parts: HismResolvedInstancePart[]) {
    this.disposeBindings()
    this.fingerprint = partsFingerprint(parts)

    for (const part of parts) {
      const proxy = new THREE.Mesh(part.mesh.geometry, this.proxyMaterial)
      proxy.matrixAutoUpdate = false
      proxy.frustumCulled = false
      proxy.userData.telluxPickingIgnore = true
      const binding: ProxyBinding = {
        proxy,
        source: part.mesh,
        instanceId: part.instanceId
      }
      syncProxyMatrix(binding)
      this.bindings.push(binding)
      this.root.add(proxy)
    }
  }

  private disposeBindings() {
    for (const binding of this.bindings) {
      this.root.remove(binding.proxy)
      // geometry 与 HISM InstancedMesh 共享，不 dispose。
    }
    this.bindings.length = 0
  }
}

function syncProxyMatrix(binding: ProxyBinding) {
  binding.source.updateWorldMatrix(true, false)
  getRtcInstanceMatrixAt(binding.source, binding.instanceId, instanceLocalMatrix)
  // parent Group 为单位矩阵：写入 local matrix，避免 scene.updateMatrixWorld 覆盖 matrixWorld。
  // Parent group is identity: write local matrix so scene.updateMatrixWorld does not clobber it.
  binding.proxy.matrix.multiplyMatrices(
    binding.source.matrixWorld,
    instanceLocalMatrix
  )
  binding.proxy.matrixWorld.copy(binding.proxy.matrix)
  binding.proxy.matrixWorldNeedsUpdate = false
}

export { hismPickKey }
