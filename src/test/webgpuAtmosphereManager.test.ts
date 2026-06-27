import * as THREE from 'three'
import { pass } from 'three/tsl'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGPUAtmosphereManager } from '../rendering/WebGPUAtmosphereManager'
import type { AtmosphereRuntimeState } from '../rendering/AtmosphereRuntimeState'
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
  const atmosphereContextInstances: MockAtmosphereContext[] = []

  const makeConstVarNode = <T,>(value: T) => ({ node: { value } })

  const createParameters = () => ({
    solarIrradiance: new THREE.Vector3(1.474, 1.8504, 1.91198),
    sunAngularRadius: 0.004675,
    rayleighScattering: new THREE.Vector3(0.000005802, 0.000013558, 0.0000331),
    mieScattering: new THREE.Vector3().setScalar(0.000003996),
    mieExtinction: new THREE.Vector3().setScalar(0.00000444),
    miePhaseFunctionG: 0.8,
    absorptionExtinction: new THREE.Vector3(0.00000065, 0.000001881, 0.000000085),
    groundAlbedo: new THREE.Vector3().setScalar(0.3),
    update: vi.fn()
  })

  const createParametersNode = (parameters: ReturnType<typeof createParameters>) => ({
    node: {
      values: {
        solarIrradiance: makeConstVarNode(parameters.solarIrradiance.clone()),
        sunAngularRadius: makeConstVarNode(parameters.sunAngularRadius),
        rayleighScattering: makeConstVarNode(parameters.rayleighScattering.clone()),
        mieScattering: makeConstVarNode(parameters.mieScattering.clone()),
        mieExtinction: makeConstVarNode(parameters.mieExtinction.clone()),
        miePhaseFunctionG: makeConstVarNode(parameters.miePhaseFunctionG),
        absorptionExtinction: makeConstVarNode(parameters.absorptionExtinction.clone()),
        groundAlbedo: makeConstVarNode(parameters.groundAlbedo.clone())
      }
    }
  })

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
    parameters = createParameters()
    parametersNode = createParametersNode(this.parameters)
    lutNode = {
      version: 0,
      set needsUpdate(value: boolean) {
        if (value) this.version += 1
      }
    }
    camera: THREE.Camera | undefined
    correctAltitude = true
    showGround = true
    sunDirectionECEF = { value: new THREE.Vector3() }
    moonDirectionECEF = { value: new THREE.Vector3() }
    matrixECIToECEF = { value: new THREE.Matrix4() }
    matrixMoonFixedToECEF = { value: new THREE.Matrix4() }
    dispose = vi.fn()

    constructor() {
      atmosphereContextInstances.push(this)
    }
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
    atmosphereContextInstances,
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

