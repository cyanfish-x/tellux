import * as THREE from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WebGPUPostProcessingManager,
  type WebGPUPostProcessStage
} from '../rendering/WebGPUPostProcessingManager'
import type { TelluxRendererAdapter, TelluxWebGPURenderer } from '../rendering/RendererAdapter'

const { renderPipelineInstances, scenePasses, takram, tsl } = vi.hoisted(() => ({
  renderPipelineInstances: [] as Array<{
    outputNode: unknown
    needsUpdate: boolean
    render: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>,
  scenePasses: [] as Array<{
    contextNode: unknown
    dispose: ReturnType<typeof vi.fn>
    getTextureNode: ReturnType<typeof vi.fn>
    setMRT: ReturnType<typeof vi.fn>
  }>,
  tsl: {
    mrt: vi.fn((outputs: Record<string, unknown>) => ({ outputs })),
    normalView: { name: 'normal-view' },
    output: { name: 'output' },
    velocity: { name: 'velocity' }
  },
  takram: {
    highpVelocity: { name: 'highp-velocity' }
  }
}))

vi.mock('three/webgpu', async () => {
  const three = await vi.importActual<typeof import('three')>('three')
  return {
    ...three,
    RenderPipeline: class {
      needsUpdate = true
      render = vi.fn()
      dispose = vi.fn()

      constructor(
        readonly renderer: unknown,
        readonly outputNode: unknown
      ) {
        renderPipelineInstances.push(this)
      }
    }
  }
})

vi.mock('three/tsl', () => ({
  ...tsl,
  pass: vi.fn(() => {
    const scenePass = {
      contextNode: null,
      dispose: vi.fn(),
      getTextureNode: vi.fn(),
      setMRT: vi.fn()
    }
    scenePasses.push(scenePass)
    return scenePass
  })
}))

vi.mock('@takram/three-geospatial/webgpu', () => takram)

function createAdapter() {
  let delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null = null
  return {
    adapter: {
      setRenderDelegate(nextDelegate) {
        delegate = nextDelegate
      }
    } as Pick<TelluxRendererAdapter, 'setRenderDelegate'> as TelluxRendererAdapter,
    render(scene: THREE.Scene, camera: THREE.Camera) {
      delegate?.(scene, camera)
    },
    get delegate() {
      return delegate
    }
  }
}

describe('WebGPUPostProcessingManager', () => {
  beforeEach(() => {
    renderPipelineInstances.length = 0
    scenePasses.length = 0
    tsl.mrt.mockClear()
  })

  it('composes the scene node and ordered stages into one render pipeline', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = { getPixelRatio: () => 2 } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUPostProcessingManager(adapter.adapter, renderer, scene, camera)
    const atmosphereNode = { name: 'atmosphere' }
    const outlineNode = { name: 'outline' }
    const colorGradeNode = { name: 'color-grade' }
    const outlineStage: WebGPUPostProcessStage = {
      id: 'outline',
      compose: vi.fn((input) => {
        expect(input).toBe(atmosphereNode)
        return outlineNode as never
      })
    }
    const colorGradeStage: WebGPUPostProcessStage = {
      id: 'color-grade',
      compose: vi.fn((input) => {
        expect(input).toBe(outlineNode)
        return colorGradeNode as never
      })
    }

    manager.setSceneCompositor(atmosphereNode as never)
    const removeOutline = manager.addStage(outlineStage)
    const removeColorGrade = manager.addStage(colorGradeStage)

    const pipeline = renderPipelineInstances[0]!
    expect(pipeline.outputNode).toBe(colorGradeNode)
    expect(pipeline.needsUpdate).toBe(true)

    removeColorGrade()
    expect(pipeline.outputNode).toBe(outlineNode)

    removeOutline()

    expect(pipeline.outputNode).toBe(atmosphereNode)

    manager.setSceneCompositor(null)
    expect(pipeline.outputNode).toBe(manager.scenePass)
  })

  it('owns the WebGPU render delegate for the composed graph lifecycle', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = { getPixelRatio: () => 2 } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUPostProcessingManager(adapter.adapter, renderer, scene, camera)

    adapter.render(scene, camera)
    manager.dispose()

    const pipeline = renderPipelineInstances[0]!
    expect(pipeline.render).toHaveBeenCalledTimes(1)
    expect(pipeline.dispose).toHaveBeenCalledTimes(1)
    expect(adapter.delegate).toBeNull()
  })

  it('enables only the MRT attachments requested by active stages', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = { getPixelRatio: () => 1 } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUPostProcessingManager(adapter.adapter, renderer, scene, camera)
    const normalStage: WebGPUPostProcessStage = {
      id: 'normal-outline',
      sceneAttachments: ['normal'],
      compose: (input) => input
    }
    const velocityStage: WebGPUPostProcessStage = {
      id: 'temporal-aa',
      sceneAttachments: ['velocity'],
      compose: (input) => input
    }

    const removeNormal = manager.addStage(normalStage)
    expect(tsl.mrt).toHaveBeenLastCalledWith({
      output: tsl.output,
      normal: tsl.normalView
    })
    expect(scenePasses[0]!.setMRT).toHaveBeenLastCalledWith({
      outputs: { output: tsl.output, normal: tsl.normalView }
    })

    const removeVelocity = manager.addStage(velocityStage)
    expect(tsl.mrt).toHaveBeenLastCalledWith({
      output: tsl.output,
      normal: tsl.normalView,
      velocity: takram.highpVelocity
    })

    removeNormal()
    expect(tsl.mrt).toHaveBeenLastCalledWith({
      output: tsl.output,
      velocity: takram.highpVelocity
    })

    removeVelocity()
    expect(scenePasses[0]!.setMRT).toHaveBeenLastCalledWith(null)
  })

  it('rejects an unsupported attachment before registering the stage', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = { getPixelRatio: () => 1 } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUPostProcessingManager(adapter.adapter, renderer, scene, camera)

    expect(() => manager.addStage({
      id: 'unsupported',
      sceneAttachments: ['debug' as never],
      compose: (input) => input
    })).toThrow('Unsupported WebGPU scene attachment "debug".')

    expect(() => manager.addStage({
      id: 'valid',
      sceneAttachments: ['normal'],
      compose: (input) => input
    })).not.toThrow()
  })

  it('synchronizes stage resources to viewport size and disposes them with the graph', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = { getPixelRatio: () => 2 } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUPostProcessingManager(adapter.adapter, renderer, scene, camera)
    const stage: WebGPUPostProcessStage = {
      id: 'history-buffer',
      compose: (input) => input,
      setSize: vi.fn(),
      dispose: vi.fn()
    }

    manager.setSize(800, 600)
    const removeStage = manager.addStage(stage)
    manager.setSize(1024, 768)
    removeStage()
    manager.dispose()

    expect(stage.setSize).toHaveBeenNthCalledWith(1, 800, 600, 2)
    expect(stage.setSize).toHaveBeenNthCalledWith(2, 1024, 768, 2)
    expect(stage.dispose).toHaveBeenCalledTimes(1)
    expect(scenePasses[0]!.dispose).toHaveBeenCalledTimes(1)
  })
})
