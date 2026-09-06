import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { TransparentStage } from './TransparentStage'

describe('prototype transparent stage', () => {
  it('uses opaque depth from the write side and restores renderer state on a failed draw', () => {
    const scene = new THREE.Scene()
    const background = new THREE.Color('red')
    scene.background = background
    const camera = new THREE.PerspectiveCamera()
    const stage = new TransparentStage(scene, camera, () => {})
    const read = new THREE.WebGLRenderTarget(8, 8)
    const write = new THREE.WebGLRenderTarget(8, 8)
    write.depthTexture = new THREE.DepthTexture(8, 8)
    const previous = new THREE.WebGLRenderTarget(2, 2)
    let target = previous
    const renderer = {
      autoClear: true, toneMapping: THREE.AgXToneMapping,
      getRenderTarget: () => target,
      setRenderTarget: (next: THREE.WebGLRenderTarget) => { target = next },
      getClearAlpha: () => 1,
      getClearColor: (color: THREE.Color) => color.set('blue'),
      setClearColor: vi.fn(), clear: vi.fn(),
      render: vi.fn(() => { throw new Error('draw failure') }),
    }
    expect(() => stage.render(renderer as unknown as THREE.WebGLRenderer, write, read)).toThrow('draw failure')
    expect(stage.depth.value).toBe(write.depthTexture)
    expect(target).toBe(previous)
    expect(camera.layers.mask).toBe(1)
    expect(scene.background).toBe(background)
    expect(renderer.autoClear).toBe(true)
    expect(renderer.toneMapping).toBe(THREE.AgXToneMapping)
    expect(stage.active.value).toBe(false)
    stage.dispose(); read.dispose(); write.depthTexture.dispose(); write.dispose(); previous.dispose()
  })
})
