import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { submitScenePhase } from '../rendering/SceneSubmission'

describe('scene submission ownership', () => {
  it('keeps callback material edits and restores renderer hooks after a thrown draw', () => {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera()
    const material = new THREE.MeshBasicMaterial({ transparent: true })
    const background = scene.background = new THREE.Color('blue')
    const before = scene.onBeforeRender, after = scene.onAfterRender
    const finish = vi.fn()
    const list = { opaque: [1], transmissive: [2], transparent: [{ material }], finish }
    const nested = { opaque: [3], transmissive: [], transparent: [], finish: vi.fn() }
    const get = vi.fn((_scene: THREE.Scene, depth: number) => depth === 1 ? list : nested)
    const renderer = {
      renderLists: { get }, shadowMap: { autoUpdate: true, needsUpdate: false },
      autoClear: true, toneMapping: THREE.AgXToneMapping,
      render(this: THREE.WebGLRenderer) {
        const selected = this.renderLists.get(scene, 1)
        selected.finish()
        expect(selected.opaque).toEqual([])
        expect(selected.transmissive).toEqual([])
        expect(selected.transparent).toHaveLength(1)
        expect(this.renderLists.get(scene, 2)).toBe(nested)
        expect(material.visible).toBe(true)
        material.visible = false // Application's real callback mutation must survive cleanup.
        this.shadowMap.needsUpdate = true
        throw new Error('draw failed')
      },
    } as unknown as THREE.WebGLRenderer
    expect(() => submitScenePhase(renderer, scene, camera, 'transparent')).toThrow('draw failed')
    expect(renderer.renderLists.get).toBe(get)
    expect(list.finish).toBe(finish)
    expect(scene.onBeforeRender).toBe(before); expect(scene.onAfterRender).toBe(after)
    expect(scene.background).toBe(background)
    expect(scene.matrixWorldAutoUpdate && camera.matrixWorldAutoUpdate).toBe(true)
    expect(renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true })
    expect(renderer.autoClear).toBe(true)
    expect(renderer.toneMapping).toBe(THREE.AgXToneMapping)
    expect(material.visible).toBe(false)
    material.dispose()
  })
})
