import * as THREE from 'three'
import { pass } from 'three/tsl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGPUAtmosphereManager } from '../rendering/WebGPUAtmosphereManager'
import type { TelluxRendererAdapter, TelluxWebGPURenderer } from '../rendering/RendererAdapter'

const renderPipelineRender = vi.fn()
const renderPipelineDispose = vi.fn()

vi.mock('three/webgpu', async () => {
  const three = await vi.importActual<typeof import('three')>('three')
  return {
    ...three,
    RenderPipeline: class {
      needsUpdate = true

      constructor(
        readonly renderer: unknown,
        readonly outputNode: unknown
      ) {}

      render() {
        renderPipelineRender()
      }

      dispose() {
        renderPipelineDispose()
      }
    }
  }
})

vi.mock('three/tsl', () => {
  const makeNode = () => ({
    context: vi.fn(function context(this: unknown) {
      return this
    })
  })

  return {
    context: (node: unknown) => node,
    pass: vi.fn(() => ({
      ...makeNode(),
      contextNode: null,
      getTextureNode: vi.fn(() => makeNode())
    }))
  }
})

vi.mock('@takram/three-atmosphere/webgpu', () => {
  const skyNodeInstances: MockSkyNode[] = []

  class MockSkyNode {
    showSun = true
    showMoon = true
    showStars = true
    moonScattering = false
    sunNode = { angularRadius: { value: 0 }, intensity: { value: 1 } }
    moonNode = { angularRadius: { value: 0 }, intensity: { value: 1 } }
    starsNode = { intensity: { value: 1 }, pointSize: { value: 1 } }

    constructor() {
      skyNodeInstances.push(this)
    }
  }

  class MockAtmosphereContext {
    camera: THREE.Camera | undefined
    correctAltitude = true
    showGround = true
    sunDirectionECEF = { value: new THREE.Vector3() }
    moonDirectionECEF = { value: new THREE.Vector3() }
    matrixECIToECEF = { value: new THREE.Matrix4() }
    matrixMoonFixedToECEF = { value: new THREE.Matrix4() }
    dispose = vi.fn()
  }

  class MockAtmosphereLight extends THREE.DirectionalLight {
    direct = { value: true }
    indirect = { value: true }

    constructor(distance = 1, readonly body = 'sun') {
      super()
      this.position.set(distance, 0, 0)
    }
  }

  class MockAerialPerspectiveNode {
    skyNode: unknown = null
    correctGeometricError = true
    lighting = false
    transmittance = true
    inscattering = true
    moonScattering = false
    dispose = vi.fn()
  }

  return {
    AerialPerspectiveNode: MockAerialPerspectiveNode,
    AtmosphereContext: MockAtmosphereContext,
    AtmosphereLight: MockAtmosphereLight,
    AtmosphereLightNode: class {},
    SkyNode: MockSkyNode,
    aerialPerspective: vi.fn(() => new MockAerialPerspectiveNode()),
    sky: vi.fn(() => new MockSkyNode()),
    skyNodeInstances
  }
})

vi.mock('@takram/three-atmosphere', () => ({
  getECIToECEFRotationMatrix: vi.fn((_date: Date, target = new THREE.Matrix4()) => target.identity()),
  getMoonFixedToECIRotationMatrix: vi.fn((_date: Date, target = new THREE.Matrix4()) => target.identity()),
  getMoonDirectionECEF: vi.fn((_date: Date, target = new THREE.Vector3()) => target.set(0, 1, 0)),
  getSunDirectionECEF: vi.fn((_date: Date, target = new THREE.Vector3()) => target.set(1, 0, 0))
}))

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

describe('WebGPUAtmosphereManager', () => {
  beforeEach(() => {
    renderPipelineRender.mockClear()
    renderPipelineDispose.mockClear()
    vi.mocked(pass).mockClear()
  })

  it('uses RenderPipeline while atmosphere is visible and falls back when hidden', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = {
      library: { addLight: vi.fn() },
      render: vi.fn()
    } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUAtmosphereManager(adapter.adapter, renderer, scene, camera)

    adapter.render(scene, camera)
    manager.setAtmosphereVisible(false)
    adapter.render(scene, camera)

    expect(renderPipelineRender).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledWith(scene, camera)
  })

  it('adds the atmosphere context to the internal scene pass', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = {
      library: { addLight: vi.fn() },
      render: vi.fn()
    } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()

    new WebGPUAtmosphereManager(adapter.adapter, renderer, scene, camera)

    const scenePass = vi.mocked(pass).mock.results[0]?.value
    expect(scenePass.contextNode).not.toBeNull()
  })

  it('keeps Takram stars disabled to avoid async builder context loss', async () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = {
      library: { addLight: vi.fn() },
      render: vi.fn()
    } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()

    new WebGPUAtmosphereManager(adapter.adapter, renderer, scene, camera)
    const webgpuAtmosphere = await import('@takram/three-atmosphere/webgpu') as unknown as {
      skyNodeInstances: Array<{ showStars: boolean }>
    }

    expect(webgpuAtmosphere.skyNodeInstances[0].showStars).toBe(false)
  })

  it('registers light nodes without taking over the scene background', () => {
    const scene = new THREE.Scene() as THREE.Scene & { backgroundNode?: unknown }
    const existingBackgroundNode = { name: 'existing background' }
    Object.defineProperty(scene, 'backgroundNode', {
      configurable: true,
      writable: true,
      value: existingBackgroundNode
    })
    const camera = new THREE.PerspectiveCamera()
    const renderer = {
      library: { addLight: vi.fn() },
      render: vi.fn()
    } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUAtmosphereManager(adapter.adapter, renderer, scene, camera)

    manager.addLightSourcesTo(scene)
    expect(renderer.library.addLight).toHaveBeenCalledTimes(1)
    expect(scene.backgroundNode).toBe(existingBackgroundNode)

    manager.dispose()

    expect(adapter.delegate).toBeNull()
    expect(scene.backgroundNode).toBe(existingBackgroundNode)
    expect(renderPipelineDispose).toHaveBeenCalledTimes(1)
  })
})
