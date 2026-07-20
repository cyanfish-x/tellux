import { describe, expect, it } from 'vitest'
import { collectHismRuntimeStats, createEmptyHismRuntimeStats } from '../../hism/runtime/HismRuntimeStats'
import type { HismLayerImpl } from '../../hism/core/HismLayer'

describe('HismRuntimeStats', () => {
  it('creates empty stats', () => {
    expect(createEmptyHismRuntimeStats()).toEqual({
      layerCount: 0,
      clusterCount: 0,
      totalInstances: 0,
      visibleInstances: 0,
      visibleClusters: 0,
      drawCalls: 0,
      activeLodCounts: {}
    })
  })

  it('aggregates layer stats', () => {
    const layer = {
      instanceCount: 100,
      visibleInstanceCount: 40,
      collectRuntimeStats: () => ({
        clusterCount: 5,
        visibleClusters: 2,
        drawCalls: 8,
        activeLodCounts: { '0': 2, '1': 1 }
      })
    } as unknown as HismLayerImpl

    expect(collectHismRuntimeStats([layer])).toEqual({
      layerCount: 1,
      clusterCount: 5,
      totalInstances: 100,
      visibleInstances: 40,
      visibleClusters: 2,
      drawCalls: 8,
      activeLodCounts: { '0': 2, '1': 1 }
    })
  })
})
