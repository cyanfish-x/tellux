import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import * as THREE from 'three'

// Execute the real example with scene/network doubles; no browser or WebGL context.
function setup() {
  class Element {}
  class Input extends Element {}
  class Tiles {
    static instances: Tiles[] = []
    group = new THREE.Group()
    visibleTiles = new Set()
    events: Record<string, (event?: any) => void> = {}
    disposed = false
    errorTarget = 8
    constructor(public url: string) { Tiles.instances.push(this) }
    setCamera() {}
    setResolutionFromRenderer() {}
    registerPlugin() {}
    addEventListener(name: string, fn: (event?: any) => void) { this.events[name] = fn }
    dispose() { this.disposed = true }
    getBoundingSphere(sphere: THREE.Sphere) { sphere.radius = 50; return true }
  }
  let finishDecode!: () => void
  class Mesh extends THREE.Group {
    static instances: Mesh[] = []
    initialized = new Promise<void>(resolve => { finishDecode = resolve })
    dispose = vi.fn()
    constructor(_options: unknown) { super(); Mesh.instances.push(this) }
    getBoundingBox() { return new THREE.Box3(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1)) }
  }
  class Spark extends THREE.Group { dispose() {} }
  const viewer = {
    scene: { raw: new THREE.Scene() }, camera: { raw: new THREE.PerspectiveCamera() },
    renderer: { raw: Object.create(THREE.WebGLRenderer.prototype) },
    globe: { show: true }, postProcess: { toneMappingExposure: 5 }, flyToTarget: vi.fn(),
    cartographicToMatrix4: () => new THREE.Matrix4(), render() {}, destroy() {},
  }
  const fetch = vi.fn()
  const errors = vi.fn()
  const auth = vi.fn()
  const stabilizeSplatRaycast = vi.fn()
  let panel: any
  const controlsFrom = (schema: any): any => Object.fromEntries(Object.entries(schema)
    .filter(([key]) => key !== '$')
    .map(([key, value]: [string, any]) => [key, 'value' in value ? value.value : 'onClick' in value ? value.onClick : controlsFrom(value)]))
  const bindings = {
    tellux: { Viewer: function () { return viewer } }, THREE, TilesRenderer: Tiles,
    GaussianSplatPlugin: class {}, SparkRenderer: Spark, SplatMesh: Mesh,
    CESIUM_ION_EVALUATION_TOKEN: 'public-evaluation-test',
    SplatColorTransform: class { update() {} attach() {} dispose() {} },
    getSparkRendererForScene: () => null,
    stabilizeSplatRaycast,
    CesiumIonAuthPlugin: class { constructor(options: unknown) { auth(options) } }, ImplicitTilingPlugin: class {},
    bootExampleI18n() {}, t: (value: any) => value.en,
    ExampleMessage: { error: errors },
    exampleMapServiceConfig: { createTerrainOptions() {}, createImagerySource() {} },
    createTelluxPanel: (factory: () => any) => {
      panel = { controls: controlsFrom(factory()), setStatus: vi.fn(), dispose() {} }
      return panel
    },
    HTMLElement: Element, HTMLInputElement: Input,
    document: { querySelector: () => new Element() },
    window: { location: { href: 'https://example.com/' }, requestAnimationFrame: () => 1, addEventListener() {} },
    fetch,
  }
  const source = readFileSync(new URL('./gaussian-splat-3d-tiles.ts', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '')
    .replaceAll('import.meta.env', '({})')
  const js = ts.transpile(source, { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.None })
  const api = new Function(...Object.keys(bindings), js + '\nreturn { loadSource, clearSource, flyToSource };')(...Object.values(bindings))
  return { api, viewer, panel, fetch, errors, auth, stabilizeSplatRaycast, Tiles, Mesh, decode: () => finishDecode() }
}

