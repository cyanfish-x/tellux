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
import { pickHismLayers } from '../picking/HismPicker'
import { collectHismRuntimeStats } from '../runtime/HismRuntimeStats'

export interface HismManagerOptions {
  scene: THREE.Scene
  camera: THREE.Camera
  domElement: HTMLElement
  applyInstanceMatrix: HismApplyInstanceMatrix
  /** 是否启用拾取标记，默认 `true`。Whether to show a pick marker. Defaults to `true`. */
  showPickMarker?: boolean
}

export class HismManager {
  private readonly layers = new Map<string, HismLayerImpl>()
  readonly rtcUniforms: RTCAutoUniforms
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly pickMarker: HismPickMarker | null
  private nextLayerId = 0

  constructor(private readonly options: HismManagerOptions) {
    this.rtcUniforms = new RTCAutoUniforms(
      options.camera as THREE.PerspectiveCamera
    )
    if (options.showPickMarker !== false) {
      this.pickMarker = new HismPickMarker()
      options.scene.add(this.pickMarker.object)
    } else {
      this.pickMarker = null
    }
  }

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

  get(id: string) {
    return this.layers.get(id) ?? null
  }

  list(): HismLayer[] {
    return Array.from(this.layers.values())
  }

  remove(id: string): boolean {
    const layer = this.layers.get(id)
    if (!layer) return false
    layer.remove()
    return true
  }

  pick(screenPosition: { x: number; y: number }): HismPickResult | null {
    const width = this.options.domElement.clientWidth
    const height = this.options.domElement.clientHeight
    if (!width || !height) return null

    this.pointer.x = (screenPosition.x / width) * 2 - 1
    this.pointer.y = -(screenPosition.y / height) * 2 + 1
    this.raycaster.setFromCamera(
      this.pointer,
      this.options.camera as THREE.PerspectiveCamera
    )

    const result = pickHismLayers({
      layers: this.layers.values(),
      raycaster: this.raycaster
    })

    if (result) {
      this.pickMarker?.show(result.point)
    } else {
      this.pickMarker?.hide()
    }

    return result
  }

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

  private createLayerId() {
    do {
      this.nextLayerId += 1
    } while (this.layers.has(`hism-${this.nextLayerId}`))

    return `hism-${this.nextLayerId}`
  }
}
