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
      ocean: false,
      tree: false
    })
  })

  it('loads the ocean binding only for the Riyue Bay factory', () => {
    expect(detectOptionalRuntimeBindings(`
      const demo = await createRiyueBayOceanDemo('viewer')
    `).ocean).toBe(true)
    expect(detectOptionalRuntimeBindings(`
      const oceanColor = '#036'
    `).ocean).toBe(false)
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
})
