import workerpool, {
  type Pool,
  type Promise as WorkerPoolPromise
} from 'workerpool'

import type {
  WaterAreaTileCoordinate,
  WaterAreaTileImageResult
} from './types'
import workerUrl from './worker?worker&url'

export const WATER_AREA_WORKER_POOL_OPTIONS = {
  maxWorkers: 8,
  queueStrategy: 'lifo' as const,
  workerOpts: {
    type: 'module' as const
  }
}

let pool: Pool | undefined

function getPool(): Pool {
  return (pool ??= workerpool.pool(
    workerUrl,
    WATER_AREA_WORKER_POOL_OPTIONS
  ))
}

export function queueWaterAreaTileTask(
  coordinate: WaterAreaTileCoordinate
): WorkerPoolPromise<WaterAreaTileImageResult> {
  return getPool().exec('computeWaterAreaTileImage', [coordinate])
}

export async function disposeWaterAreaWorkerPool(): Promise<void> {
  const activePool = pool
  pool = undefined
  await activePool?.terminate(true)
}
