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
}

export class ModelManager {
  private readonly models = new Map<string, GltfModelLayer>()
  private nextModelId = 0

  constructor(private readonly options: ModelManagerOptions) {}

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
    void model.load()
    return model
  }

  update(deltaTime: number) {
    this.models.forEach((model) => {
      model.update(deltaTime)
    })
  }

  setMaterialMode(mode: ModelMaterialMode) {
    this.models.forEach((model) => {
      model.setMaterialMode(mode)
    })
  }

  dispose() {
    Array.from(this.models.values()).forEach((model) => {
      model.remove()
    })
    this.models.clear()
    this.syncPostProcessMaterialLights()
  }

  private removeModel(model: GltfModelLayer) {
    this.models.delete(model.id)
    this.options.scene.remove(model.root)
    this.syncPostProcessMaterialLights()
  }

  private syncPostProcessMaterialLights() {
    this.options.setPostProcessMaterialLights(
      Array.from(this.models.values()).some((model) => model.preservesMaterial)
    )
  }

  private createModelId() {
    do {
      this.nextModelId += 1
    } while (this.models.has(`model-${this.nextModelId}`))

    return `model-${this.nextModelId}`
  }
}
