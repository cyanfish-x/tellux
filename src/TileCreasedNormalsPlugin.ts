import * as THREE from 'three'
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js'
import { DEG2RAD } from './constants'

const fallbackNormal = new THREE.Vector3(0, 0, 1)
const normalA = new THREE.Vector3()
const normalB = new THREE.Vector3()
const normalC = new THREE.Vector3()

interface TileModelPlugin {
  processTileModel: (scene: THREE.Object3D) => void
}

export interface TileCreasedNormalsPluginOptions {
  creaseAngle?: number
}

export class TileCreasedNormalsPlugin implements TileModelPlugin {
  readonly priority = -1000

  constructor(private readonly options: TileCreasedNormalsPluginOptions = {}) {}

  processTileModel(tileScene: THREE.Object3D) {
    tileScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || !(mesh.geometry instanceof THREE.BufferGeometry)) return

      const previousGeometry = mesh.geometry
      const nextGeometry = toCreasedNormals(previousGeometry, this.options.creaseAngle ?? 30 * DEG2RAD)
      replaceDegenerateTriangleNormals(nextGeometry)
      mesh.geometry = nextGeometry
      if (nextGeometry !== previousGeometry) {
        previousGeometry.dispose()
      }
    })
  }
}

function replaceDegenerateTriangleNormals(geometry: THREE.BufferGeometry) {
  const normal = geometry.getAttribute('normal')
  if (!normal) return

  for (let i = 0; i < normal.count; i += 3) {
    normalA.fromBufferAttribute(normal, i)
    normalB.fromBufferAttribute(normal, i + 1)
    normalC.fromBufferAttribute(normal, i + 2)
    if (
      normalA.length() < 0.5 ||
      normalB.length() < 0.5 ||
      normalC.length() < 0.5
    ) {
      normal.setXYZ(i, fallbackNormal.x, fallbackNormal.y, fallbackNormal.z)
      normal.setXYZ(i + 1, fallbackNormal.x, fallbackNormal.y, fallbackNormal.z)
      normal.setXYZ(i + 2, fallbackNormal.x, fallbackNormal.y, fallbackNormal.z)
    }
  }
}
