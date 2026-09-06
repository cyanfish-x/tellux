import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { AddModelOptions, ModelLayer } from '../types'
import { GltfModelLayer, type ModelMaterialMode } from './GltfModelLayer'

export interface ModelManagerOptions {
  scene: THREE.Scene
  loader: GLTFLoader
  getMaterialMode: () => ModelMaterialMode
  applyModelMatrix: (options: AddModelOptions, target: THREE.Matrix4) => void
  setPostProcessMaterialLights: (enabled: boolean) => void
  setHasLocalLighting: (enabled: boolean) => void
}

export let createModelManager: (options: ModelManagerOptions) => ModelManager
const runtime = new WeakMap<ModelManager, {
  update: (deltaTime: number) => void
  setMaterialMode: (mode: ModelMaterialMode) => void
  dispose: () => void
}>()
export function updateModelManager(manager: ModelManager, deltaTime: number) {
  runtime.get(manager)?.update(deltaTime)
}
export function setModelManagerMaterialMode(manager: ModelManager, mode: ModelMaterialMode) {
  runtime.get(manager)?.setMaterialMode(mode)
}
export function disposeModelManager(manager: ModelManager) {
  runtime.get(manager)?.dispose()
}

/**
 * glTF 模型集合。通过 {@link Viewer.models} 访问。
 *
 * glTF model collection. Access this through {@link Viewer.models}.
 */
export class ModelManager {
  static {
    createModelManager = options => new ModelManager(options)
  }

  private readonly models = new Map<string, GltfModelLayer>()
  private nextModelId = 0

  private constructor(private readonly options: ModelManagerOptions) {
    runtime.set(this, {
      update: deltaTime => this.#update(deltaTime),
      setMaterialMode: mode => this.#setMaterialMode(mode),
      dispose: () => this.#dispose()
    })
  }

  /**
   * 加载 glTF / GLB 模型并按经纬高加入场景。
   *
   * Loads a glTF / GLB model and adds it to the scene at cartographic coordinates.
   */
  add(options: AddModelOptions): ModelLayer {
    if (options.type !== 'gltf') {
      throw new Error(`Viewer: unsupported model type "${String(options.type)}".`)
    }

    const id = options.id ?? this.createModelId()
    if (this.models.has(id)) {
      throw new Error(`Viewer: model "${id}" already exists.`)
    }

    const model = new GltfModelLayer(
      id,
      options,
      this.options.loader,
      this.options.getMaterialMode(),
      (model) => this.removeModel(model)
    )
    this.options.applyModelMatrix(options, model.root.matrix)
    model.root.matrixWorldNeedsUpdate = true
    this.models.set(id, model)
    this.options.scene.add(model.root)
    this.syncPostProcessMaterialLights()
    this.syncLocalLighting()
    void model.load()
    return model
  }

  /**
   * 根据 id 获取已加载的模型。
   *
   * Gets a loaded model by id.
   */
  get(id: string): ModelLayer | null {
    return this.models.get(id) ?? null
  }

  /**
   * 列出全部已加载的模型。
   *
   * Lists all loaded models.
   */
  list(): ModelLayer[] {
    return Array.from(this.models.values())
  }

  /**
   * 根据 id 移除已加载的模型。
   *
   * Removes a loaded model by id.
   */
  remove(id: string): boolean {
    const model = this.models.get(id)
    if (!model) return false
    model.remove()
    return true
  }

  #update(deltaTime: number) {
    this.models.forEach((model) => {
      model.update(deltaTime)
    })
  }

  #setMaterialMode(mode: ModelMaterialMode) {
    this.models.forEach((model) => {
      model.setMaterialMode(mode)
    })
  }

  #dispose() {
    Array.from(this.models.values()).forEach((model) => {
      model.remove()
    })
    this.models.clear()
    this.syncPostProcessMaterialLights()
    this.syncLocalLighting()
  }

  private removeModel(model: GltfModelLayer) {
    this.models.delete(model.id)
    this.options.scene.remove(model.root)
    this.syncPostProcessMaterialLights()
    this.syncLocalLighting()
  }

  private syncPostProcessMaterialLights() {
    this.options.setPostProcessMaterialLights(
      Array.from(this.models.values()).some((model) => model.preservesMaterial)
    )
  }

  private syncLocalLighting() {
    this.options.setHasLocalLighting(
      Array.from(this.models.values()).some((model) => model.lighting === 'local')
    )
  }

  private createModelId() {
    do {
      this.nextModelId += 1
    } while (this.models.has(`model-${this.nextModelId}`))

    return `model-${this.nextModelId}`
  }
}