describe('Gaussian source lifecycle', () => {
  it('stabilizes each loaded Gaussian tile without adapting ordinary objects or stale loads', () => {
    const h = setup()
    const tile = h.Tiles.instances[0]
    const scene = new THREE.Group()
    const mesh = new THREE.Group()
    mesh.userData.gaussianSplat = true
    scene.add(mesh, new THREE.Mesh())
    tile.events['load-model']({ scene })
    expect(h.stabilizeSplatRaycast).toHaveBeenCalledOnce()
    expect(h.stabilizeSplatRaycast).toHaveBeenCalledWith(mesh)
    h.api.clearSource()
    tile.events['load-model']({ scene })
    expect(h.stabilizeSplatRaycast).toHaveBeenCalledTimes(1)
  })
  it('uses the public evaluation token only for the official asset and honors explicit credentials', async () => {
    const h = setup()
    h.panel.controls.source.kind = 'ion'
    await h.api.loadSource()
    expect(h.auth).toHaveBeenLastCalledWith(expect.objectContaining({ assetId: '4547222', apiToken: 'public-evaluation-test' }))
    h.panel.controls.connection.token = 'explicit-test-token'
    await h.api.loadSource()
    expect(h.auth).toHaveBeenLastCalledWith(expect.objectContaining({ apiToken: 'explicit-test-token' }))
    h.auth.mockClear()
    h.panel.controls.connection.token = ''
    h.panel.controls.connection.assetId = '123'
    await h.api.loadSource()
    expect(h.auth).not.toHaveBeenCalled()
  })
  it('ignores stale tileset errors and root events after switching', async () => {
    const h = setup()
    const old = h.Tiles.instances[0]
    h.panel.controls.source.kind = 'elevator'
    h.panel.controls.connection.url = 'https://example.com/elevator/tileset.json'
    await h.api.loadSource()
    const current = h.Tiles.instances[1]
    old.events['load-root-tileset']()
    old.events['load-error']({ error: new Error('HTTP 404') })
    expect(old.disposed).toBe(true)
    expect(current.disposed).toBe(false)
    expect(h.errors).not.toHaveBeenCalled()
    expect(h.viewer.flyToTarget).not.toHaveBeenCalled()
    current.events['load-root-tileset']()
    expect(h.viewer.flyToTarget).toHaveBeenCalledWith(current, expect.any(Object))
  })

  it('aborts an in-flight single-file request on removal', async () => {
    const h = setup()
    let signal!: AbortSignal
    h.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      signal = options.signal
      signal.addEventListener('abort', () => reject(new Error('aborted')))
    }))
    h.panel.controls.source.kind = 'butterfly'
    const loading = h.api.loadSource()
    h.api.clearSource()
    await loading
    expect(signal.aborted).toBe(true)
    expect(h.errors).not.toHaveBeenCalled()
  })

  it('disposes a decoded single file if another source replaced it', async () => {
    const h = setup()
    h.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    h.panel.controls.source.kind = 'butterfly'
    const loading = h.api.loadSource()
    await vi.waitFor(() => expect(h.Mesh.instances).toHaveLength(1))
    h.panel.controls.source.kind = 'svirnas'
    await h.api.loadSource()
    h.decode()
    await loading
    expect(h.Mesh.instances[0].dispose).toHaveBeenCalledOnce()
    expect(h.Mesh.instances[0].parent).toBeNull()
    expect(h.stabilizeSplatRaycast).not.toHaveBeenCalled()
    expect(h.Tiles.instances[1].disposed).toBe(false)
  })

  it('attaches the decoded single file and releases it on removal', async () => {
    const h = setup()
    h.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    h.panel.controls.source.kind = 'butterfly'
    const loading = h.api.loadSource()
    await vi.waitFor(() => expect(h.Mesh.instances).toHaveLength(1))
    h.decode()
    await loading
    const mesh = h.Mesh.instances[0]
    const root = mesh.parent!
    expect(h.stabilizeSplatRaycast).toHaveBeenCalledOnce()
    expect(h.stabilizeSplatRaycast).toHaveBeenCalledWith(mesh)
    expect(root.parent).toBe(h.viewer.scene.raw)
    expect(root.matrixAutoUpdate).toBe(false)
    expect(h.viewer.flyToTarget).toHaveBeenCalled()
    h.api.clearSource()
    expect(root.parent).toBeNull()
    expect(mesh.dispose).toHaveBeenCalledOnce()
  })
})
