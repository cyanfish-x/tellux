import type { TilesetLayer, Viewer } from '../../src'

import { WaterAreaTilesOverlay } from './WaterAreaImageOverlay'
import { WaterAreaMaterialPlugin } from './WaterAreaMaterialPlugin'
import { WaterAreaOverlayPlugin } from './WaterAreaOverlayPlugin'
import type {
  WaterAreaAppearance,
  WaterAreaAppearanceOptions
} from './WaterAreaAppearance'
import { createWaterAreaNormalTextures } from './WaterAreaNormalTexture'
import {
  DEFAULT_WATER_AREA_WAVE_ORIGIN,
  createWaterAreaWaveFrame
} from './WaterAreaWaveFrame'
import { disposeWaterAreaWorkerPool } from './worker/pool'

export interface CreateWaterAreaDemoOptions {
  viewer: Viewer
  apiToken: string
  assetId?: number
  id?: string
  show?: boolean
  appearance?: WaterAreaAppearanceOptions
  waveOrigin?: {
    longitude: number
    latitude: number
  }
}

export interface WaterAreaDemo {
  layer: TilesetLayer
  show: boolean
  appearance: WaterAreaAppearance
  dispose(): Promise<void>
}

export function createWaterAreaDemo({
  viewer,
  apiToken,
  assetId = 2275207,
  id = 'water-area-google-photorealistic',
  show,
  appearance = {},
  waveOrigin = DEFAULT_WATER_AREA_WAVE_ORIGIN
}: CreateWaterAreaDemoOptions): WaterAreaDemo {
  const layer = viewer.load3DTileset({
    type: 'cesium-ion',
    id,
    assetId,
    apiToken,
    creasedNormals: true
  })
  const overlay = new WaterAreaTilesOverlay()
  const materialPlugin = new WaterAreaMaterialPlugin(
    {
      ...appearance,
      show: show ?? appearance.show
    },
    createWaterAreaWaveFrame(
      waveOrigin.longitude,
      waveOrigin.latitude
    ),
    createWaterAreaNormalTextures()
  )
  const overlayPlugin = new WaterAreaOverlayPlugin({
    overlays: [overlay],
    enableTileSplitting: false
  })

  layer.tileset.registerPlugin(materialPlugin)
  layer.tileset.registerPlugin(overlayPlugin)

  let disposed = false
  return {
    layer,
    appearance: materialPlugin.appearance,
    get show(): boolean {
      return materialPlugin.show
    },
    set show(value: boolean) {
      materialPlugin.show = value
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      layer.remove()
      materialPlugin.dispose()
      await disposeWaterAreaWorkerPool()
    }
  }
}
