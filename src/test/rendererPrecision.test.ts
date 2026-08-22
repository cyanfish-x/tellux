import { describe, expect, it, vi } from 'vitest'

vi.mock('three/webgpu', () => ({
  WebGPURenderer: class {
    highPrecision = false

    async init() {}
  }
}))

import {
  createRendererAdapter,
  type TelluxWebGPURenderer
} from '../rendering/RendererAdapter'

describe('WebGPU renderer precision', () => {
  it('enables Three.js high-precision model-view matrices for Earth-scale coordinates', () => {
    const adapter = createRendererAdapter({ renderer: { type: 'webgpu' } })

    expect((adapter.renderer as TelluxWebGPURenderer).highPrecision).toBe(true)
  })
})
