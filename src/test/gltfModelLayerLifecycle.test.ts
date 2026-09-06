import * as THREE from 'three'
import type { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it, vi } from 'vitest'

import { GltfModelLayer } from '../models/GltfModelLayer'
import { createModelManager } from '../models/ModelManager'

function createDeferredGltf() {
  let resolve!: (value: GLTF) => void
  const promise = new Promise<GLTF>((resolvePromise) => {
    resolve = resolvePromise
  })

  return { promise, resolve }
}

function createGltf(): GLTF {
  const scene = new THREE.Group()
  return {
    animations: [],
    scene,
    scenes: [scene],
    cameras: [],
    asset: { version: '2.0' },
    parser: {} as GLTF['parser'],
    userData: {}
  }
}

function createLayer(loader: Pick<GLTFLoader, 'loadAsync'>) {
  return new GltfModelLayer(
    'model',
    {
      type: 'gltf',
      url: '/model.glb',
      coordinates: [0, 0, 0]
    },
    loader as GLTFLoader,
    'basic',
    vi.fn()
  )
}

describe('GltfModelLayer lifecycle', () => {
  it('rejects ready immediately when removed during loading', async () => {
    const deferred = createDeferredGltf()
    const layer = createLayer({
      loadAsync: vi.fn(() => deferred.promise)
    })
    const loadPromise = layer.load()
    const readyOutcome = Promise.race([
      layer.ready.then(
        () => ({ status: 'resolved' as const }),
        (error) => ({ status: 'rejected' as const, error })
      ),
      new Promise<{ status: 'pending' }>((resolve) => {
        setTimeout(() => resolve({ status: 'pending' }), 0)
      })
    ])

    layer.remove()
    const outcome = await readyOutcome

    deferred.resolve(createGltf())
    await loadPromise

    expect(outcome.status).toBe('rejected')
    if (outcome.status === 'rejected') {
      expect(outcome.error).toBeInstanceOf(Error)
      expect((outcome.error as Error).message).toContain('removed before it finished loading')
    }
  })

  it('keeps loader failures observable through ready', async () => {
    const failure = new Error('network failed')
    const layer = createLayer({
      loadAsync: vi.fn(async () => {
        throw failure
      })
    })
    const readyFailure = layer.ready.then(
      () => null,
      (error) => error
    )

    await layer.load()

    expect(await readyFailure).toBe(failure)
  })
})

describe('ModelManager collection API', () => {
  it('registers models for get, list, and remove', () => {
    const scene = new THREE.Scene()
    const manager = createModelManager({
      scene,
      loader: {
        loadAsync: vi.fn(() => Promise.resolve(createGltf()))
      } as Pick<GLTFLoader, 'loadAsync'> as GLTFLoader,
      getMaterialMode: () => 'basic',
      applyModelMatrix: (_options, target) => target.identity(),
      setPostProcessMaterialLights: vi.fn(),
      setHasLocalLighting: vi.fn()
    })
    const layer = manager.add({
      type: 'gltf',
      id: 'house',
      url: '/house.glb',
      coordinates: [0, 0, 0]
    })

    expect(manager.get('house')).toBe(layer)
    expect(manager.list()).toEqual([layer])
    expect(manager.remove('house')).toBe(true)
    expect(manager.get('house')).toBeNull()
    expect(manager.list()).toEqual([])
    expect(manager.remove('house')).toBe(false)
  })
})
