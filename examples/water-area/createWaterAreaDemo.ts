import type { TilesetLayer, Viewer } from '../../src'

import { WaterAreaTilesOverlay } from './WaterAreaImageOverlay'
import { WaterAreaMaterialPlugin } from './WaterAreaMaterialPlugin'
import { WaterAreaOverlayPlugin } from './WaterAreaOverlayPlugin'
import { disposeWaterAreaWorkerPool } from './worker/pool'

export interface CreateWaterAreaDemoOptions {
  viewer: Viewer
  apiToken: string
  assetId?: number
  id?: string
  show?: boolean
}

export interface WaterAreaDemo {
  layer: TilesetLayer
  show: boolean
  dispose(): Promise<void>
}

export function createWaterAreaDemo({
  viewer,
  apiToken,
  assetId = 2275207,
  id = 'water-area-google-photorealistic',
  show = true
}: CreateWaterAreaDemoOptions): WaterAreaDemo {
  const layer = viewer.load3DTileset({
    type: 'cesium-ion',
    id,
    assetId,
    apiToken,
    creasedNormals: true
  })
  const overlay = new WaterAreaTilesOverlay()
  const materialPlugin = new WaterAreaMaterialPlugin()
  materialPlugin.show = show
  const overlayPlugin = new WaterAreaOverlayPlugin({
    overlays: [overlay],
    enableTileSplitting: false
  })

  layer.tileset.registerPlugin(materialPlugin)
  layer.tileset.registerPlugin(overlayPlugin)

  let disposed = false
  return {
    layer,
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
      await disposeWaterAreaWorkerPool()
    }
  }
}
