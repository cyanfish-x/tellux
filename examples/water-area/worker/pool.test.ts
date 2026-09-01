import { describe, expect, it } from 'vitest'

import { WATER_AREA_WORKER_POOL_OPTIONS } from './pool'

describe('water-area worker pool configuration', () => {
  it('matches the Takram worker concurrency and scheduling policy', () => {
    expect(WATER_AREA_WORKER_POOL_OPTIONS).toMatchObject({
      maxWorkers: 8,
      queueStrategy: 'lifo',
      workerOpts: {
        type: 'module'
      }
    })
  })
})
