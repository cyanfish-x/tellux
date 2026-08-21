import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { min, positionWorld, texture, uniform, vec2, vec4 } from 'three/tsl'
import type { Viewer } from '../../src'
import { RIYUE_BAY_PRESET } from './RiyueBayPreset'
import type { TerrainFieldTextures } from './TerrainFieldTextures'

export class TerrainOceanMaskAdapter {
  private readonly inverseOceanMatrix = uniform(new THREE.Matrix4())
  private readonly unregister: () => void

  constructor(viewer: Viewer, oceanRoot: THREE.Object3D, field: TerrainFieldTextures) {
    oceanRoot.updateMatrixWorld(true)
    this.inverseOceanMatrix.value.copy(oceanRoot.matrixWorld).invert()
    this.unregister = viewer.terrain.addMaterialDecorator(({ material }) => {
      const materials = Array.isArray(material) ? material : [material]
      const decorated = materials.map((source) => this.decorateMaterial(source, field))
      return {
        material: Array.isArray(material) ? decorated : decorated[0],
        dispose: () => decorated.forEach((entry) => entry.dispose())
      }
    })
  }

  updateMatrix(oceanRoot: THREE.Object3D) {
    oceanRoot.updateMatrixWorld(true)
    this.inverseOceanMatrix.value.copy(oceanRoot.matrixWorld).invert()
  }

  dispose() {
    this.unregister()
  }

  private decorateMaterial(source: THREE.Material, field: TerrainFieldTextures) {
    const material = new MeshStandardNodeMaterial()
    copyTerrainMaterialProperties(source, material)
    const extent = RIYUE_BAY_PRESET.extent
    const local = this.inverseOceanMatrix.mul(vec4(positionWorld, 1)).xyz
    const fieldUv = vec2(
      local.x.sub(extent.crossShoreMin).div(extent.crossShoreMax - extent.crossShoreMin),
      local.z.sub(extent.alongshoreMin).div(extent.alongshoreMax - extent.alongshoreMin)
    )
    const outside = fieldUv.x.lessThan(0).or(fieldUv.x.greaterThan(1))
      .or(fieldUv.y.lessThan(0)).or(fieldUv.y.greaterThan(1))
    const valid = texture(field.validity, fieldUv).r.greaterThan(0.5)
    const crossShoreEdge = min(fieldUv.x, fieldUv.x.oneMinus())
      .mul(extent.crossShoreMax - extent.crossShoreMin)
    const alongshoreEdge = min(fieldUv.y, fieldUv.y.oneMinus())
      .mul(extent.alongshoreMax - extent.alongshoreMin)
    const domainOverlap = min(crossShoreEdge, alongshoreEdge).lessThan(64)
    // Keep a narrow overlap under the generated water so rasterization and
    // fragment-mask sampling cannot expose a black one-cell crack at the shore.
    const landOrShoreOverlap = texture(field.shoreSdf, fieldUv).r.greaterThan(-24)
    material.maskNode = outside.or(valid.not()).or(domainOverlap).or(landOrShoreOverlap)
    return material
  }
}

function copyTerrainMaterialProperties(source: THREE.Material, target: MeshStandardNodeMaterial) {
  const input = source as THREE.MeshStandardMaterial
  if (input.color) target.color.copy(input.color)
  target.map = input.map ?? null
  target.alphaMap = input.alphaMap ?? null
  target.normalMap = input.normalMap ?? null
  target.roughnessMap = input.roughnessMap ?? null
  target.metalnessMap = input.metalnessMap ?? null
  target.aoMap = input.aoMap ?? null
  target.roughness = input.roughness ?? 1
  target.metalness = input.metalness ?? 0
  target.opacity = source.opacity
  target.transparent = source.transparent
  target.side = source.side
  target.depthTest = source.depthTest
  target.depthWrite = source.depthWrite
  target.polygonOffset = source.polygonOffset
  target.polygonOffsetFactor = source.polygonOffsetFactor
  target.polygonOffsetUnits = source.polygonOffsetUnits
  target.toneMapped = source.toneMapped
}
