import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import type BloomNode from 'three/addons/tsl/display/BloomNode.js'

import {
  applyWebGPUBloomAppearanceState,
  type BloomAppearanceState
} from './bloomAppearance'
import type {
  WebGPUPostProcessNode,
  WebGPUPostProcessStageContext,
  WebGPUPostProcessingStageGraph
} from './WebGPUPostProcessingManager'

const BLOOM_STAGE_ORDER = 90

type AdditivePostProcessNode = WebGPUPostProcessNode & {
  add(node: WebGPUPostProcessNode): WebGPUPostProcessNode
}

/**
 * WebGPU Bloom 后处理阶段。
 *
 * WebGPU bloom post-processing stage.
 */
export class WebGPUBloomManager {
  private removeStage: (() => void) | null = null
  private bloomNode: BloomNode | null = null
  private settings: BloomAppearanceState | null = null

  constructor(private readonly postProcessing: WebGPUPostProcessingStageGraph) {}

  sync(settings: BloomAppearanceState) {
    this.settings = settings
    if (!settings.enabled) {
      this.setEnabled(false)
      return
    }

    this.setEnabled(true)
    this.applyAppearance()
  }

  dispose() {
    this.setEnabled(false)
  }

  private setEnabled(enabled: boolean) {
    if (enabled === (this.removeStage !== null)) return

    if (!enabled) {
      const removeStage = this.removeStage
      this.removeStage = null
      removeStage?.()
      this.disposeBloomNode()
      return
    }

    this.removeStage = this.postProcessing.addStage({
      id: 'bloom',
      order: BLOOM_STAGE_ORDER,
      compose: (input, context) => this.compose(input, context),
      dispose: () => this.disposeBloomNode()
    })
  }

  private compose(
    input: WebGPUPostProcessNode,
    _context: WebGPUPostProcessStageContext
  ) {
    this.disposeBloomNode()
    this.bloomNode = bloom(input)
    this.applyAppearance()
    return (input as AdditivePostProcessNode).add(
      this.bloomNode as unknown as WebGPUPostProcessNode
    )
  }

  private applyAppearance() {
    if (!this.bloomNode || !this.settings) return
    applyWebGPUBloomAppearanceState(this.bloomNode, this.settings)
  }

  private disposeBloomNode() {
    this.bloomNode?.dispose()
    this.bloomNode = null
  }
}
