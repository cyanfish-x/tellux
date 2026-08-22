import { XYZTilesOverlay } from '3d-tiles-renderer/plugins'

import {
  WaterAreaImageSource,
  type WaterAreaImageSourceOptions
} from './WaterAreaImageSource'

export class WaterAreaTilesOverlay extends XYZTilesOverlay {
  declare imageSource: WaterAreaImageSource

  constructor(options: WaterAreaImageSourceOptions = {}) {
    super({ ...options, url: '' })
    this.imageSource = new WaterAreaImageSource(options)
  }

  dispose(): void {
    this.imageSource.dispose()
  }
}