function createAtmosphereState(overrides: Partial<AtmosphereRuntimeState> = {}): AtmosphereRuntimeState {
  return {
    inscatterIntensity: 1,
    inscatterHorizonBlend: false,
    inscatterHorizonRange: [0, 1],
    correctAltitude: true,
    correctGeometricError: true,
    transmittance: true,
    inscatter: true,
    lightingMode: 'post-process',
    sunLight: true,
    skyLight: true,
    sunLightIntensity: 1,
    skyLightIntensity: 1,
    night: {
      enabled: true,
      moonLight: true,
      ambientLight: true,
      color: 0x9bbcff,
      moonLightIntensity: 0.18,
      ambientIntensity: 0.08,
      useMoonPhase: true,
      transitionRange: [-0.08, 0.05]
    },
    sun: true,
    moon: true,
    ground: true,
    albedoScale: 1,
    sunAngularRadius: 0.004675,
    moonAngularRadius: 0.0045,
    lunarRadianceScale: 1,
    shadowRadius: 3,
    shadowSampleCount: 8,
    starsVisible: true,
    starsIntensity: 1,
    starsPointSize: 1,
    solarIrradianceScale: 1,
    rayleighScatteringScale: 1,
    mieScatteringScale: 1,
    mieExtinctionScale: 1,
    miePhaseFunctionG: 0.8,
    absorptionExtinctionScale: 1,
    groundAlbedo: 0.3,
    ...overrides
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

  it('applies scattering runtime settings to WebGPU atmosphere parameters and nodes', async () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const renderer = {
      library: { addLight: vi.fn() },
      render: vi.fn()
    } as unknown as TelluxWebGPURenderer
    const adapter = createAdapter()
    const manager = new WebGPUAtmosphereManager(adapter.adapter, renderer, scene, camera)
    const webgpuAtmosphere = await import('@takram/three-atmosphere/webgpu') as unknown as {
      atmosphereContextInstances: Array<{
        parameters: {
          solarIrradiance: THREE.Vector3
          sunAngularRadius: number
          rayleighScattering: THREE.Vector3
          mieScattering: THREE.Vector3
          mieExtinction: THREE.Vector3
          miePhaseFunctionG: number
          absorptionExtinction: THREE.Vector3
          groundAlbedo: THREE.Vector3
        }
        parametersNode: {
          node: {
            values: {
              solarIrradiance: { node: { value: THREE.Vector3 } }
              sunAngularRadius: { node: { value: number } }
              rayleighScattering: { node: { value: THREE.Vector3 } }
              mieScattering: { node: { value: THREE.Vector3 } }
              mieExtinction: { node: { value: THREE.Vector3 } }
              miePhaseFunctionG: { node: { value: number } }
              absorptionExtinction: { node: { value: THREE.Vector3 } }
              groundAlbedo: { node: { value: THREE.Vector3 } }
            }
          }
        }
        lutNode: { version: number }
      }>
    }
    const context = webgpuAtmosphere.atmosphereContextInstances.at(-1)!
    const baseSolarIrradiance = context.parameters.solarIrradiance.clone()
    const baseRayleighScattering = context.parameters.rayleighScattering.clone()
    const baseMieScattering = context.parameters.mieScattering.clone()
    const baseMieExtinction = context.parameters.mieExtinction.clone()
    const baseAbsorptionExtinction = context.parameters.absorptionExtinction.clone()

    manager.applyAtmosphereState(createAtmosphereState({
      solarIrradianceScale: 1.5,
      rayleighScatteringScale: 0.5,
      mieScatteringScale: 2,
      mieExtinctionScale: 3,
      miePhaseFunctionG: 2,
      absorptionExtinctionScale: 0,
      groundAlbedo: 2,
      sunAngularRadius: 2
    }))

    const nodeValues = context.parametersNode.node.values
    expect(context.parameters.solarIrradiance).toEqual(baseSolarIrradiance.multiplyScalar(1.5))
    expect(context.parameters.rayleighScattering).toEqual(baseRayleighScattering.multiplyScalar(0.5))
    expect(context.parameters.mieScattering).toEqual(baseMieScattering.multiplyScalar(2))
    expect(context.parameters.mieExtinction).toEqual(baseMieExtinction.multiplyScalar(3))
    expect(context.parameters.miePhaseFunctionG).toBe(0.99)
    expect(context.parameters.absorptionExtinction).toEqual(baseAbsorptionExtinction.multiplyScalar(0))
    expect(context.parameters.groundAlbedo).toEqual(new THREE.Vector3(1, 1, 1))
    expect(context.parameters.sunAngularRadius).toBe(0.1)
    expect(nodeValues.solarIrradiance.node.value).toEqual(context.parameters.solarIrradiance)
    expect(nodeValues.rayleighScattering.node.value).toEqual(context.parameters.rayleighScattering)
    expect(nodeValues.mieScattering.node.value).toEqual(context.parameters.mieScattering)
    expect(nodeValues.mieExtinction.node.value).toEqual(context.parameters.mieExtinction)
    expect(nodeValues.miePhaseFunctionG.node.value).toBe(0.99)
    expect(nodeValues.absorptionExtinction.node.value).toEqual(context.parameters.absorptionExtinction)
    expect(nodeValues.groundAlbedo.node.value).toEqual(context.parameters.groundAlbedo)
    expect(nodeValues.sunAngularRadius.node.value).toBe(0.1)
    expect(context.lutNode.version).toBe(1)
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
