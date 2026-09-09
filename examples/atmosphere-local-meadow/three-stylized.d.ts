declare module "three-stylized" {
  import type { DirectionalLight, Group } from "three"

  export class Grass extends Group {
    constructor(options?: Record<string, unknown>)
    update(timeSeconds: number): void
    syncDirectionalLight(light: DirectionalLight): void
    dispose(): void
  }
}
