import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import type { TelluxRendererAdapter } from '../rendering/RendererAdapter'

function renderThroughAdapter(
  adapter: Pick<TelluxRendererAdapter, 'setRenderDelegate' | 'render'>,
  scene: THREE.Scene,
  camera: THREE.Camera,
  delegate?: (scene: THREE.Object3D, camera: THREE.Camera) => void
) {
  adapter.setRenderDelegate(delegate ?? null)
  adapter.render(scene, camera)
}

describe('renderer adapter render delegate contract', () => {
  it('lets WebGPU-specific pipelines replace the default render call', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const calls: string[] = []
    const adapter = {
      setRenderDelegate(delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null) {
        this.delegate = delegate
      },
      render(renderScene: THREE.Object3D, renderCamera: THREE.Camera) {
        if (this.delegate) {
          this.delegate(renderScene, renderCamera)
          return
        }
        calls.push('default')
      },
      delegate: null as ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null
    }

    renderThroughAdapter(adapter, scene, camera, () => {
      calls.push('delegate')
    })

    expect(calls).toEqual(['delegate'])
  })

  it('falls back to default rendering when no delegate is registered', () => {
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera()
    const calls: string[] = []
    const adapter = {
      setRenderDelegate(delegate: ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null) {
        this.delegate = delegate
      },
      render(renderScene: THREE.Object3D, renderCamera: THREE.Camera) {
        if (this.delegate) {
          this.delegate(renderScene, renderCamera)
          return
        }
        calls.push(renderScene === scene && renderCamera === camera ? 'default' : 'wrong-target')
      },
      delegate: null as ((scene: THREE.Object3D, camera: THREE.Camera) => void) | null
    }

    renderThroughAdapter(adapter, scene, camera)

    expect(calls).toEqual(['default'])
  })
})
