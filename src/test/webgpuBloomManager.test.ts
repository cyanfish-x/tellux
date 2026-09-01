import { describe, expect, it, vi } from 'vitest'

import { WebGPUBloomManager } from '../rendering/WebGPUBloomManager'
import type {
  WebGPUPostProcessStage,
  WebGPUPostProcessingStageGraph
} from '../rendering/WebGPUPostProcessingManager'

const { threeBloom } = vi.hoisted(() => ({
  threeBloom: vi.fn()
}))

vi.mock('three/addons/tsl/display/BloomNode.js', () => ({ bloom: threeBloom }))

describe('WebGPUBloomManager', () => {
  it('composes bloom before lens flare and updates uniforms without rebuilding', () => {
    const bloomNode = {
      strength: { value: 1 },
      threshold: { value: 1 },
      smoothWidth: { value: 0.03 },
      radius: { value: 0.85 },
      dispose: vi.fn()
    }
    threeBloom.mockReturnValue(bloomNode)

    const stages: WebGPUPostProcessStage[] = []
    const graph = {
      addStage: vi.fn((stage: WebGPUPostProcessStage) => {
        stages.push(stage)
        return () => stage.dispose?.()
      })
    } as unknown as WebGPUPostProcessingStageGraph
    const manager = new WebGPUBloomManager(graph)

    manager.sync({
      enabled: true,
      intensity: 1.2,
      luminanceThreshold: 0.7,
      luminanceSmoothing: 0.1,
      radius: 0.6
    })

    const input = { add: vi.fn(() => ({ name: 'bloom-composite' })) }
    const stage = stages[0]!
    expect(stage.id).toBe('bloom')
    expect(stage.order).toBe(90)
    expect(stage.compose(input as never, {} as never)).toEqual({ name: 'bloom-composite' })
    expect(threeBloom).toHaveBeenCalledWith(input)
    expect(input.add).toHaveBeenCalledWith(bloomNode)
    expect(bloomNode.strength.value).toBe(1.2)
    expect(bloomNode.threshold.value).toBe(0.7)
    expect(bloomNode.smoothWidth.value).toBe(0.1)
    expect(bloomNode.radius.value).toBe(0.6)

    manager.sync({
      enabled: true,
      intensity: 2,
      luminanceThreshold: 1.1,
      luminanceSmoothing: 0.2,
      radius: 0.9
    })
    expect(graph.addStage).toHaveBeenCalledTimes(1)
    expect(bloomNode.strength.value).toBe(2)
    expect(bloomNode.threshold.value).toBe(1.1)

    manager.sync({
      enabled: false,
      intensity: 2,
      luminanceThreshold: 1.1,
      luminanceSmoothing: 0.2,
      radius: 0.9
    })
    expect(bloomNode.dispose).toHaveBeenCalledTimes(1)
  })
})
