import { lensFlare, type LensFlareNode } from '@takram/three-geospatial/webgpu'

import { applyWebGPULensFlareAppearanceState } from './lensFlareAppearance'
import type {
  WebGPUPostProcessNode,
  WebGPUPostProcessStageContext,
  WebGPUPostProcessingStageGraph
} from './WebGPUPostProcessingManager'
import type { LensFlareQuality } from '../types'

const LENS_FLARE_STAGE_ORDER = 100

interface WebGPULensFlareSettings {
  enabled: boolean
  intensity: number
  threshold: {
    level: number
    range: number
  }
  quality: LensFlareQuality
}

/**
 * WebGPU 镜头光晕阶段。
 *
 * 复用 Takram `LensFlareNode` 的 HDR 亮部提取、模糊和特征合成，并将它注册为
 * TAA 之前的有序阶段。该管理器只持有 LensFlare 专属中间资源，场景渲染和最终
 * 输出仍由共享后处理图统一负责。
 *
 * WebGPU lens flare stage.
 *
 * It reuses Takram `LensFlareNode` for HDR thresholding, blur, and feature
 * compositing, registering it as an ordered stage before TAA. It owns only
 * LensFlare-specific intermediate resources; shared graph ownership remains
 * responsible for scene rendering and final output.
 */
export class WebGPULensFlareManager {
  private removeStage: (() => void) | null = null
  private lensFlareNode: LensFlareNode | null = null
  private settings: WebGPULensFlareSettings | null = null

  constructor(private readonly postProcessing: WebGPUPostProcessingStageGraph) {}

  sync(settings: WebGPULensFlareSettings) {
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
      this.disposeLensFlareNode()
      return
    }

    this.removeStage = this.postProcessing.addStage({
      id: 'lens-flare',
      order: LENS_FLARE_STAGE_ORDER,
      compose: (input, context) => this.compose(input, context),
      dispose: () => this.disposeLensFlareNode()
    })
  }

  private compose(
    input: WebGPUPostProcessNode,
    _context: WebGPUPostProcessStageContext
  ): WebGPUPostProcessNode {
    this.disposeLensFlareNode()
    this.lensFlareNode = lensFlare(input)
    this.applyAppearance()
    return this.lensFlareNode as unknown as WebGPUPostProcessNode
  }

  private applyAppearance() {
    if (!this.lensFlareNode || !this.settings) return
    applyWebGPULensFlareAppearanceState(this.lensFlareNode, this.settings)
  }

  private disposeLensFlareNode() {
    this.lensFlareNode?.dispose()
    this.lensFlareNode = null
  }
}
