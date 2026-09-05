import * as THREE from 'three'
import { RTCAutoUniforms } from '../../rendering/RTCAutoUniforms'
import type {
  AddHismLayerOptions,
  HismApplyInstanceMatrix,
  HismLayer,
  HismPickResult,
  HismRuntimeStats
} from '../../types/hism'
import { HismLayerImpl } from './HismLayer'
import { HismPickMarker } from '../picking/HismPickMarker'
import { pickAllHismLayers, pickHismLayers } from '../picking/HismPicker'
import { collectHismRuntimeStats } from '../runtime/HismRuntimeStats'

export interface HismManagerOptions {
  scene: THREE.Scene
  camera: THREE.Camera
  domElement: HTMLElement
  applyInstanceMatrix: HismApplyInstanceMatrix
  /**
   * 拾取时是否显示黄色命中点标记，默认 `true`。运行时可改 {@link HismManager.showPickMarker}。
   *
   * Whether to show the yellow pick-point marker. Defaults to `true`.
   * Toggle at runtime via {@link HismManager.showPickMarker}.
   */
  showPickMarker?: boolean
}

export class HismManager {
  private readonly layers = new Map<string, HismLayerImpl>()
  readonly rtcUniforms: RTCAutoUniforms
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private pickMarker: HismPickMarker | null
  private pickMarkerEnabled: boolean
  private nextLayerId = 0

  constructor(private readonly options: HismManagerOptions) {
    this.rtcUniforms = new RTCAutoUniforms(
      options.camera as THREE.PerspectiveCamera
    )
    this.pickMarkerEnabled = options.showPickMarker !== false
    this.pickMarker = null
    if (this.pickMarkerEnabled) {
      this.ensurePickMarker()
    }
  }

  /**
   * 拾取时是否显示黄色命中点标记。与初始化 {@link ViewerOptions.hism}`.showPickMarker` 同构。
   *
   * Whether to show the yellow pick-point marker. Isomorphic with
   * {@link ViewerOptions.hism}`.showPickMarker`.
   */
  get showPickMarker() {
    return this.pickMarkerEnabled
  }

  set showPickMarker(value: boolean) {
    if (this.pickMarkerEnabled === value) return
    this.pickMarkerEnabled = value
    if (value) {
      this.ensurePickMarker()
      return
    }
    this.pickMarker?.dispose()
    this.pickMarker = null
  }

  /**
   * 添加 HISM 实例化图层。
   *
   * Adds a HISM instanced layer.
   */
  add(options: AddHismLayerOptions): HismLayer {
    const id = options.id ?? this.createLayerId()
    if (this.layers.has(id)) {
      throw new Error(`Viewer: HISM layer "${id}" already exists.`)
    }

    const layer = new HismLayerImpl({
      ...options,
      id,
      rtcUniforms: this.rtcUniforms,
      applyInstanceMatrix: this.options.applyInstanceMatrix,
      onRemove: (removedLayer) => {
        this.layers.delete(removedLayer.id)
      }
    })

    this.layers.set(id, layer)
    this.options.scene.add(layer.root)
    return layer
  }

  /**
   * 根据 id 获取 HISM 图层。
   *
   * Gets a HISM layer by id.
   */
  get(id: string) {
    return this.layers.get(id) ?? null
  }

  /**
   * 列出全部 HISM 图层。
   *
   * Lists all HISM layers.
   */
  list(): HismLayer[] {
    return Array.from(this.layers.values())
  }

  /**
   * 根据 id 移除 HISM 图层。
   *
   * Removes a HISM layer by id.
   */
  remove(id: string): boolean {
    const layer = this.layers.get(id)
    if (!layer) return false
    layer.remove()
    return true
  }

  pick(screenPosition: { x: number; y: number }): HismPickResult | null {
    if (!this.setPickRay(screenPosition)) return null

    const result = pickHismLayers({
      layers: this.layers.values(),
      raycaster: this.raycaster
    })

    return result
  }

  /** 拾取全部 HISM 实例并按距离排序。Picks all HISM instances nearest-first. */
  pickAll(screenPosition: { x: number; y: number }): HismPickResult[] {
    if (!this.setPickRay(screenPosition)) return []
    return pickAllHismLayers({
      layers: this.layers.values(),
      raycaster: this.raycaster
    })
  }

  /**
   * 按拾取结果解析当前 active LOD 下该实例的全部 mesh parts。
   *
   * Resolves all mesh parts for the picked instance at the active LOD.
   */
  resolveInstanceParts(
    pick: HismPickResult
  ): Array<{ mesh: THREE.InstancedMesh; instanceId: number }> | null {
    const layer = this.layers.get(pick.layerId)
    if (!layer) return null
    return layer.resolveInstanceParts(pick)
  }

  /** 隐藏拾取标记。Hides the pick marker. */
  hidePickMarker() {
    this.pickMarker?.hide()
  }

  /**
   * 获取 HISM 运行时统计。
   *
   * Gets HISM runtime statistics.
   */
  getRuntimeStats(): HismRuntimeStats {
    return collectHismRuntimeStats(this.layers.values())
  }

  update(deltaTime: number) {
    this.pickMarker?.update(deltaTime)
    for (const layer of this.layers.values()) {
      layer.update(deltaTime, this.options.camera)
    }
  }

  dispose() {
    this.pickMarker?.dispose()
    Array.from(this.layers.values()).forEach((layer) => {
      layer.remove()
    })
    this.layers.clear()
  }

  private ensurePickMarker() {
    if (this.pickMarker) return
    this.pickMarker = new HismPickMarker()
    this.options.scene.add(this.pickMarker.object)
  }

  private setPickRay(screenPosition: { x: number; y: number }) {
    const width = this.options.domElement.clientWidth
    const height = this.options.domElement.clientHeight
    if (!width || !height) return false

    this.pointer.x = (screenPosition.x / width) * 2 - 1
    this.pointer.y = -(screenPosition.y / height) * 2 + 1
    this.raycaster.setFromCamera(
      this.pointer,
      this.options.camera as THREE.PerspectiveCamera
    )
    return true
  }

  private createLayerId() {
    do {
      this.nextLayerId += 1
    } while (this.layers.has(`hism-${this.nextLayerId}`))

    return `hism-${this.nextLayerId}`
  }
}
