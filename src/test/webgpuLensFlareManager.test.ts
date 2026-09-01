import { describe, expect, it, vi } from 'vitest'

import { WebGPULensFlareManager } from '../rendering/WebGPULensFlareManager'
import type {
  WebGPUPostProcessStage,
  WebGPUPostProcessingStageGraph
} from '../rendering/WebGPUPostProcessingManager'

const { takram } = vi.hoisted(() => ({
  takram: {
    lensFlare: vi.fn()
  }
}))

vi.mock('@takram/three-geospatial/webgpu', () => takram)

describe('WebGPULensFlareManager', () => {
  it('maps Tellux appearance settings, runs before TAA, and releases node resources on disable', () => {
    const input = { name: 'atmosphere-output' }
    const lensFlareNode = {
      bloomIntensity: { value: 0.05 },
      thresholdNode: {
        thresholdLevel: { value: 5 },
        thresholdRange: { value: 1 },
        resolutionScale: 0.5
      },
      featuresNode: { pixelRatio: 0.5 },
      ghostNode: { intensity: { value: 1e-5 } },
      haloNode: { intensity: { value: 1e-5 } },
      glareNode: { intensity: { value: 1e-5 } },
      dispose: vi.fn()
    }
    takram.lensFlare.mockReturnValue(lensFlareNode)

    const stages: WebGPUPostProcessStage[] = []
    const graph = {
      addStage: vi.fn((stage: WebGPUPostProcessStage) => {
        stages.push(stage)
        return () => stage.dispose?.()
      })
    } as unknown as WebGPUPostProcessingStageGraph
    const manager = new WebGPULensFlareManager(graph)

    manager.sync({
      enabled: true,
      intensity: 0.01,
      threshold: { level: 12, range: 2 },
      quality: 'high'
    })

    const stage = stages[0]!
    expect(stage.id).toBe('lens-flare')
    expect(stage.order).toBe(100)
    expect(stage.compose(input as never, {} as never)).toBe(lensFlareNode)
    expect(takram.lensFlare).toHaveBeenCalledWith(input)
    expect(lensFlareNode.bloomIntensity.value).toBe(0.1)
    expect(lensFlareNode.ghostNode.intensity.value).toBe(2e-5)
    expect(lensFlareNode.haloNode.intensity.value).toBe(2e-5)
    expect(lensFlareNode.glareNode.intensity.value).toBe(2e-5)
    expect(lensFlareNode.thresholdNode.thresholdLevel.value).toBe(12)
    expect(lensFlareNode.thresholdNode.thresholdRange.value).toBe(2)
    expect(lensFlareNode.thresholdNode.resolutionScale).toBe(1)
    expect(lensFlareNode.featuresNode.pixelRatio).toBe(1)

    manager.sync({
      enabled: false,
      intensity: 0.01,
      threshold: { level: 12, range: 2 },
      quality: 'high'
    })
    expect(lensFlareNode.dispose).toHaveBeenCalledTimes(1)
  })
})
