import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  setSymbolOcclusionController,
  SymbolOcclusionPass
} from '../entities/SymbolOcclusionPass'

describe('SymbolOcclusionPass', () => {
  it('hides symbol objects for the main scene and renders only symbols against depth', () => {
    const root = new THREE.Group()
    const symbolMaterial = new THREE.MeshBasicMaterial({ depthTest: true })
    const symbol = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), symbolMaterial)
    const nonSymbol = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    const controller = {
      setDepthTexture: vi.fn(),
      setEnabled: vi.fn()
    }
    setSymbolOcclusionController(symbol, controller)
    root.add(symbol, nonSymbol)

    const pass = new SymbolOcclusionPass(root, new THREE.PerspectiveCamera())
    const depthTexture = new THREE.Texture()
    const readBuffer = createRenderTarget({ depthTexture, texture: new THREE.Texture() })
    const writeBuffer = createRenderTarget({ texture: new THREE.Texture() })
    const rootRenderStates: Array<{ symbolVisible: boolean; nonSymbolVisible: boolean; depthTest: boolean }> = []
    const renderer = createRenderer((scene) => {
      if (scene === root) {
        rootRenderStates.push({
          symbolVisible: symbol.visible,
          nonSymbolVisible: nonSymbol.visible,
          depthTest: symbolMaterial.depthTest
        })
      }
    })

    pass.beginFrame()

    expect(symbol.visible).toBe(false)
    expect(nonSymbol.visible).toBe(true)

    pass.render(renderer, writeBuffer, readBuffer)

    expect(rootRenderStates).toEqual([
      { symbolVisible: true, nonSymbolVisible: false, depthTest: false }
    ])
    expect(symbol.visible).toBe(true)
    expect(nonSymbol.visible).toBe(true)
    expect(symbolMaterial.depthTest).toBe(true)
    expect(controller.setDepthTexture).toHaveBeenNthCalledWith(
      1,
      depthTexture,
      expect.objectContaining({ x: 1 / 16, y: 1 / 16 })
    )
    expect(controller.setDepthTexture).toHaveBeenLastCalledWith(null, null)
    expect(controller.setEnabled).toHaveBeenNthCalledWith(1, true)
    expect(controller.setEnabled).toHaveBeenLastCalledWith(false)
    expect(pass.needsSwap).toBe(true)

    pass.dispose()
  })

  it('restores symbol visibility when no depth texture is available', () => {
    const root = new THREE.Group()
    const symbol = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial())
    const controller = {
      setDepthTexture: vi.fn(),
      setEnabled: vi.fn()
    }
    setSymbolOcclusionController(symbol, controller)
    root.add(symbol)

    const pass = new SymbolOcclusionPass(root, new THREE.PerspectiveCamera())
    const readBuffer = createRenderTarget({ texture: new THREE.Texture() })
    const writeBuffer = createRenderTarget({ texture: new THREE.Texture() })
    const render = vi.fn()
    const renderer = createRenderer(render)

    pass.beginFrame()
    pass.render(renderer, writeBuffer, readBuffer)

    expect(symbol.visible).toBe(true)
    expect(render).not.toHaveBeenCalled()
    expect(controller.setEnabled).toHaveBeenCalledWith(false)
    expect(controller.setDepthTexture).toHaveBeenCalledWith(null, null)
    expect(pass.needsSwap).toBe(false)

    pass.dispose()
  })
})

function createRenderTarget(options: {
  depthTexture?: THREE.Texture
  texture: THREE.Texture
}) {
  return {
    width: 16,
    height: 16,
    texture: options.texture,
    depthTexture: options.depthTexture
  } as THREE.WebGLRenderTarget
}

function createRenderer(render: (scene: THREE.Object3D, camera: THREE.Camera) => void) {
  return {
    autoClear: true,
    getRenderTarget: vi.fn(() => null),
    setRenderTarget: vi.fn(),
    render: vi.fn(render)
  } as unknown as THREE.WebGLRenderer
}
