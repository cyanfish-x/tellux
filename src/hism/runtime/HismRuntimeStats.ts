import type { HismLayerImpl } from '../core/HismLayer'
import type { HismRuntimeStats } from '../../types/hism'

export function createEmptyHismRuntimeStats(): HismRuntimeStats {
  return {
    layerCount: 0,
    clusterCount: 0,
    totalInstances: 0,
    visibleInstances: 0,
    visibleClusters: 0,
    drawCalls: 0,
    activeLodCounts: {}
  }
}

/**
 * 汇总 HISM 运行时统计，供 demo 与性能面板使用。
 *
 * Aggregates HISM runtime statistics for demos and performance panels.
 */
export function collectHismRuntimeStats(
  layers: Iterable<HismLayerImpl>
): HismRuntimeStats {
  const stats = createEmptyHismRuntimeStats()

  for (const layer of layers) {
    stats.layerCount += 1
    stats.totalInstances += layer.instanceCount
    stats.visibleInstances += layer.visibleInstanceCount

    const layerStats = layer.collectRuntimeStats()
    stats.clusterCount += layerStats.clusterCount
    stats.visibleClusters += layerStats.visibleClusters
    stats.drawCalls += layerStats.drawCalls

    for (const [lodIndex, count] of Object.entries(layerStats.activeLodCounts)) {
      stats.activeLodCounts[lodIndex] =
        (stats.activeLodCounts[lodIndex] ?? 0) + count
    }
  }

  return stats
}
