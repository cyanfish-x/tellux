declare module '3d-tiles-renderer/src/three/plugins/images/utils/TilingScheme.js' {
  export class TilingScheme {
    flipY: boolean
    setProjection(projection: unknown): void
    generateLevels(levels: number, rootTileX: number, rootTileY: number, options?: object): void
    getContentBounds(normalized?: boolean): number[]
    getTileBounds(x: number, y: number, level: number, normalized?: boolean, clamp?: boolean): number[]
    readonly maxLevel: number
  }
}

declare module '3d-tiles-renderer/src/three/plugins/images/utils/ProjectionScheme.js' {
  export class ProjectionScheme {
    constructor(scheme?: string)
    setScheme(scheme: string): void
    readonly tileCountX: number
    readonly tileCountY: number
  }
}
