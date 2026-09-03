import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { AddModelOptions, GltfModelLightingMode, ModelLayer } from '../types'
import { applyMaterialModeToObject, type RenderMaterialMode } from '../materials/materialMode'
import { setObjectLocalLighting } from '../rendering/localLighting'
import { resolveGltfModelLighting, shouldPreserveGltfModelMaterial } from './resolveGltfModelLighting'
import { disposeObject } from './disposeObject'

export type ModelMaterialMode = RenderMaterialMode

export class GltfModelLayer implements ModelLayer {
  readonly root = new THREE.Group()
  readonly animations: THREE.AnimationClip[] = []
  readonly ready: Promise<ModelLayer>
  private currentModel: THREE.Object3D | null = null
  private currentMixer: THREE.AnimationMixer | null = null
  private currentAction: THREE.AnimationAction | null = null
  private currentAnimationChannel: number
  private isRemoved = false
  private readyState: 'pending' | 'resolved' | 'rejected' = 'pending'
  private resolveReady!: (layer: ModelLayer) => void
  private rejectReady!: (reason?: unknown) => void
  readonly lighting: GltfModelLightingMode

  constructor(
    readonly id: string,
    private readonly options: AddModelOptions,
    private readonly loader: GLTFLoader,
    private currentMaterialMode: ModelMaterialMode,
    private readonly removeLayer: (layer: GltfModelLayer) => void
  ) {
    this.root.name = id
    this.root.visible = options.visible ?? true
    this.root.matrixAutoUpdate = false
    this.lighting = resolveGltfModelLighting(options)
    setObjectLocalLighting(this.root, this.lighting === 'local')
    this.currentAnimationChannel = options.animationChannel ?? 0
    this.ready = new Promise<ModelLayer>((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    void this.ready.catch(() => undefined)
  }

  get model() {
    return this.currentModel
  }

  get preservesMaterial() {
    return this.shouldPreserveMaterial()
  }

  get show() {
    return this.root.visible
  }

  set show(value: boolean) {
    this.root.visible = value
  }

  async load() {
    try {
      const gltf = await this.loader.loadAsync(this.options.url)
      if (this.isRemoved) {
        disposeObject(gltf.scene)
        this.rejectReadyLayer(this.createRemovedBeforeLoadError())
        return
      }

      const model = gltf.scene
      this.applyModelTransform(model)
      this.applyMaterialMode(model)
      setObjectLocalLighting(model, this.lighting === 'local')
      this.root.add(model)
      this.currentModel = model
      this.animations.splice(0, this.animations.length, ...gltf.animations)

      if (gltf.animations.length > 0) {
        this.currentMixer = new THREE.AnimationMixer(model)
        if (this.options.animate) {
          this.playAnimation(this.currentAnimationChannel)
        }
      }

      this.resolveReadyLayer()
    } catch (error) {
      if (!this.isRemoved) {
        this.removeLayer(this)
      }
      this.rejectReadyLayer(error)
    }
  }

  update(deltaTime: number) {
    if (!this.isRemoved) {
      this.currentMixer?.update(deltaTime)
    }
  }

  playAnimation(animationChannel = this.currentAnimationChannel) {
    if (!this.currentMixer || !this.currentModel) return false

    const clip = this.animations[animationChannel]
    if (!clip) return false

    if (this.currentAction && animationChannel === this.currentAnimationChannel && this.currentAction.paused) {
      this.currentAction.paused = false
      this.currentAction.enabled = true
      this.currentAction.play()
      return true
    }

    this.currentAnimationChannel = animationChannel
    this.currentAction?.stop()
    this.currentAction = this.currentMixer.clipAction(clip)
    this.currentAction.paused = false
    this.currentAction.reset().play()
    return true
  }

  pauseAnimation() {
    if (!this.currentAction) return false

    this.currentAction.paused = true
    return true
  }

  stopAnimation() {
    this.currentAction?.stop()
    this.currentAction = null
  }

  setMaterialMode(mode: ModelMaterialMode) {
    if (this.currentMaterialMode === mode) return

    this.currentMaterialMode = mode
    if (this.shouldPreserveMaterial()) return

    if (this.currentModel) {
      this.applyMaterialMode(this.currentModel)
    }
  }

  remove() {
    if (this.isRemoved) return

    this.isRemoved = true
    this.rejectReadyLayer(this.createRemovedBeforeLoadError())
    this.stopAnimation()
    this.currentMixer?.stopAllAction()
    this.currentMixer = null
    this.removeLayer(this)
    disposeObject(this.root)
  }

  private applyModelTransform(model: THREE.Object3D) {
    const { scale } = this.options
    if (Array.isArray(scale)) {
      model.scale.set(scale[0], scale[1], scale[2])
    } else if (scale !== undefined) {
      model.scale.setScalar(scale)
    }

    if (this.options.alignToGround) {
      const box = new THREE.Box3().setFromObject(model)
      if (!box.isEmpty()) {
        model.position.y -= box.min.y
      }
    }
  }

  private applyMaterialMode(model: THREE.Object3D) {
    if (this.shouldPreserveMaterial()) return

    applyMaterialModeToObject(model, this.currentMaterialMode)
  }

  private shouldPreserveMaterial() {
    return shouldPreserveGltfModelMaterial(this.options)
  }

  private resolveReadyLayer() {
    if (this.readyState !== 'pending') return

    this.readyState = 'resolved'
    this.resolveReady(this)
  }

  private rejectReadyLayer(reason: unknown) {
    if (this.readyState !== 'pending') return

    this.readyState = 'rejected'
    this.rejectReady(reason)
  }

  private createRemovedBeforeLoadError() {
    return new Error(`Viewer: model "${this.id}" was removed before it finished loading.`)
  }
}
