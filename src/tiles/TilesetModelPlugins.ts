import * as THREE from 'three'
import type { GLTFLoaderPlugin, GLTFParser } from 'three/addons/loaders/GLTFLoader.js'
import { TilesRenderer } from '3d-tiles-renderer'
import {
  applyBasicMaterialToObject,
  applyMaterialModeToObject,
  type RenderMaterialMode
} from '../materials/materialMode'
import type { SurfaceMaterialMode } from '../types'

export interface TileModelPlugin {
  processTileModel: (scene: THREE.Object3D) => void
}

export type ResolvedSurfaceMaterialMode = Exclude<SurfaceMaterialMode, 'auto'>
export type SceneTilesetMaterialMode = RenderMaterialMode

export type TileModelProcessingOptions = {
  creasedNormals?: boolean
}

const KHR_MATERIALS_UNLIT = 'KHR_materials_unlit'

type MaterialParams = Record<string, unknown>

type UnlitCompatibilityPlugin = GLTFLoaderPlugin & {
  extendParams(materialParams: MaterialParams, materialDef: Record<string, any>, parser: GLTFParser): Promise<unknown[]>
}

export function createMaterialsUnlitCompatibilityPlugin(parser: GLTFParser): GLTFLoaderPlugin {
  const unlitExtension: UnlitCompatibilityPlugin = {
    name: KHR_MATERIALS_UNLIT,
    getMaterialType: () => THREE.MeshBasicMaterial,
    extendParams(materialParams, materialDef, gltfParser) {
      const pending: Promise<unknown>[] = []
      const metallicRoughness = materialDef.pbrMetallicRoughness

      materialParams.color = new THREE.Color(1, 1, 1)
      materialParams.opacity = 1

      if (metallicRoughness) {
        if (Array.isArray(metallicRoughness.baseColorFactor)) {
          const color = materialParams.color as THREE.Color
          color.setRGB(
            metallicRoughness.baseColorFactor[0],
            metallicRoughness.baseColorFactor[1],
            metallicRoughness.baseColorFactor[2],
            THREE.LinearSRGBColorSpace
          )
          materialParams.opacity = metallicRoughness.baseColorFactor[3]
        }

        if (metallicRoughness.baseColorTexture) {
          pending.push(gltfParser.assignTexture(materialParams, 'map', metallicRoughness.baseColorTexture, THREE.SRGBColorSpace))
        }
      }

      return Promise.all(pending)
    }
  }

  return {
    name: 'TELLUX_materials_unlit_compatibility',
    beforeRoot() {
      const hasUnlitMaterial = (parser.json.materials ?? []).some((material: Record<string, any>) => {
        return Boolean(material.extensions?.[KHR_MATERIALS_UNLIT])
      })

      if (hasUnlitMaterial && !parser.extensions[KHR_MATERIALS_UNLIT]) {
        parser.extensions[KHR_MATERIALS_UNLIT] = unlitExtension
      }

      return null
    }
  }
}

export class TileUnlitMaterialPlugin implements TileModelPlugin {
  readonly priority = -10

  processTileModel(tileScene: THREE.Object3D) {
    applyBasicMaterialToObject(tileScene)
  }
}

export class SceneTilesetMaterialPlugin implements TileModelPlugin {
  readonly priority = -10

  constructor(private currentMode: SceneTilesetMaterialMode) {}

  processTileModel(tileScene: THREE.Object3D) {
    applyMaterialModeToObject(tileScene, this.currentMode)
  }

  setMode(mode: SceneTilesetMaterialMode, tileset: TilesRenderer) {
    if (this.currentMode === mode) return

    this.currentMode = mode
    tileset.forEachLoadedModel((tileScene) => {
      applyMaterialModeToObject(tileScene, this.currentMode)
    })
    tileset.dispatchEvent({ type: 'needs-render' })
  }
}

export class SurfaceMaterialPlugin implements TileModelPlugin {
  readonly priority = -20

  constructor(private currentMode: ResolvedSurfaceMaterialMode) {}

  processTileModel(tileScene: THREE.Object3D) {
    this.applyToScene(tileScene)
  }

  setMode(mode: ResolvedSurfaceMaterialMode, tileset: TilesRenderer) {
    if (this.currentMode === mode) return

    this.currentMode = mode
    tileset.forEachLoadedModel((tileScene) => {
      this.applyToScene(tileScene)
    })
    tileset.dispatchEvent({ type: 'needs-render' })
  }

  private applyToScene(tileScene: THREE.Object3D) {
    applyMaterialModeToObject(tileScene, this.currentMode)
  }
}
