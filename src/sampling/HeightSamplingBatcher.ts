import type { CartographicCoordinateTuple } from '../types'

export type HeightSamplingBatchableTask = {
  position: CartographicCoordinateTuple
}

export type HeightSamplingBatcherOptions = {
  maxBatchSize: number
  maxSpanDegrees: number
}

export class HeightSamplingBatcher {
  createBatches<T extends HeightSamplingBatchableTask>(
    tasks: T[],
    options: HeightSamplingBatcherOptions
  ) {
    const batches: T[][] = []
    const sortedTasks = tasks.slice().sort((a, b) => {
      const latitudeDelta = a.position[1] - b.position[1]
      return latitudeDelta === 0 ? a.position[0] - b.position[0] : latitudeDelta
    })
    let batch: T[] = []
    let minLongitude = Infinity
    let maxLongitude = -Infinity
    let minLatitude = Infinity
    let maxLatitude = -Infinity

    const flushBatch = () => {
      if (batch.length > 0) {
        batches.push(batch)
        batch = []
        minLongitude = Infinity
        maxLongitude = -Infinity
        minLatitude = Infinity
        maxLatitude = -Infinity
      }
    }

    sortedTasks.forEach((task) => {
      const nextMinLongitude = Math.min(minLongitude, task.position[0])
      const nextMaxLongitude = Math.max(maxLongitude, task.position[0])
      const nextMinLatitude = Math.min(minLatitude, task.position[1])
      const nextMaxLatitude = Math.max(maxLatitude, task.position[1])
      const exceedsSpan =
        batch.length > 0 &&
        (
          nextMaxLongitude - nextMinLongitude > options.maxSpanDegrees ||
          nextMaxLatitude - nextMinLatitude > options.maxSpanDegrees
        )
      const exceedsSize = batch.length >= options.maxBatchSize

      // 按空间连续性拆批，避免一个 batch 同时挂载跨度过大的 LoadRegion ray 集合。
      if (exceedsSpan || exceedsSize) {
        flushBatch()
      }

      batch.push(task)
      minLongitude = Math.min(minLongitude, task.position[0])
      maxLongitude = Math.max(maxLongitude, task.position[0])
      minLatitude = Math.min(minLatitude, task.position[1])
      maxLatitude = Math.max(maxLatitude, task.position[1])
    })
    flushBatch()

    return batches
  }
}
