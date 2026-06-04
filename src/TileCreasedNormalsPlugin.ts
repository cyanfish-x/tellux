import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { DEG2RAD } from './constants'

interface TileModelPlugin {
  processTileModel: (scene: THREE.Object3D) => void
}

export class TileCreasedNormalsPlugin implements TileModelPlugin {
  readonly priority = -20

  processTileModel(tileScene: THREE.Object3D) {
    tileScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.geometry) return

      mesh.geometry = toCreasedNormals(mesh.geometry, 30 * DEG2RAD)
    })
  }
}
