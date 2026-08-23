import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { WebGPUTemporalAntialiasManager } from '../rendering/WebGPUTemporalAntialiasManager'
import type {
  WebGPUPostProcessStage,
  WebGPUPostProcessingStageGraph
} from '../rendering/WebGPUPostProcessingManager'

const { takram } = vi.hoisted(() => ({
  takram: {
    temporalAntialias: vi.fn()
  }
}))

vi.mock('@takram/three-geospatial/webgpu', () => takram)

describe('WebGPUTemporalAntialiasManager', () => {
  it('requests high-precision velocity, tracks drawing-buffer size, and releases history on disable', () => {
    const input = { name: 'atmosphere-output' }
    const depth = { name: 'depth' }
    const velocity = { name: 'highp-velocity' }
    const taaNode = {
      setSize: vi.fn(),
      dispose: vi.fn()
    }
    takram.temporalAntialias.mockReturnValue(taaNode)

    const stages: WebGPUPostProcessStage[] = []
    const graph = {
      addStage: vi.fn((stage: WebGPUPostProcessStage) => {
        stages.push(stage)
        return () => stage.dispose?.()
      })
    } as unknown as WebGPUPostProcessingStageGraph
    const camera = new THREE.PerspectiveCamera()
    const manager = new WebGPUTemporalAntialiasManager(graph, camera)

    manager.setEnabled(true)

    const stage = stages[0]!
    expect(stage.id).toBe('temporal-antialias')
    expect(stage.sceneAttachments).toEqual(['velocity'])
    expect(stage.compose(input as never, {
      camera,
      scenePass: {
        getTextureNode: vi.fn((name: string) => name === 'depth' ? depth : velocity)
      } as never
    })).toBe(taaNode)
    expect(takram.temporalAntialias).toHaveBeenCalledWith(input, depth, velocity, camera)

    manager.setSize(800, 600, 2)
    expect(taaNode.setSize).toHaveBeenCalledWith(1600, 1200)

    manager.setEnabled(false)
    expect(taaNode.dispose).toHaveBeenCalledTimes(1)
  })
})
