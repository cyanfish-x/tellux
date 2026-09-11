import { describe, expect, it } from 'vitest'

import {
  GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES,
  detectOptionalRuntimeBindings,
  LOCAL_MEADOW_RUNTIME_BINDING_NAMES,
  THREEJS_INTEROP_RUNTIME_BINDING_NAMES,
  WATER_AREA_RUNTIME_BINDING_NAMES
} from './runtime-bindings'

describe('Sandcastle optional runtime bindings', () => {
  it('detects every Gaussian runtime import, including standalone Spark and ion', () => {
    for (const name of GAUSSIAN_SPLAT_RUNTIME_BINDING_NAMES) {
      expect(detectOptionalRuntimeBindings(`new ${name}()` ).gaussianSplat).toBe(true)
    }
    expect(detectOptionalRuntimeBindings('const SparkRendererOptions = {}').gaussianSplat).toBe(false)
  })
  it('keeps ordinary examples on the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      import tellux from "../src"
      const viewer = new tellux.Viewer(document.body)
    `)).toEqual({
      gaussianSplat: false,
      hism: false,
      tree: false,
      waterArea: false,
      threejsInterop: false,
      localMeadow: false,
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
      'setupWaterAreaPanel',
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

  it('injects every runtime value imported by the threejs-interop example', () => {
    expect(THREEJS_INTEROP_RUNTIME_BINDING_NAMES).toEqual([
      'isNightLightsOn',
      'computeSunAltitudeAtLocation',
      'setupLittlestTokyoNightRig',
      'EMISSIVE_TEXTURE_URL',
    ])
  })

  it('detects the threejs-interop helper without widening the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      const rig = setupLittlestTokyoNightRig(model.root, emissiveMap)
    `).threejsInterop).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const altitude = computeSunAltitudeAtLocation(lon, lat, date)
    `).threejsInterop).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const url = EMISSIVE_TEXTURE_URL
    `).threejsInterop).toBe(true)
  })

  it('detects the local-meadow Grass / OrbitControls bindings without widening the base runner graph', () => {
    expect(detectOptionalRuntimeBindings(`
      const meadow = new Grass()
    `).localMeadow).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const orbit = new OrbitControls(camera, dom)
    `).localMeadow).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const meadowRtc = createMeadowRtc(camera)
    `).localMeadow).toBe(true)

    expect(detectOptionalRuntimeBindings(`
      const meadow = { density: 36 }
    `).localMeadow).toBe(false)
  })

  it('injects every runtime value imported by the local-meadow example', () => {
    expect(LOCAL_MEADOW_RUNTIME_BINDING_NAMES).toEqual([
      'Grass',
      'OrbitControls',
      'applyMeadowRtc',
      'createMeadowRtc',
      'setMeadowRtcOrigin',
    ])
  })

  it('does not confuse generic shared helpers with HISM helpers', () => {
    expect(detectOptionalRuntimeBindings(`
      import { exampleMapServiceConfig } from "./shared"
      setupExamplePanels()
    `).hism).toBe(false)
  })
})
