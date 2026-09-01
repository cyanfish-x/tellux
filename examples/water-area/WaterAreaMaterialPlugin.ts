import {
  Mesh,
  type Color,
  type Material,
  type Object3D,
  type Texture
} from 'three'
import type { TilesRenderer } from '3d-tiles-renderer'

import {
  WaterAreaEffect,
  WaterAreaNodeMaterial
} from './WaterAreaNodeMaterial'
import type { WaterAreaAppearanceOptions } from './WaterAreaAppearance'
import type { WaterAreaNormalTextures } from './WaterAreaNormalTexture'
import type { WaterAreaOpticsOptions } from './WaterAreaOptics'
import type { WaterAreaWaveFrame } from './WaterAreaWaveFrame'

type BaseColorMaterialState = Material & {
  color?: Color
  map?: Texture | null
  alphaMap?: Texture | null
  vertexColors?: boolean
}

function replaceMaterial(
  source: Material,
  replacements: Map<Material, WaterAreaNodeMaterial>,
  waterAreaEffect: WaterAreaEffect
): WaterAreaNodeMaterial {
  const existing = replacements.get(source)
  if (existing) return existing

  const sourceMaterial = source as BaseColorMaterialState
  const material = new WaterAreaNodeMaterial(waterAreaEffect)
  material.name = source.name
  if (sourceMaterial.color?.isColor) {
    material.color.copy(sourceMaterial.color)
  }
  material.map = sourceMaterial.map ?? null
  material.alphaMap = sourceMaterial.alphaMap ?? null
  material.opacity = source.opacity
  material.transparent = source.transparent
  material.alphaTest = source.alphaTest
  material.side = source.side
  material.depthTest = source.depthTest
  material.depthWrite = source.depthWrite
  material.colorWrite = source.colorWrite
  material.vertexColors = sourceMaterial.vertexColors ?? false
  material.visible = source.visible
  material.toneMapped = source.toneMapped
  material.needsUpdate = true

  replacements.set(source, material)
  source.dispose()
  return material
}

export class WaterAreaMaterialPlugin {
  readonly name = 'TELLUX_WATER_AREA_MATERIAL_PLUGIN'
  readonly priority = -1000
  private readonly waterAreaEffect: WaterAreaEffect

  constructor(
    options: WaterAreaAppearanceOptions = {},
    waveFrame?: WaterAreaWaveFrame,
    normalTextures?: WaterAreaNormalTextures,
    opticsOptions: WaterAreaOpticsOptions = {}
  ) {
    this.waterAreaEffect = new WaterAreaEffect(
      options,
      waveFrame,
      normalTextures,
      opticsOptions
    )
  }

  get appearance(): WaterAreaEffect {
    return this.waterAreaEffect
  }

  get optics() {
    return this.waterAreaEffect.optics
  }

  get show(): boolean {
    return this.waterAreaEffect.show
  }

  set show(value: boolean) {
    this.waterAreaEffect.show = value
  }

  init(tiles: TilesRenderer): void {
    tiles.forEachLoadedModel((scene) => this.processTileModel(scene))
  }

  processTileModel(scene: Object3D): void {
    const replacements = new Map<Material, WaterAreaNodeMaterial>()
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) return

      object.material = Array.isArray(object.material)
        ? object.material.map((material) =>
            replaceMaterial(material, replacements, this.waterAreaEffect)
          )
        : replaceMaterial(
            object.material,
            replacements,
            this.waterAreaEffect
          )
    })
  }

  dispose(): void {
    this.waterAreaEffect.dispose()
  }
}
