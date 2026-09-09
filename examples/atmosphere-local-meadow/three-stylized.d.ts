declare module "three-stylized" {
  import type { ColorRepresentation, DirectionalLight, Group } from "three"

  export class Grass extends Group {
    constructor(options?: Record<string, unknown>)
    readonly options: {
      terrain: {
        terrainDegree: number
        groundColor: ColorRepresentation
      }
      grass: {
        density: number
        brightness: number
        blade: { maxHeight: number }
        wind: { strength: number; speed: number; direction: number }
        colors: { bottom: ColorRepresentation; top: ColorRepresentation }
      }
      wildflowers: { enabled: boolean; density: number }
    }
    setOptions(options: Record<string, unknown>): void
    update(timeSeconds: number): void
    syncDirectionalLight(light: DirectionalLight): void
    dispose(): void
  }
}

