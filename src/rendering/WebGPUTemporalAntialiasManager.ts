import {
  temporalAntialias,
  type TemporalAntialiasNode
} from '@takram/three-geospatial/webgpu'
import type * as THREE from 'three'
import type { TextureNode } from 'three/webgpu'

import type {
  WebGPUPostProcessNode,
  WebGPUPostProcessStageContext,
  WebGPUPostProcessingStageGraph
} from './WebGPUPostProcessingManager'

/**
 * WebGPU 时间抗锯齿阶段。
 *
 * 它只负责 TAA 的历史纹理、尺寸和生命周期；场景渲染、深度和高精度速度 MRT
 * 始终由共享后处理图提供。这样不会让 TAA 与大气或最终输出竞争渲染器所有权。
 *
 * WebGPU temporal anti-aliasing stage.
 *
 * It owns only TAA history, sizing, and lifetime. The shared post-processing
 * graph remains the owner of scene rendering, depth, and high-precision
 * velocity MRT, avoiding renderer ownership conflicts with atmosphere or final
 * output stages.
 */
export class WebGPUTemporalAntialiasManager {
  private removeStage: (() => void) | null = null
  private temporalAntialiasNode: TemporalAntialiasNode | null = null
  private width = 0
  private height = 0
  private pixelRatio = 1

  constructor(
    private readonly postProcessing: WebGPUPostProcessingStageGraph,
    private readonly camera: THREE.PerspectiveCamera
  ) {}

  /** 是否启用 TAA 阶段。Whether the TAA stage is enabled. */
  get enabled() {
    return this.removeStage !== null
  }

  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return

    if (!enabled) {
      const removeStage = this.removeStage
      this.removeStage = null
      removeStage?.()
      this.disposeTemporalAntialiasNode()
      return
    }

    this.removeStage = this.postProcessing.addStage({
      id: 'temporal-antialias',
      order: 200,
      sceneAttachments: ['velocity'],
      compose: (input, context) => this.compose(input, context),
      setSize: (width, height, pixelRatio) => this.setSize(width, height, pixelRatio),
      dispose: () => this.disposeTemporalAntialiasNode()
    })
  }

  setSize(width: number, height: number, pixelRatio: number) {
    this.width = width
    this.height = height
    this.pixelRatio = pixelRatio
    this.syncNodeSize()
  }

  dispose() {
    this.setEnabled(false)
  }

  private compose(
    input: WebGPUPostProcessNode,
    context: WebGPUPostProcessStageContext
  ): WebGPUPostProcessNode {
    this.disposeTemporalAntialiasNode()
    this.temporalAntialiasNode = temporalAntialias(
      input,
      context.scenePass.getTextureNode('depth') as TextureNode,
      context.scenePass.getTextureNode('velocity') as TextureNode,
      this.camera
    )
    this.syncNodeSize()
    return this.temporalAntialiasNode as unknown as WebGPUPostProcessNode
  }

  private syncNodeSize() {
    if (!this.temporalAntialiasNode || this.width <= 0 || this.height <= 0) return

    this.temporalAntialiasNode.setSize(
      Math.max(1, Math.round(this.width * this.pixelRatio)),
      Math.max(1, Math.round(this.height * this.pixelRatio))
    )
  }

  private disposeTemporalAntialiasNode() {
    this.temporalAntialiasNode?.dispose()
    this.temporalAntialiasNode = null
  }
}
