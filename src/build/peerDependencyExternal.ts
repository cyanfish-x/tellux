export const EXTERNAL_PACKAGE_ROOTS = [
  '3d-tiles-renderer',
  '@takram/three-atmosphere',
  '@takram/three-clouds',
  '@takram/three-geospatial',
  '@takram/three-geospatial-effects',
  'postprocessing',
  'three'
] as const

function matchesPackageRoot(id: string, packageRoot: string) {
  return id === packageRoot || id.startsWith(`${packageRoot}/`)
}

/**
 * 判断模块 specifier 是否属于必须由宿主提供的 peer 依赖。
 *
 * Determines whether a module specifier belongs to a peer dependency that
 * must be provided by the host application.
 */
export function isPeerDependencyExternal(id: string) {
  return EXTERNAL_PACKAGE_ROOTS.some((packageRoot) => matchesPackageRoot(id, packageRoot))
}

/**
 * 检查 Rollup chunk 的模块 id 是否来自本应 external 的 peer 包。
 *
 * Checks whether a Rollup chunk module id comes from a peer package that
 * should have remained external.
 */
export function isBundledExternalModule(moduleId: string) {
  const normalizedId = moduleId.replace(/\\/g, '/')

  return EXTERNAL_PACKAGE_ROOTS.some((packageRoot) => {
    const marker = `/node_modules/${packageRoot}`
    const markerIndex = normalizedId.lastIndexOf(marker)
    if (markerIndex === -1) return false

    const boundary = normalizedId[markerIndex + marker.length]
    return boundary === undefined || boundary === '/' || boundary === '?'
  })
}
