import { describe, expect, it } from 'vitest'

import {
  detectOptionalRuntimeBindings,
  WATER_AREA_RUNTIME_BINDING_NAMES
} from './runtime-bindings'

describe('Sandcastle optional runtime bindings', () => {
  it('keeps ordinary examples on the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      import tellux from "../src"
      const viewer = new tellux.Viewer(document.body)
    `)).toEqual({
      gaussianSplat: false,
      hism: false,
      tree: false,
      waterArea: false
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

  it('detects the water-area helper without widening the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      const demo = await createWaterAreaDemo({ viewer, apiToken })
    `).waterArea).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const water = { area: 128 }
    `).waterArea).toBe(false)
  })

  it('injects every runtime value imported by the water-area example', () => {
    expect(WATER_AREA_RUNTIME_BINDING_NAMES).toEqual([
      'createWaterAreaDemo',
      'DEFAULT_WATER_AREA_APPEARANCE',
      'normalizeWaterAreaAppearance',
      'DEFAULT_WATER_AREA_OPTICS',
      'normalizeWaterAreaOptics',
      'DEFAULT_WATER_AREA_WAVE_ORIGIN'
    ])

    expect(detectOptionalRuntimeBindings(`
      const origin = DEFAULT_WATER_AREA_WAVE_ORIGIN
      const optics = normalizeWaterAreaOptics(DEFAULT_WATER_AREA_OPTICS)
    `).waterArea).toBe(true)
  })

  it('does not confuse generic shared helpers with HISM helpers', () => {
    expect(detectOptionalRuntimeBindings(`
      import { exampleMapServiceConfig } from "./shared"
      setupExamplePanels()
    `).hism).toBe(false)
  })
})
