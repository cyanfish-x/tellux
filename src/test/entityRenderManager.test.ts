import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import {
  EntityRenderManager,
  resolveEntityTransparencyMode
} from '../entities/EntityRenderManager'
import { setSymbolOcclusionController } from '../entities/SymbolOcclusionPass'

describe('entity transparency mode resolution', () => {
  it('uses weighted OIT for auto mode when the WebGL effect pipeline is available', () => {
    expect(resolveEntityTransparencyMode('auto', true)).toEqual({
      mode: 'weighted-oit',
      fallbackReason: null
    })
  })

  it('falls back to sorted mode for auto mode without weighted OIT support', () => {
    expect(resolveEntityTransparencyMode('auto', false)).toEqual({
      mode: 'sorted',
      fallbackReason: null
    })
  })

  it('reports an explicit fallback reason when weighted OIT is forced but unavailable', () => {
    const result = resolveEntityTransparencyMode('weighted-oit', false)

    expect(result.mode).toBe('sorted')
    expect(result.fallbackReason).toContain('WebGL')
  })
})

describe('EntityRenderManager', () => {
  it('hides transparent entity objects during the main scene render in weighted OIT mode', () => {
    const root = new THREE.Group()
    const transparentPoint = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ transparent: true })
    )
    const opaquePoint = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ transparent: false })
    )
    root.add(transparentPoint, opaquePoint)
    const manager = new EntityRenderManager({
      root,
      camera: new THREE.PerspectiveCamera(),
      requestedMode: 'weighted-oit',
      supportsWeightedOit: true
    })

    manager.beginFrame()

    expect(root.visible).toBe(true)
    expect(transparentPoint.visible).toBe(false)
    expect(opaquePoint.visible).toBe(true)
    manager.dispose()
  })

  it('does not hide symbol occlusion objects even when their material is transparent', () => {
    const root = new THREE.Group()
    const symbol = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ transparent: true })
    )
    setSymbolOcclusionController(symbol, {
      setDepthTexture: () => undefined,
      setEnabled: () => undefined
    })
    root.add(symbol)
    const manager = new EntityRenderManager({
      root,
      camera: new THREE.PerspectiveCamera(),
      requestedMode: 'weighted-oit',
      supportsWeightedOit: true
    })

    manager.beginFrame()

    expect(symbol.visible).toBe(true)
    manager.dispose()
  })

  it('keeps the entity root visible in sorted fallback mode', () => {
    const root = new THREE.Group()
    const transparentPoint = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ transparent: true })
    )
    root.add(transparentPoint)
    const manager = new EntityRenderManager({
      root,
      camera: new THREE.PerspectiveCamera(),
      requestedMode: 'sorted',
      supportsWeightedOit: true
    })

    manager.beginFrame()

    expect(root.visible).toBe(true)
    expect(transparentPoint.visible).toBe(true)
    manager.dispose()
  })

  it('restores main scene visibility when a weighted OIT frame cannot render', () => {
    const root = new THREE.Group()
    const transparentPoint = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ transparent: true })
    )
    root.add(transparentPoint)
    const manager = new EntityRenderManager({
      root,
      camera: new THREE.PerspectiveCamera(),
      requestedMode: 'weighted-oit',
      supportsWeightedOit: true
    })
    const renderer = {} as THREE.WebGLRenderer
    const readBuffer = {
      width: 1,
      height: 1
    } as THREE.WebGLRenderTarget
    const writeBuffer = { width: 1, height: 1 } as THREE.WebGLRenderTarget

    manager.beginFrame()
    manager.render(renderer, writeBuffer, readBuffer)

    expect(root.visible).toBe(true)
    expect(transparentPoint.visible).toBe(true)
    manager.dispose()
  })
})
