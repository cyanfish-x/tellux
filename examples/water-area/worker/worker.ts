import workerpool from 'workerpool'

import { computeWaterAreaTileImage } from './tasks/computeWaterAreaTileImage'

export const methods = {
  computeWaterAreaTileImage
}

workerpool.worker(methods)
