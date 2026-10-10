import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { getTelluxAssetUrl } from '../config'
import { AtmosphereManager } from '../rendering/AtmosphereManager'
import { AtmosphereTextureLoader } from '../rendering/AtmosphereTextureLoader'

const { updateTextures } = vi.hoisted(() => ({ updateTextures: vi.fn() }))

vi.mock('@takram/three-atmosphere', async (importOriginal) => ({
  ...await importOriginal<typeof import('@takram/three-atmosphere')>(),
  PrecomputedTexturesGenerator: class {
    update = updateTextures
    dispose = vi.fn()
  }
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => { resolve = settle })
  return { promise, resolve }
}

describe('cloud texture demand', () => {
  let manager: AtmosphereManager
  let cloudImages: MockInstance<AtmosphereTextureLoader['loadCloudTexture']>
  let cloudVolumes: MockInstance<AtmosphereTextureLoader['loadData3DTexture']>
  let stbn: MockInstance<AtmosphereTextureLoader['loadSTBNTexture']>

  beforeEach(() => {
    updateTextures.mockReset().mockResolvedValue({})
    vi.spyOn(THREE.PMREMGenerator.prototype, 'fromScene').mockReturnValue(new THREE.WebGLRenderTarget(1, 1))
    vi.spyOn(THREE.PMREMGenerator.prototype, 'dispose').mockImplementation(() => {})
    cloudImages = vi.spyOn(AtmosphereTextureLoader.prototype, 'loadCloudTexture').mockResolvedValue(true)
    cloudVolumes = vi.spyOn(AtmosphereTextureLoader.prototype, 'loadData3DTexture').mockResolvedValue(true)
    stbn = vi.spyOn(AtmosphereTextureLoader.prototype, 'loadSTBNTexture').mockImplementation(() => {})
    vi.spyOn(AtmosphereTextureLoader.prototype, 'loadBuffer').mockResolvedValue(undefined)
    manager = new AtmosphereManager({} as THREE.WebGLRenderer, new THREE.PerspectiveCamera(), vi.fn())
  })

  afterEach(() => {
    manager?.dispose()
    vi.restoreAllMocks()
  })

  it('keeps shared STBN but makes no cloud requests while disabled', async () => {
    await manager.loadTextures()
    expect(stbn).toHaveBeenCalledWith(getTelluxAssetUrl('stbn'), expect.any(Function))
    expect(cloudImages).not.toHaveBeenCalled()
    expect(cloudVolumes).not.toHaveBeenCalled()

    manager.setCloudsEnabled(true)
    expect(cloudImages.mock.calls.map(([url]) => url)).toEqual([
      getTelluxAssetUrl('localWeather'), getTelluxAssetUrl('turbulence')
    ])
    expect(cloudVolumes.mock.calls.map(([url]) => url)).toEqual([
      getTelluxAssetUrl('shape'), getTelluxAssetUrl('shapeDetail')
    ])
  })

  it('respects the latest demand when atmosphere initialization finishes', async () => {
    const initialization = deferred<{}>()
    updateTextures.mockReturnValueOnce(initialization.promise)
    manager.setCloudsEnabled(true)
    const loading = manager.loadTextures()
    expect(cloudImages).not.toHaveBeenCalled()
    manager.setCloudsEnabled(false)
    initialization.resolve({})
    await loading
    expect(cloudVolumes).not.toHaveBeenCalled()
    manager.setCloudsEnabled(true)
    expect(cloudImages).toHaveBeenCalledTimes(2)
  })

  it('loads initially enabled clouds after atmosphere initialization', async () => {
    manager.setCloudsEnabled(true)
    await manager.loadTextures()
    expect(cloudImages).toHaveBeenCalledTimes(2)
    expect(cloudVolumes).toHaveBeenCalledTimes(2)
  })

  it('reuses both in-flight and completed requests across toggles', async () => {
    const pending = deferred<boolean>()
    cloudImages.mockReturnValue(pending.promise)
    cloudVolumes.mockReturnValue(pending.promise)
    await manager.loadTextures()
    manager.setCloudsEnabled(true)
    manager.setCloudsEnabled(false)
    manager.setCloudsEnabled(true)
    expect(cloudImages).toHaveBeenCalledTimes(2)
    expect(cloudVolumes).toHaveBeenCalledTimes(2)
    pending.resolve(true)
    await pending.promise
    manager.setCloudsEnabled(false)
    manager.setCloudsEnabled(true)
    expect(cloudImages).toHaveBeenCalledTimes(2)
    expect(cloudVolumes).toHaveBeenCalledTimes(2)
  })

  it('retries only failed assets on the next activation', async () => {
    cloudImages.mockResolvedValueOnce(false)
    manager.setCloudsEnabled(true)
    await manager.loadTextures()
    manager.setCloudsEnabled(true)
    expect(cloudImages).toHaveBeenCalledTimes(2)
    manager.setCloudsEnabled(false)
    manager.setCloudsEnabled(true)
    expect(cloudImages).toHaveBeenCalledTimes(3)
    expect(cloudImages.mock.calls[2][0]).toBe(getTelluxAssetUrl('localWeather'))
    expect(cloudVolumes).toHaveBeenCalledTimes(2)
  })

  it('does not start resource requests after disposal during initialization', async () => {
    const initialization = deferred<{}>()
    updateTextures.mockReturnValueOnce(initialization.promise)
    manager.setCloudsEnabled(true)
    const loading = manager.loadTextures()
    manager.dispose()
    initialization.resolve({})
    await loading
    manager.setCloudsEnabled(false)
    manager.setCloudsEnabled(true)
    expect(cloudImages).not.toHaveBeenCalled()
    expect(cloudVolumes).not.toHaveBeenCalled()
    expect(stbn).not.toHaveBeenCalled()
  })
})

describe('cloud texture request completion', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reports a failed image request and releases its retry state', async () => {
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, _loaded, _progress, failed) => {
      failed?.(new Error('502'))
      return new THREE.Texture()
    })
    const loader = new AtmosphereTextureLoader()
    vi.spyOn(loader, 'warnLoadFailure').mockImplementation(() => {})
    const apply = vi.fn()
    expect(await loader.loadCloudTexture('/weather.png', apply)).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    loader.dispose()
  })

  it('disposes a late image without applying it after destruction', async () => {
    let complete!: (texture: THREE.Texture<HTMLImageElement>) => void
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation((_url, loaded) => {
      complete = loaded!
      return new THREE.Texture()
    })
    const loader = new AtmosphereTextureLoader()
    const apply = vi.fn()
    const loading = loader.loadCloudTexture('/weather.png', apply)
    loader.dispose()
    const texture = new THREE.Texture<HTMLImageElement>()
    const dispose = vi.spyOn(texture, 'dispose')
    complete(texture)
    expect(await loading).toBe(false)
    expect(dispose).toHaveBeenCalledOnce()
    expect(apply).not.toHaveBeenCalled()
  })

  it('aborts volume requests and ignores a late response body after destruction', async () => {
    const body = deferred<ArrayBuffer>()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => body.promise })
    vi.stubGlobal('fetch', fetchMock)
    const loader = new AtmosphereTextureLoader()
    const apply = vi.fn()
    const loading = loader.loadData3DTexture('/shape.bin', 2, apply)
    await Promise.resolve()
    loader.dispose()
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true)
    body.resolve(new ArrayBuffer(8))
    expect(await loading).toBe(false)
    expect(apply).not.toHaveBeenCalled()
    await loader.loadData3DTexture('/shape.bin', 2, apply)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
