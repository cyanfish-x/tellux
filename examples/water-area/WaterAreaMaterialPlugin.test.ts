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
})
