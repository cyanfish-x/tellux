import { describe, expect, it, vi } from 'vitest'
import {
  BoxGeometry,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  ShaderMaterial,
  Texture
} from 'three'

import { WaterAreaMaterialPlugin } from './WaterAreaMaterialPlugin'
import { WaterAreaNodeMaterial } from './WaterAreaNodeMaterial'

describe('WaterAreaMaterialPlugin', () => {
  it('runs before image overlays and preserves the source base material state', () => {
    const map = new Texture()
    const source = new MeshStandardMaterial({
      color: 0x336699,
      map,
      opacity: 0.6,
      transparent: true,
      alphaTest: 0.25,
      side: DoubleSide,
      depthWrite: false
    })
    const dispose = vi.spyOn(source, 'dispose')
    const mesh = new Mesh(new BoxGeometry(), source)
    const scene = new Object3D()
    scene.add(mesh)

    const plugin = new WaterAreaMaterialPlugin()
    plugin.processTileModel(scene)

    expect(plugin.priority).toBe(-1000)
    expect(mesh.material).toBeInstanceOf(WaterAreaNodeMaterial)
    expect(mesh.material).toMatchObject({
      map,
      opacity: 0.6,
      transparent: true,
      alphaTest: 0.25,
      side: DoubleSide,
      depthWrite: false
    })
    expect((mesh.material as WaterAreaNodeMaterial).color.getHex()).toBe(
      0x336699
    )
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('supports meshes with multiple source materials', () => {
    const first = new MeshStandardMaterial({ color: 0xff0000 })
    const second = new MeshStandardMaterial({ color: 0x00ff00 })
    const mesh = new Mesh(new BoxGeometry(), [first, second])

    new WaterAreaMaterialPlugin().processTileModel(mesh)

    expect(mesh.material).toHaveLength(2)
    expect((mesh.material as WaterAreaNodeMaterial[])[0]).toBeInstanceOf(
      WaterAreaNodeMaterial
    )
    expect((mesh.material as WaterAreaNodeMaterial[])[1]).toBeInstanceOf(
      WaterAreaNodeMaterial
    )
  })

  it('falls back safely when a tile mesh uses a non-standard material', () => {
    const mesh = new Mesh(new BoxGeometry(), new ShaderMaterial())

    expect(() =>
      new WaterAreaMaterialPlugin().processTileModel(mesh)
    ).not.toThrow()
    expect(mesh.material).toBeInstanceOf(WaterAreaNodeMaterial)
  })

  it('toggles the water effect through one shared state without hiding tile meshes', () => {
    const firstMesh = new Mesh(
      new BoxGeometry(),
      new MeshStandardMaterial()
    )
    const plugin = new WaterAreaMaterialPlugin()

    plugin.processTileModel(firstMesh)
    const firstMaterial = firstMesh.material as WaterAreaNodeMaterial

    expect(plugin.show).toBe(true)
    expect(firstMaterial.waterAreaEffect.show).toBe(true)

    plugin.show = false

    expect(plugin.show).toBe(false)
    expect(firstMaterial.waterAreaEffect.show).toBe(false)
    expect(firstMesh.visible).toBe(true)

    const nextMesh = new Mesh(
      new BoxGeometry(),
      new MeshStandardMaterial()
    )
    plugin.processTileModel(nextMesh)
    const nextMaterial = nextMesh.material as WaterAreaNodeMaterial

    expect(nextMaterial.waterAreaEffect).toBe(firstMaterial.waterAreaEffect)
    expect(nextMaterial.waterAreaEffect.show).toBe(false)
  })

  it('shares normalized appearance updates with loaded and future tile materials', () => {
    const firstMesh = new Mesh(
      new BoxGeometry(),
      new MeshStandardMaterial()
    )
    const plugin = new WaterAreaMaterialPlugin({
      color: '#123456',
      waveStrength: 0.25
    })

    plugin.processTileModel(firstMesh)
    const firstMaterial = firstMesh.material as WaterAreaNodeMaterial

    expect(plugin.appearance.color).toBe('#123456')
    expect(firstMaterial.waterAreaEffect.waveStrength).toBe(0.25)

    plugin.appearance.waveStrength = 4
    plugin.appearance.waveDirection = -15

    const nextMesh = new Mesh(
      new BoxGeometry(),
      new MeshStandardMaterial()
    )
    plugin.processTileModel(nextMesh)
    const nextMaterial = nextMesh.material as WaterAreaNodeMaterial

    expect(firstMaterial.waterAreaEffect.waveStrength).toBe(1)
    expect(nextMaterial.waterAreaEffect).toBe(firstMaterial.waterAreaEffect)
    expect(nextMaterial.waterAreaEffect.waveDirection).toBe(345)
  })

  it('preserves unrelated appearance fields during partial assignment', () => {
    const plugin = new WaterAreaMaterialPlugin({
      color: '#123456',
      waveScale: 2
    })

    plugin.appearance.assign({ roughness: 0.4 })

    expect(plugin.appearance.color).toBe('#123456')
    expect(plugin.appearance.waveScale).toBe(2)
    expect(plugin.appearance.roughness).toBe(0.4)
  })

  it('disposes both normal textures owned by the shared effect', () => {
    const plugin = new WaterAreaMaterialPlugin()
    const [first, second] = plugin.appearance.normalTextures
    const disposeFirst = vi.spyOn(first, 'dispose')
    const disposeSecond = vi.spyOn(second, 'dispose')

    plugin.dispose()

    expect(first).not.toBe(second)
    expect(disposeFirst).toHaveBeenCalledOnce()
    expect(disposeSecond).toHaveBeenCalledOnce()
  })
})
