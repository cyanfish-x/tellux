import type { TilesRenderer } from '3d-tiles-renderer'
import type { Viewer } from '../../src'

import { WaterAreaTilesOverlay } from './WaterAreaImageOverlay'
import { WaterAreaMaterialPlugin } from './WaterAreaMaterialPlugin'
import { WaterAreaOverlayPlugin } from './WaterAreaOverlayPlugin'
import type {
  WaterAreaAppearance,
  WaterAreaAppearanceOptions
} from './WaterAreaAppearance'
import { createWaterAreaNormalTextures } from './WaterAreaNormalTexture'
import type {
  WaterAreaOptics,
  WaterAreaOpticsOptions
} from './WaterAreaOptics'
import {
  createWaterAreaWaveFrame,
  resolveWaterAreaWaveOrigin
} from './WaterAreaWaveFrame'
import { disposeWaterAreaWorkerPool } from './worker/pool'
import { CESIUM_ION_WORLD_TERRAIN_ASSET_ID } from '../map-sources.config'

export const WATER_AREA_ION_TERRAIN_ASSET_ID = CESIUM_ION_WORLD_TERRAIN_ASSET_ID
export const WATER_AREA_ION_IMAGERY_ASSET_ID =
  import.meta.env.VITE_CESIUM_ION_IMAGERY_ASSET_ID ?? '2'
export const WATER_AREA_IMAGERY_LAYER_ID = 'water-area-ion-imagery'

export interface CreateWaterAreaDemoOptions {
  viewer: Viewer
  apiToken: string
  show?: boolean
  appearance?: WaterAreaAppearanceOptions
  optics?: WaterAreaOpticsOptions
  waveOrigin?: {
    longitude: number
    latitude: number
  }
}

export interface WaterAreaDemo {
  tileset: TilesRenderer
  show: boolean
  appearance: WaterAreaAppearance
  optics: WaterAreaOptics
  dispose(): Promise<void>
}

export function configureWaterAreaMap(viewer: Viewer, apiToken: string): void {
  viewer.overlays.removeAll()
  viewer.overlays.add({
    id: WATER_AREA_IMAGERY_LAYER_ID,
    name: 'Cesium Ion Imagery',
    source: {
      type: 'cesium-ion',
      apiToken,
      assetId: WATER_AREA_ION_IMAGERY_ASSET_ID
    }
  })
  viewer.terrain.set({
    type: 'cesium-ion',
    assetId: WATER_AREA_ION_TERRAIN_ASSET_ID,
    apiToken,
    tileLoading: {
      enableTileSplitting: true
    }
  })
}

export function createWaterAreaDemo({
  viewer,
  apiToken,
  show,
  appearance = {},
  optics = {},
  waveOrigin
}: CreateWaterAreaDemoOptions): WaterAreaDemo {
  if (viewer.renderer.type !== 'webgpu') {
    throw new Error('Water Area requires a WebGPU viewer.')
  }

  configureWaterAreaMap(viewer, apiToken)

  const tileset = viewer.globe.raw
  const resolvedWaveOrigin = resolveWaterAreaWaveOrigin(
    waveOrigin,
    viewer.camera.getState().destination
  )
  const overlay = new WaterAreaTilesOverlay()
  const materialPlugin = new WaterAreaMaterialPlugin(
    {
      ...appearance,
      show: show ?? appearance.show
    },
    createWaterAreaWaveFrame(
      resolvedWaveOrigin.longitude,
      resolvedWaveOrigin.latitude
    ),
    createWaterAreaNormalTextures(),
    optics
  )
  const overlayPlugin = new WaterAreaOverlayPlugin({
    overlays: [overlay],
    enableTileSplitting: false
  })

  tileset.registerPlugin(materialPlugin)
  tileset.registerPlugin(overlayPlugin)

  let disposed = false
  return {
    tileset,
    appearance: materialPlugin.appearance,
    optics: materialPlugin.optics,
    get show(): boolean {
      return materialPlugin.show
    },
    set show(value: boolean) {
      materialPlugin.show = value
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      tileset.unregisterPlugin(overlayPlugin)
      tileset.unregisterPlugin(materialPlugin)
      await disposeWaterAreaWorkerPool()
    }
  }
}
