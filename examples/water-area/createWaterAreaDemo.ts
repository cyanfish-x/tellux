import type { TilesetLayer, Viewer } from '../../src'

import { WaterAreaTilesOverlay } from './WaterAreaImageOverlay'
import { WaterAreaMaterialPlugin } from './WaterAreaMaterialPlugin'
import { WaterAreaOverlayPlugin } from './WaterAreaOverlayPlugin'
import type {
  WaterAreaAppearance,
  WaterAreaAppearanceOptions
} from './WaterAreaAppearance'
import { createWaterAreaNormalTextures } from './WaterAreaNormalTexture'
import { WaterAreaReflectionCanvasPreview } from './WaterAreaReflectionCanvasPreview'
import type {
  WaterAreaOptics,
  WaterAreaOpticsOptions
} from './WaterAreaOptics'
import {
  createWaterAreaWaveFrame,
  resolveWaterAreaWaveOrigin
} from './WaterAreaWaveFrame'
import { disposeWaterAreaWorkerPool } from './worker/pool'

export interface CreateWaterAreaDemoOptions {
  viewer: Viewer
  apiToken: string
  assetId?: number
  id?: string
  show?: boolean
  appearance?: WaterAreaAppearanceOptions
  optics?: WaterAreaOpticsOptions
  waveOrigin?: {
    longitude: number
    latitude: number
  }
}

export interface WaterAreaDemo {
  layer: TilesetLayer
  show: boolean
  appearance: WaterAreaAppearance
  optics: WaterAreaOptics
  dispose(): Promise<void>
}

export function createWaterAreaDemo({
  viewer,
  apiToken,
  assetId = 2275207,
  id = 'water-area-google-photorealistic',
  show,
  appearance = {},
  optics = {},
  waveOrigin
}: CreateWaterAreaDemoOptions): WaterAreaDemo {
  const previewContainer = viewer.renderer.domElement.parentElement
  if (!previewContainer || viewer.rendererType !== 'webgpu') {
    throw new Error(
      'Water Area reflection preview requires the WebGPU viewer container.'
    )
  }
  const resolvedWaveOrigin = resolveWaterAreaWaveOrigin(
    waveOrigin,
    viewer.camera.getState()
  )
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

  layer.tileset.registerPlugin(materialPlugin)
  layer.tileset.registerPlugin(overlayPlugin)
  viewer.scene.threeScene.add(materialPlugin.optics.reflectionTarget)
  materialPlugin.optics.setReflectionDebugPreview(
    new WaterAreaReflectionCanvasPreview(
      viewer.renderer,
      previewContainer,
      materialPlugin.optics.sampleReflection(
        materialPlugin.optics.reflectionNode.uvNode
      )
    )
  )

  let disposed = false
  return {
    layer,
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
      layer.remove()
      materialPlugin.dispose()
      await disposeWaterAreaWorkerPool()
    }
  }
}
