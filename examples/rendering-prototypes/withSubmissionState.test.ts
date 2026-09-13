import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { withSubmissionState } from './withSubmissionState'

describe('experimental material submission scope', () => {
  it('restores mixed/shared/hidden materials, frame state and callbacks after a failed submission', () => {
    const opaque = new THREE.MeshBasicMaterial()
    const alpha = new THREE.MeshBasicMaterial({ transparent: true })
    const hidden = new THREE.MeshBasicMaterial({ visible: false, transparent: true })
    const scene = new THREE.Scene()
    const geometry = new THREE.BoxGeometry()
    scene.add(new THREE.Mesh(geometry, [opaque, alpha, hidden]), new THREE.Mesh(geometry, alpha))
    const before = vi.fn(), after = vi.fn()
    scene.onBeforeRender = before; scene.onAfterRender = after
    const camera = new THREE.PerspectiveCamera()
    const renderer = { shadowMap: { autoUpdate: true, needsUpdate: true } } as THREE.WebGLRenderer
    expect(() => withSubmissionState(renderer, scene, camera, m => m.transparent, () => {
      expect([opaque.visible, alpha.visible, hidden.visible]).toEqual([false, true, false])
      expect(renderer.shadowMap).toEqual({ autoUpdate: false, needsUpdate: false })
      expect(scene.onBeforeRender).not.toBe(before)
      expect(scene.matrixWorldAutoUpdate).toBe(false)
      throw Error('failed draw')
    })).toThrow('failed draw')
    expect([opaque.visible, alpha.visible, hidden.visible]).toEqual([true, true, false])
    expect(scene.onBeforeRender).toBe(before); expect(scene.onAfterRender).toBe(after)
    expect(scene.matrixWorldAutoUpdate).toBe(true); expect(camera.matrixWorldAutoUpdate).toBe(true)
    expect(renderer.shadowMap).toEqual({ autoUpdate: true, needsUpdate: true })
    geometry.dispose(); opaque.dispose(); alpha.dispose(); hidden.dispose()
  })
})
