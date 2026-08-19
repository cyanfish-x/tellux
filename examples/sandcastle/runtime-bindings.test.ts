import { describe, expect, it } from 'vitest'

import { detectOptionalRuntimeBindings } from './runtime-bindings'

describe('Sandcastle optional runtime bindings', () => {
  it('keeps ordinary examples on the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      import tellux from "../src"
      const viewer = new tellux.Viewer(document.body)
    `)).toEqual({
      gaussianSplat: false,
      hism: false,
      tree: false,
      tsl: false,
      webgpu: false,
      sunDirection: false,
      vectorTile: false
    })
  })

  it('detects dedicated Gaussian, Tree, and HISM capabilities independently', () => {
    expect(detectOptionalRuntimeBindings(`
      const plugin = new GaussianSplatPlugin()
    `).gaussianSplat).toBe(true)
    expect(detectOptionalRuntimeBindings(`
      const tree = new Tree()
    `).tree).toBe(true)
    expect(detectOptionalRuntimeBindings(`
      const placements = generatePoissonPlacements(options)
    `).hism).toBe(true)
  })

  it('does not confuse generic shared helpers with HISM helpers', () => {
    expect(detectOptionalRuntimeBindings(`
      import { exampleMapServiceConfig } from "./shared"
      setupExamplePanels()
    `).hism).toBe(false)
  })

  it('detects TSL / WEBGPU sandbox namespaces used by node-material examples', () => {
    const source = `
      const tsl = typeof TSL !== "undefined" ? TSL : { uv }
      const wgpu = typeof WEBGPU !== "undefined" ? WEBGPU : { NodeMaterial }
    `
    expect(detectOptionalRuntimeBindings(source).tsl).toBe(true)
    expect(detectOptionalRuntimeBindings(source).webgpu).toBe(true)
  })

  it('detects getSunDirectionECEF used by atmosphere-aware examples', () => {
    expect(detectOptionalRuntimeBindings(`
      const dir = getSunDirectionECEF(date, target)
    `).sunDirection).toBe(true)
  })

  it('does not inject TSL / WEBGPU for examples that only use core THREE', () => {
    const result = detectOptionalRuntimeBindings(`
      import * as THREE from "three"
      const geometry = new THREE.BufferGeometry()
    `)
    expect(result.tsl).toBe(false)
    expect(result.webgpu).toBe(false)
    expect(result.sunDirection).toBe(false)
    expect(result.vectorTile).toBe(false)
  })

  it('detects VectorTile used by OSM water-mask examples', () => {
    expect(detectOptionalRuntimeBindings(`
      const tile = new VectorTile(new Pbf(bytes))
    `).vectorTile).toBe(true)
  })
})
