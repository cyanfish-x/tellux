import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Camera, type CameraState } from '../Camera'
import type { ViewerOptions } from '../types'
import { PointGraphics, PolygonGraphics, TextGraphics } from '../entities/EntityGraphics'
import { PointGraphic } from '../entities/PointGraphic'
import { PolygonGraphic } from '../entities/PolygonGraphic'
import { SymbolGraphic } from '../entities/SymbolGraphic'
import * as GlyphAtlas from '../entities/GlyphAtlas'
import { createModelManager, disposeModelManager, setModelManagerMaterialMode, updateModelManager } from '../models/ModelManager'
import { GltfModelLayer } from '../models/GltfModelLayer'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('stable API regressions', () => {
  it('returns a complete state reusable by Viewer initialization', () => {
    const camera = new Camera(new THREE.PerspectiveCamera())
    const state: CameraState = camera.getState()
    const options: ViewerOptions = { camera: state }
    const longitude: number = state.destination.longitude
    expect(Number.isFinite(longitude)).toBe(true)
    expect(options.camera?.destination).toHaveProperty('height')
    state.orientation.heading = 123
    expect(camera.getState().orientation.heading).not.toBe(123)
  })

  it('restores zero-width point outlines and keeps size and visibility in sync', () => {
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({
      beginPath() {}, arc() {}, closePath() {}, fill() {}, fillStyle: ''
    }) }) })
    const point = new PointGraphic({ position: new THREE.Vector3(), options: {
      pixelSize: 8, outline: { width: 0 }
    }, resolveColor: color => new THREE.Color(color) })
    const handle = new PointGraphics(point)
    const materials = point.object3D.children.slice(0, 2).map(child => (child as THREE.Points).material as THREE.PointsMaterial)
    expect(materials).toHaveLength(2)
    expect(materials.every(material => !material.visible)).toBe(true)
    handle.outline!.width = 3
    handle.outline!.color = '#ff0000'
    expect(materials.every(material => material.visible && material.size === 14 && material.color.getHex() === 0xff0000)).toBe(true)
    expect(point.visualDiameter).toBe(14)
    handle.pixelSize = 12
    expect(materials.every(material => material.size === 18)).toBe(true)
    handle.outline!.width = 0
    expect(materials.every(material => !material.visible)).toBe(true)
    expect(point.visualDiameter).toBe(12)
    point.dispose()
    const plain = new PointGraphic({ position: new THREE.Vector3(), options: {}, resolveColor: color => new THREE.Color(color) })
    expect(new PointGraphics(plain).outline).toBeUndefined()
    plain.dispose()
  })

  it('writes polygon and text outline styles through nested handles', () => {
    const polygon = new PolygonGraphic({ worldPositions: [
      new THREE.Vector3(10, 0, 0), new THREE.Vector3(10, 1, 0), new THREE.Vector3(10, 0, 1)
    ], options: { positions: [], outline: {} }, resolveColor: color => new THREE.Color(color) })
    new PolygonGraphics(polygon).outline!.color = '#00ff00'
    expect(polygon.outlineColor).toBe(0x00ff00)
    polygon.dispose()
    // Isolate DOM atlas allocation; SymbolGraphic still owns and updates the style state.
    vi.spyOn(GlyphAtlas, 'createGlyphTextRun').mockReturnValue({ contentW: 0, contentH: 0, quads: [] })
    const symbol = new SymbolGraphic({ position: new THREE.Vector3(), pixelRatio: 1,
      options: { text: { text: '', outline: { width: 0 } } } })
    const text = new TextGraphics(symbol)
    text.outline!.color = '#ff0000'
    text.outline!.width = 3
    expect(symbol.outlineWidthValue).toBe(3)
    expect(symbol.outlineColorHex).toBe(0xff0000)
    symbol.dispose()
  })

  it('keeps model maintenance callable only through package-internal hooks', () => {
    vi.spyOn(GltfModelLayer.prototype, 'load').mockResolvedValue(undefined)
    const update = vi.spyOn(GltfModelLayer.prototype, 'update')
    const material = vi.spyOn(GltfModelLayer.prototype, 'setMaterialMode')
    const manager = createModelManager({ scene: new THREE.Scene(), loader: {} as never,
      getMaterialMode: () => 'basic', applyModelMatrix: (_options, matrix) => matrix.identity(),
      setPostProcessMaterialLights() {}, setHasLocalLighting() {} })
    manager.add({ type: 'gltf', url: '/model.glb', coordinates: [0, 0, 0] })
    expect('update' in manager).toBe(false)
    expect('setMaterialMode' in manager).toBe(false)
    expect('dispose' in manager).toBe(false)
    updateModelManager(manager, 0.25)
    setModelManagerMaterialMode(manager, 'standard')
    expect(update).toHaveBeenCalledWith(0.25)
    expect(material).toHaveBeenCalledWith('standard')
    disposeModelManager(manager)
    expect(manager.list()).toEqual([])
  })
})
