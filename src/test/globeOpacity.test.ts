import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { getGlobeOpacityParams } from '../tiles/globeOpacity'
import { SurfaceMaterialPlugin } from '../tiles/TilesetModelPlugins'

function createMesh(material = new THREE.MeshStandardMaterial()) {
  return new THREE.Mesh(new THREE.PlaneGeometry(), material)
}

function createTileset(scenes: THREE.Object3D[]) {
  return {
    forEachLoadedModel(callback: (scene: THREE.Object3D) => void) {
      scenes.forEach(callback)
    },
    dispatchEvent: vi.fn()
  }
}

function compileGlobeShader(material: THREE.Material) {
  const shader = {
    uniforms: {
      opacity: { value: (material as THREE.MeshStandardMaterial).opacity }
    } as Record<string, THREE.IUniform>,
    vertexShader: 'void main() {}',
    fragmentShader: `
uniform vec3 diffuse;
uniform float opacity;
void main() {
  vec4 diffuseColor = vec4( diffuse, opacity );
  #include <color_fragment>
  #include <alphamap_fragment>
}
`
  }
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms, null as never)
  return shader
}

function wrapFakeOverlay(material: THREE.Material) {
  const previousOnBeforeCompile = material.onBeforeCompile
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile.call(material, shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
diffuseColor = vec4(1.0);`
    )
  }
}

describe('SurfaceMaterialPlugin globe compositing', () => {
  it('writes opacity after converting materials', () => {
    const mesh = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      0.4
    )

    plugin.processTileModel(mesh)

    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.opacity).toBe(1)
    expect(getGlobeOpacityParams(material)?.telluxGlobeOpacity.value).toBe(0.4)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
  })

  it('keeps opacity when PBR options change', () => {
    const mesh = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      0.4
    )
    plugin.processTileModel(mesh)
    const tileset = createTileset([mesh])

    plugin.setMaterial(
      'standard',
      { roughness: 0.2, metalness: 0.1, useRoughnessMap: false },
      tileset as never
    )

    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.roughness).toBe(0.2)
    expect(material.opacity).toBe(1)
    expect(getGlobeOpacityParams(material)?.telluxGlobeOpacity.value).toBe(0.4)
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
  })

  it('restores an opaque pipeline at opacity 1', () => {
    const mesh = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      0.4
    )
    plugin.processTileModel(mesh)
    const tileset = createTileset([mesh])

    plugin.setOpacity(1, tileset as never)

    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.opacity).toBe(1)
    expect(getGlobeOpacityParams(material)?.telluxGlobeOpacity.value).toBe(1)
    expect(material.transparent).toBe(false)
    expect(material.depthWrite).toBe(true)
  })

  it('applies opacity to every loaded globe tileset scene', () => {
    const surface = createMesh()
    const terrain = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      1
    )
    plugin.processTileModel(surface)
    plugin.processTileModel(terrain)
    const tileset = createTileset([surface, terrain])

    plugin.setOpacity(0.4, tileset as never)

    for (const mesh of [surface, terrain]) {
      const material = mesh.material as THREE.MeshStandardMaterial
      expect(material.opacity).toBe(1)
      expect(getGlobeOpacityParams(material)?.telluxGlobeOpacity.value).toBe(0.4)
      expect(material.transparent).toBe(true)
      expect(material.depthWrite).toBe(false)
    }
  })

  it('multiplies globe opacity after overlay replaces diffuseColor alpha', () => {
    const mesh = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      0.18
    )
    plugin.processTileModel(mesh)
    wrapFakeOverlay(mesh.material as THREE.Material)

    const shader = compileGlobeShader(mesh.material as THREE.Material)
    const overlayIndex = shader.fragmentShader.indexOf('diffuseColor = vec4(1.0);')
    const globeIndex = shader.fragmentShader.indexOf('diffuseColor.a *= telluxGlobeOpacity;')

    expect(shader.uniforms.telluxGlobeOpacity.value).toBe(0.18)
    expect(overlayIndex).toBeGreaterThan(-1)
    expect(globeIndex).toBeGreaterThan(overlayIndex)
  })

  it('uses Three material opacity when overlay is a direct texture', () => {
    const mesh = createMesh()
    const plugin = new SurfaceMaterialPlugin(
      'standard',
      { roughness: 1, metalness: 0, useRoughnessMap: false },
      0.4,
      true
    )

    plugin.processTileModel(mesh)

    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.opacity).toBe(0.4)
    expect(getGlobeOpacityParams(material)).toBeUndefined()
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
  })
})
