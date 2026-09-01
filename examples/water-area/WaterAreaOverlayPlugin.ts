import { ImageOverlayPlugin } from '3d-tiles-renderer/plugins'
import {
  Mesh,
  type Color,
  type Object3D,
  type Texture
} from 'three'
import type { NodeMaterial } from 'three/webgpu'

import { wrapWaterAreaNodeMaterial } from './wrapWaterAreaNodeMaterial'
import { WaterAreaTilesOverlay } from './WaterAreaImageOverlay'

interface ImageOverlayState {
  color: Color
  opacity: number
  alphaMask: boolean
  alphaInvert: boolean
}

export interface WaterAreaOverlayParams {
  layerMaps: { value: Array<Texture | null> }
  layerInfo: { value: ImageOverlayState[] }
}

export interface WaterAreaOverlayPluginOptions {
  overlays: WaterAreaTilesOverlay[]
  enableTileSplitting?: boolean
}

type OverlayPluginInternals = {
  meshParams: WeakMap<Mesh, WaterAreaOverlayParams>
}

export class WaterAreaOverlayPlugin extends ImageOverlayPlugin {
  private readonly waterAreaOverlays: WaterAreaTilesOverlay[]

  constructor(options: WaterAreaOverlayPluginOptions) {
    super(
      { ...options, resolution: 128 } as unknown as ConstructorParameters<
        typeof ImageOverlayPlugin
      >[0]
    )
    this.waterAreaOverlays = (options.overlays ?? []).filter(
      (overlay): overlay is WaterAreaTilesOverlay =>
        overlay instanceof WaterAreaTilesOverlay
    )
  }

  _wrapMaterials(scene: Object3D): void {
    const meshParams = (this as unknown as OverlayPluginInternals).meshParams
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const params = wrapWaterAreaNodeMaterial(
        object.material as NodeMaterial | NodeMaterial[],
        object
      )
      meshParams.set(object, params)
    })
  }

  async processTileModel(scene: Object3D, tile: unknown): Promise<void> {
    await (
      ImageOverlayPlugin.prototype as unknown as {
        processTileModel(
          this: ImageOverlayPlugin,
          scene: Object3D,
          tile: unknown
        ): Promise<void>
      }
    ).processTileModel.call(this, scene, tile)
  }

  dispose(): void {
    ;(
      ImageOverlayPlugin.prototype as unknown as {
        dispose(this: ImageOverlayPlugin): void
      }
    ).dispose.call(this)
    for (const overlay of this.waterAreaOverlays) overlay.dispose()
  }
}
