import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { Scene } from '../Scene'
import { AtmosphereSettings } from '../scene/AtmosphereSettings'
import { resolveViewerSceneOptions } from '../ViewerOptionsResolver'

function createSettings(applyWorldToECEFMatrix = vi.fn()) {
  return new AtmosphereSettings(
    resolveViewerSceneOptions(undefined).atmosphere,
    new THREE.AmbientLight(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    applyWorldToECEFMatrix
  )
}

describe('atmosphere world-to-ECEF facade', () => {
  it('copies the matrix on set and returns it from get', () => {
    const settings = createSettings()
    const matrix = new THREE.Matrix4().makeTranslation(100, 200, 300)

    settings.setWorldToECEFMatrix(matrix)

    expect(settings.getWorldToECEFMatrix().equals(matrix)).toBe(true)
  })

  it('does not keep the caller matrix by reference', () => {
    const applyWorldToECEFMatrix = vi.fn()
    const settings = createSettings(applyWorldToECEFMatrix)
    const matrix = new THREE.Matrix4().makeTranslation(100, 200, 300)

    settings.setWorldToECEFMatrix(matrix)
    matrix.makeTranslation(1, 2, 3)

    const stored = settings.getWorldToECEFMatrix()
    expect(stored.equals(new THREE.Matrix4().makeTranslation(100, 200, 300))).toBe(true)
    expect(applyWorldToECEFMatrix.mock.calls[0]?.[0]).not.toBe(matrix)
    expect(applyWorldToECEFMatrix.mock.calls[0]?.[0].equals(stored)).toBe(true)
  })

  it('round-trips an identity matrix as the default restore', () => {
    const settings = createSettings()
    settings.setWorldToECEFMatrix(new THREE.Matrix4().makeTranslation(10, 20, 30))

    settings.setWorldToECEFMatrix(new THREE.Matrix4())

    expect(settings.getWorldToECEFMatrix().equals(new THREE.Matrix4())).toBe(true)
  })

  it('writes into the provided get target', () => {
    const settings = createSettings()
    const matrix = new THREE.Matrix4().makeTranslation(4, 5, 6)
    const target = new THREE.Matrix4()
    settings.setWorldToECEFMatrix(matrix)

    const result = settings.getWorldToECEFMatrix(target)

    expect(result).toBe(target)
    expect(target.equals(matrix)).toBe(true)
  })

  it('forwards the copied matrix from Scene to the atmosphere applier', () => {
    const applyWorldToECEFMatrix = vi.fn()
    const scene = new Scene(
      resolveViewerSceneOptions(undefined),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
      applyWorldToECEFMatrix
    )
    const matrix = new THREE.Matrix4().makeTranslation(7, 8, 9)

    scene.atmosphere.setWorldToECEFMatrix(matrix)
    matrix.identity()

    expect(applyWorldToECEFMatrix).toHaveBeenCalledOnce()
    expect(applyWorldToECEFMatrix.mock.calls[0]?.[0].equals(
      new THREE.Matrix4().makeTranslation(7, 8, 9)
    )).toBe(true)
  })
})
