import * as THREE from 'three'
import { highpVelocity } from '@takram/three-geospatial/webgpu'
import { mrt, normalView, output, pass } from 'three/tsl'
import { RenderPipeline, type Node } from 'three/webgpu'

import type { TelluxRendererAdapter, TelluxWebGPURenderer } from './RendererAdapter'

export type WebGPUPostProcessNode = Node
export type WebGPUPostProcessScenePass = ReturnType<typeof pass>
export type WebGPUSceneAttachment = 'normal' | 'velocity'

/**
 * WebGPU 后处理阶段的内部契约。
 *
 * 每个阶段接收前一阶段的颜色节点，并返回新的颜色节点；场景颜色和深度仍统一从
 * `scenePass` 获取，避免效果各自创建渲染 pass。阶段按需声明法线或速度附件，
 * 并由图统一配置 MRT、转发尺寸和释放阶段专用资源。
 *
 * Internal contract for a WebGPU post-processing stage. Each stage receives
 * the previous color node and returns the next one. Scene color and depth stay
 * owned by the shared `scenePass`; the graph configures requested MRT attachments,
 * propagates viewport changes and disposes registered stages.
 */
export interface WebGPUPostProcessStage {
  readonly id: string
  /**
   * 阶段执行顺序，数值越小越靠前；未指定时为 `0`。
   *
   * Stage execution order. Lower values run first; unspecified is `0`.
   */
  readonly order?: number
  readonly sceneAttachments?: readonly WebGPUSceneAttachment[]
  compose(input: WebGPUPostProcessNode, context: WebGPUPostProcessStageContext): WebGPUPostProcessNode
  setSize?(width: number, height: number, pixelRatio: number): void
  dispose?(): void
}

export interface WebGPUPostProcessStageContext {
  readonly scenePass: WebGPUPostProcessScenePass
  readonly camera: THREE.PerspectiveCamera
}

export interface WebGPUPostProcessingGraph {
  readonly scenePass: WebGPUPostProcessScenePass
  setSceneCompositor(node: WebGPUPostProcessNode | null): void
  invalidate(): void
}

/**
 * 可注册后处理阶段的 WebGPU 图内部契约。
 *
 * Internal WebGPU graph contract that accepts post-processing stages.
 */
export interface WebGPUPostProcessingStageGraph extends WebGPUPostProcessingGraph {
  addStage(stage: WebGPUPostProcessStage): () => void
}

/**
 * WebGPU 后处理图的组合根。
 *
 * 它是唯一设置 renderer delegate 和持有 `RenderPipeline` 的对象。大气、描边等
 * 子系统只提供节点，不能各自接管渲染循环。
 *
 * Composition root for the WebGPU post-processing graph. It exclusively owns
 * the renderer delegate and RenderPipeline; features contribute nodes only.
 */
export class WebGPUPostProcessingManager implements WebGPUPostProcessingStageGraph {
  readonly scenePass: WebGPUPostProcessScenePass

  private readonly renderPipeline: RenderPipeline
  private readonly stages = new Map<string, WebGPUPostProcessStage>()
  private sceneCompositor: WebGPUPostProcessNode | null = null
  private width = 0
  private height = 0
  private pixelRatio = 1
  private isDisposed = false

  constructor(
    private readonly rendererAdapter: TelluxRendererAdapter,
    private readonly renderer: TelluxWebGPURenderer,
    threeScene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera
  ) {
    this.scenePass = pass(threeScene, camera)
    this.renderPipeline = new RenderPipeline(renderer, this.scenePass as unknown as WebGPUPostProcessNode)
    this.rendererAdapter.setRenderDelegate(() => this.render())
  }

  setSceneCompositor(node: WebGPUPostProcessNode | null) {
    if (this.isDisposed || this.sceneCompositor === node) return

    this.sceneCompositor = node
    this.rebuildGraph()
  }

  addStage(stage: WebGPUPostProcessStage) {
    if (this.isDisposed) {
      throw new Error('Cannot add a WebGPU post-processing stage after disposal.')
    }
    if (!stage.id) {
      throw new Error('WebGPU post-processing stage id must not be empty.')
    }
    if (this.stages.has(stage.id)) {
      throw new Error(`WebGPU post-processing stage "${stage.id}" is already registered.`)
    }

    this.validateSceneAttachments(stage)
    this.stages.set(stage.id, stage)
    this.syncSceneAttachments()
    this.syncStageSize(stage)
    this.rebuildGraph()

    let removed = false
    return () => {
      if (removed || this.isDisposed || this.stages.get(stage.id) !== stage) return
      removed = true
      this.stages.delete(stage.id)
      stage.dispose?.()
      this.syncSceneAttachments()
      this.rebuildGraph()
    }
  }

  setSize(width: number, height: number) {
    if (this.isDisposed) return

    const pixelRatio = this.renderer.getPixelRatio()
    if (this.width === width && this.height === height && this.pixelRatio === pixelRatio) return

    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    for (const stage of this.stages.values()) {
      this.syncStageSize(stage)
    }
  }

  invalidate() {
    if (this.isDisposed) return
    this.renderPipeline.needsUpdate = true
  }

  dispose() {
    if (this.isDisposed) return

    this.isDisposed = true
    this.rendererAdapter.setRenderDelegate(null)
    for (const stage of this.stages.values()) {
      stage.dispose?.()
    }
    this.stages.clear()
    this.sceneCompositor = null
    this.renderPipeline.dispose()
    this.scenePass.dispose()
  }

  private render() {
    this.renderPipeline.render()
  }

  private rebuildGraph() {
    if (this.isDisposed) return

    let output = this.sceneCompositor ?? (this.scenePass as unknown as WebGPUPostProcessNode)
    const context: WebGPUPostProcessStageContext = {
      scenePass: this.scenePass,
      camera: this.camera
    }
    for (const stage of this.getOrderedStages()) {
      output = stage.compose(output, context)
    }

    this.renderPipeline.outputNode = output
    this.renderPipeline.needsUpdate = true
  }

  private syncSceneAttachments() {
    const attachments = new Set<WebGPUSceneAttachment>()
    for (const stage of this.stages.values()) {
      for (const attachment of stage.sceneAttachments ?? []) {
        attachments.add(attachment)
      }
    }

    this.scenePass.setMRT(attachments.size === 0 ? null : mrt({
      output,
      ...(attachments.has('normal') ? { normal: normalView } : {}),
      // takram 0.9.1 is runtime-compatible with Three r184, but its Node
      // declaration still uses the pre-r184 update signature.
      ...(attachments.has('velocity') ? { velocity: highpVelocity as unknown as Node } : {})
    }))
  }

  private syncStageSize(stage: WebGPUPostProcessStage) {
    if (!stage.setSize || this.width === 0 || this.height === 0) return
    stage.setSize(this.width, this.height, this.pixelRatio)
  }

  private getOrderedStages() {
    return [...this.stages.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }

  private validateSceneAttachments(stage: WebGPUPostProcessStage) {
    for (const attachment of stage.sceneAttachments ?? []) {
      if (attachment !== 'normal' && attachment !== 'velocity') {
        throw new Error(`Unsupported WebGPU scene attachment "${attachment}".`)
      }
    }
  }
}
