import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  setSymbolOcclusionController,
  SymbolOcclusionPass
} from '../entities/SymbolOcclusionPass'

describe('SymbolOcclusionPass', () => {
  it('hides symbols for the main render, captures depth in-chain, and draws symbols to the canvas after composite', () => {
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
    const renderTargets: Array<THREE.WebGLRenderTarget | null> = []
    const renderer = createRenderer((scene) => {
      if (scene === root) {
        rootRenderStates.push({
          symbolVisible: symbol.visible,
          nonSymbolVisible: nonSymbol.visible,
          depthTest: symbolMaterial.depthTest
        })
      }
    }, renderTargets)

    pass.beginFrame()

    expect(symbol.visible).toBe(false)
    expect(nonSymbol.visible).toBe(true)

    // 链内步骤只捕获深度，不绘制。In-chain step captures depth only, no draw.
    pass.render(renderer, writeBuffer, readBuffer)
    expect(rootRenderStates).toEqual([])
    expect(pass.needsSwap).toBe(false)

    // 后合成步骤：只画 symbol，直接画到默认帧缓冲（canvas）。
    pass.renderAfterComposite(renderer)

    expect(rootRenderStates).toEqual([
      { symbolVisible: true, nonSymbolVisible: false, depthTest: false }
    ])
    expect(renderTargets).toEqual([null])
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

    pass.dispose()
  })

  it('still draws symbols without anchor occlusion when no depth texture is available', () => {
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
    expect(render).not.toHaveBeenCalled()

    pass.renderAfterComposite(renderer)

    expect(symbol.visible).toBe(true)
    // 无深度也照常绘制，只是关闭锚点遮挡。Draws without occlusion when depth is missing.
    expect(render).toHaveBeenCalledTimes(1)
    expect(controller.setEnabled).toHaveBeenNthCalledWith(1, false)
    expect(controller.setEnabled).toHaveBeenLastCalledWith(false)
    expect(controller.setDepthTexture).toHaveBeenLastCalledWith(null, null)
    expect(pass.needsSwap).toBe(false)

    pass.dispose()
  })

  it('skips the post-composite draw when there are no renderable symbols', () => {
    const root = new THREE.Group()
    const pass = new SymbolOcclusionPass(root, new THREE.PerspectiveCamera())
    const render = vi.fn()
    const renderer = createRenderer(render)

    pass.beginFrame()
    pass.render(
      renderer,
      createRenderTarget({ texture: new THREE.Texture() }),
      createRenderTarget({ depthTexture: new THREE.Texture(), texture: new THREE.Texture() })
    )
    pass.renderAfterComposite(renderer)

    expect(render).not.toHaveBeenCalled()

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

function createRenderer(
  render: (scene: THREE.Object3D, camera: THREE.Camera) => void,
  renderTargets?: Array<THREE.WebGLRenderTarget | null>
) {
  let currentTarget: THREE.WebGLRenderTarget | null = null
  return {
    autoClear: true,
    getRenderTarget: vi.fn(() => currentTarget),
    setRenderTarget: vi.fn((target: THREE.WebGLRenderTarget | null) => {
      currentTarget = target
    }),
    render: vi.fn((scene: THREE.Object3D, camera: THREE.Camera) => {
      renderTargets?.push(currentTarget)
      render(scene, camera)
    })
  } as unknown as THREE.WebGLRenderer
}
