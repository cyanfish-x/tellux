import tellux, { type TerrainOptions, type Viewer } from '../../src'
import { arcgisWorldImageryUrl, defaultTerrainUrl } from '../shared'
import { OceanManager } from './OceanManager'
import { createDefaultOceanParameters, type OceanParameters } from './parameters'
import { RIYUE_BAY_PRESET } from './RiyueBayPreset'

export interface CreateRiyueBayOceanDemoOptions {
  parameters?: Partial<OceanParameters>
  onStatus?: (message: string) => void
}

export interface RiyueBayOceanDemo {
  viewer: Viewer
  ocean: OceanManager
  parameters: OceanParameters
  destroy(): void
}

export async function createRiyueBayOceanDemo(
  container: HTMLElement | string,
  options: CreateRiyueBayOceanDemoOptions = {}
): Promise<RiyueBayOceanDemo> {
  if (!(navigator as Navigator & { gpu?: unknown }).gpu) {
    throw new Error('WebGPU is unavailable. Enable WebGPU in a desktop Chrome build and reload this example.')
  }
  const terrain = createRiyueBayTerrainOptions()
  if (!terrain) {
    throw new Error(
      'Riyue Bay terrain is not configured. Set VITE_CESIUM_TERRAIN_URL or VITE_CESIUM_ION_TOKEN.'
    )
  }
  const viewer = await tellux.Viewer.create(container, {
    renderer: { type: 'webgpu', antialias: true, samples: 4 },
    terrain,
    layers: [{
      source: { type: 'xyz', url: arcgisWorldImageryUrl, levels: 19 }
    }],
    camera: {
      ...RIYUE_BAY_PRESET.camera,
      near: 0.25,
      far: 100_000,
      fov: 58
    },
    scene: {
      atmosphere: { show: false },
      clouds: { show: false },
      fallbackAmbientLight: { intensity: 0 }
    }
  })

  try {
    options.onStatus?.('Calibrating the terrain vertical datum from beach samples…')
    const calibratedSeaLevel = await calibrateSeaLevel(viewer)
    const parameters = Object.assign(createDefaultOceanParameters(), options.parameters)
    const ocean = new OceanManager({
      viewer,
      calibratedSeaLevel,
      parameters,
      onStatus: options.onStatus
    })
    options.onStatus?.(`Sea-level datum calibrated at ${calibratedSeaLevel.toFixed(2)} m.`)
    let destroyed = false
    return {
      viewer,
      ocean,
      parameters,
      destroy() {
        if (destroyed) return
        destroyed = true
        ocean.dispose()
        viewer.destroy()
      }
    }
  } catch (error) {
    viewer.destroy()
    throw error
  }
}

function createRiyueBayTerrainOptions(): TerrainOptions | undefined {
  if (defaultTerrainUrl) {
    return {
      type: 'url',
      url: defaultTerrainUrl,
      tileLoading: { enableTileSplitting: true }
    }
  }
  const apiToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ''
  if (!apiToken) return undefined
  return {
    type: 'cesium-ion',
    assetId: import.meta.env.VITE_CESIUM_ION_TERRAIN_ASSET_ID ?? '1',
    apiToken,
    tileLoading: { enableTileSplitting: true }
  }
}

async function calibrateSeaLevel(viewer: Viewer) {
  const samples = await viewer.sampleHeightMostDetailed(
    RIYUE_BAY_PRESET.shorelineSeeds.map(([longitude, latitude]) => [longitude, latitude]),
    { source: 'terrain', resolution: 160, maxFrames: 120 }
  )
  const heights = samples
    .map((sample) => sample?.[2])
    .filter((height): height is number => Number.isFinite(height))
    .sort((left, right) => left - right)
  if (heights.length < 3) {
    throw new Error(`Terrain sea-level calibration returned only ${heights.length} valid beach samples.`)
  }
  const middle = Math.floor(heights.length / 2)
  return heights.length % 2 === 0
    ? (heights[middle - 1] + heights[middle]) * 0.5
    : heights[middle]
}

export { OceanManager } from './OceanManager'
export { RIYUE_BAY_PRESET } from './RiyueBayPreset'
export { OCEAN_PARAMETER_DEFINITIONS, createDefaultOceanParameters } from './parameters'
export { mountRiyueBayOceanControls } from './controls'
export type { OceanParameters, OceanQuality, OceanDebugField } from './parameters'
