/**
 * Internal traversal counters used by the HISM picking benchmark.
 */
export interface HismPickTraversalStats {
  visibleClusters: number
  visibleInstances: number
  candidateClusters: number
  candidateInstances: number
  candidateMeshes: number
  visitedClusters: number
  testedMeshInstances: number
  instanceBoundsHits: number
}

export function createHismPickTraversalStats(): HismPickTraversalStats {
  return {
    visibleClusters: 0,
    visibleInstances: 0,
    candidateClusters: 0,
    candidateInstances: 0,
    candidateMeshes: 0,
    visitedClusters: 0,
    testedMeshInstances: 0,
    instanceBoundsHits: 0
  }
}

export function resetHismPickTraversalStats(stats: HismPickTraversalStats) {
  stats.visibleClusters = 0
  stats.visibleInstances = 0
  stats.candidateClusters = 0
  stats.candidateInstances = 0
  stats.candidateMeshes = 0
  stats.visitedClusters = 0
  stats.testedMeshInstances = 0
  stats.instanceBoundsHits = 0
}
