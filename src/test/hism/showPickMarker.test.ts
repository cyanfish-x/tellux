import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { HismManager } from '../../hism/core/HismManager'

function createManager(showPickMarker?: boolean) {
  const scene = new THREE.Scene()
  const manager = new HismManager({
    scene,
    camera: new THREE.PerspectiveCamera(),
    domElement: { clientWidth: 1, clientHeight: 1 } as HTMLElement,
    showPickMarker,
    applyInstanceMatrix: (_coordinates, _frame, _scale, target) => {
      target.identity()
    }
  })
  return { scene, manager }
}

describe('HismManager.showPickMarker', () => {
  it('creates the pick marker by default and can toggle it at runtime', () => {
    const { scene, manager } = createManager()

    expect(manager.showPickMarker).toBe(true)
    expect(scene.getObjectByName('tellux-hism-pick-marker')).toBeTruthy()

    manager.showPickMarker = false
    expect(manager.showPickMarker).toBe(false)
    expect(scene.getObjectByName('tellux-hism-pick-marker')).toBeUndefined()

    manager.showPickMarker = true
    expect(manager.showPickMarker).toBe(true)
    expect(scene.getObjectByName('tellux-hism-pick-marker')).toBeTruthy()
    manager.dispose()
  })

  it('skips pick marker creation when initialized to false', () => {
    const { scene, manager } = createManager(false)

    expect(manager.showPickMarker).toBe(false)
    expect(scene.getObjectByName('tellux-hism-pick-marker')).toBeUndefined()
    manager.dispose()
  })
})
