import * as THREE from 'three'
import {
  createEncodedCartesian3,
  encodeCartesian3
} from '../utils/EncodedCartesian3'
import { createRTCPositionPipeline } from '../hism'
import { hasTelluxPositionPipeline } from '../hism/materials/windSwayLeavesMaterial'
import type { RTCAutoUniforms } from './RTCAutoUniforms'

/**
 * 把 `THREE.InstancedMesh` 改造为 Cesium 风格的 RTC 实例化 mesh：
 *
 * 1. 在 geometry 上添加 `positionHigh` / `positionLow` 两个 InstancedBufferAttribute，
 *    承载每个实例的 ECEF 平移（高/低拆分）。`instanceMatrix` 的平移列随后被清零，
 *    仅承载旋转+缩放。
 * 2. 通过 PositionPipeline 的 RTC stage 给材质注入 RTE 投影逻辑；对 ez-tree 等
 *    已替换 `<project_vertex>` 的材质走内联回退 patch。
 *
 * 调用方无需手动调用 `rtcUniforms.update()`——本函数已给 mesh 挂上
 * `onBeforeRender`，每帧绘制前自动刷新相机 uniform。
 */

function patchMaterial(
  material: THREE.Material,
  rtcUniforms: RTCAutoUniforms
): void {
  if (hasTelluxPositionPipeline(material)) return

  const pipeline = createRTCPositionPipeline()
  pipeline.applyToMaterial(material, rtcUniforms.uniforms as Record<string, THREE.IUniform>, {
    useInstancing: true,
    enableCustomProjectVertexFallback: true
  })
}

export interface RTCInstancedMeshHandle {
  /**
   * 移除注入的属性并标记材质需重编译。不还原 `onBeforeCompile`——材质销毁时
   * Three.js 会自动释放 program 缓存。
   */
  dispose(): void
}

export function applyRTCInstancing(
  mesh: THREE.InstancedMesh,
  rtcUniforms: RTCAutoUniforms
): RTCInstancedMeshHandle {
  const geometry = mesh.geometry
  const count = mesh.count

  if (!geometry.getAttribute('positionHigh')) {
    geometry.setAttribute(
      'positionHigh',
      new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    )
  }
  if (!geometry.getAttribute('positionLow')) {
    geometry.setAttribute(
      'positionLow',
      new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3)
    )
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  materials.forEach((mat) => patchMaterial(mat, rtcUniforms))

  const rtcBoundsState = installRTCBounds(mesh)

  const previousOnBeforeRender = mesh.onBeforeRender?.bind(mesh)
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
    rtcUniforms.update()
    if (previousOnBeforeRender) {
      previousOnBeforeRender(renderer, scene, camera, geometry, material, group)
    }
  }

  return {
    dispose() {
      geometry.deleteAttribute('positionHigh')
      geometry.deleteAttribute('positionLow')
      mesh.onBeforeRender = previousOnBeforeRender ?? null
      mesh.computeBoundingBox = rtcBoundsState.originalComputeBoundingBox
      mesh.computeBoundingSphere = rtcBoundsState.originalComputeBoundingSphere
      mesh.boundingBox = null
      mesh.boundingSphere = null
      materials.forEach((mat) => {
        mat.needsUpdate = true
      })
    }
  }
}

const rtcBoundsScratch = {
  high: new THREE.Vector3(),
  low: new THREE.Vector3(),
  origin: new THREE.Vector3(),
  tempMat: new THREE.Matrix4(),
  tempBox: new THREE.Box3(),
  tempSphere: new THREE.Sphere()
}

interface RTCBoundsState {
  originalComputeBoundingBox: () => void
  originalComputeBoundingSphere: () => void
}

function installRTCBounds(mesh: THREE.InstancedMesh): RTCBoundsState {
  const state: RTCBoundsState = {
    originalComputeBoundingBox: mesh.computeBoundingBox.bind(mesh),
    originalComputeBoundingSphere: mesh.computeBoundingSphere.bind(mesh)
  }

  mesh.computeBoundingBox = function () {
    if (this.boundingBox === null) {
      this.boundingBox = new THREE.Box3()
    }
    const geom = this.geometry
    if (geom.boundingBox === null) {
      geom.computeBoundingBox()
    }
    const geoBox = geom.boundingBox
    if (!geoBox) return

    const positionHigh = geom.getAttribute('positionHigh')
    const positionLow = geom.getAttribute('positionLow')
    if (!positionHigh || !positionLow) {
      state.originalComputeBoundingBox()
      return
    }

    const { high, low, origin, tempMat, tempBox } = rtcBoundsScratch
    const instArray = this.instanceMatrix.array
    let first = true

    for (let i = 0; i < this.count; i++) {
      tempMat.fromArray(instArray as ArrayLike<number>, i * 16)
      tempBox.copy(geoBox).applyMatrix4(tempMat)
      high.fromBufferAttribute(positionHigh, i)
      low.fromBufferAttribute(positionLow, i)
      origin.copy(high).add(low)
      tempBox.translate(origin)
      if (first) {
        this.boundingBox.copy(tempBox)
        first = false
      } else {
        this.boundingBox.union(tempBox)
      }
    }
  }

  mesh.computeBoundingSphere = function () {
    if (this.boundingSphere === null) {
      this.boundingSphere = new THREE.Sphere()
    }
    if (this.boundingBox === null) {
      this.computeBoundingBox()
    }
    if (!this.boundingBox || this.boundingBox.isEmpty()) {
      state.originalComputeBoundingSphere()
      return
    }
    this.boundingBox.getCenter(this.boundingSphere.center)
    const geom = this.geometry
    if (geom.boundingSphere === null) {
      geom.computeBoundingSphere()
    }
    const localRadius = geom.boundingSphere?.radius ?? 0
    const { origin, high, low } = rtcBoundsScratch
    const positionHigh = geom.getAttribute('positionHigh')
    const positionLow = geom.getAttribute('positionLow')
    let maxDist = 0
    for (let i = 0; i < this.count; i++) {
      high.fromBufferAttribute(positionHigh, i)
      low.fromBufferAttribute(positionLow, i)
      origin.copy(high).add(low).sub(this.boundingSphere.center)
      maxDist = Math.max(maxDist, origin.length())
    }
    this.boundingSphere.radius = maxDist + localRadius
  }

  return state
}

const scratchOrigin = new THREE.Vector3()
const scratchEncoded = createEncodedCartesian3()
const scratchHigh = new THREE.Vector3()
const scratchLow = new THREE.Vector3()

/**
 * 写入第 `index` 个实例的姿态：`fullEcefMatrix` 包含 ECEF 平移（绝对坐标）+
 * 旋转+缩放。函数内部把平移编码到 `positionHigh/Low`，并把 `instanceMatrix`
 * 的平移列清零（仅保留旋转+缩放）。
 */
export function setRTCMatrixAt(
  mesh: THREE.InstancedMesh,
  index: number,
  fullEcefMatrix: THREE.Matrix4
): void {
  const elements = fullEcefMatrix.elements
  scratchOrigin.set(elements[12], elements[13], elements[14])
  encodeCartesian3(scratchOrigin, scratchEncoded)

  const positionHigh = mesh.geometry.getAttribute(
    'positionHigh'
  ) as THREE.InstancedBufferAttribute
  const positionLow = mesh.geometry.getAttribute(
    'positionLow'
  ) as THREE.InstancedBufferAttribute
  positionHigh.setXYZ(
    index,
    scratchEncoded.high.x,
    scratchEncoded.high.y,
    scratchEncoded.high.z
  )
  positionLow.setXYZ(
    index,
    scratchEncoded.low.x,
    scratchEncoded.low.y,
    scratchEncoded.low.z
  )
  positionHigh.needsUpdate = true
  positionLow.needsUpdate = true

  mesh.setMatrixAt(index, fullEcefMatrix)
  const inst = mesh.instanceMatrix.array as Float32Array
  const base = index * 16
  inst[base + 12] = 0
  inst[base + 13] = 0
  inst[base + 14] = 0
  inst[base + 15] = 1
  mesh.instanceMatrix.needsUpdate = true
}

/**
 * 读取第 `index` 个 RTC 实例的完整 ECEF 矩阵（旋转+缩放来自 `instanceMatrix`，
 * 平移来自 `positionHigh/Low` 的 float64 合成）。
 *
 * Reads the full ECEF matrix for RTC instance `index` (rotation/scale from
 * `instanceMatrix`, translation reconstructed from `positionHigh/Low`).
 */
export function getRtcInstanceMatrixAt(
  mesh: THREE.InstancedMesh,
  index: number,
  target: THREE.Matrix4
): THREE.Matrix4 {
  mesh.getMatrixAt(index, target)

  const positionHigh = mesh.geometry.getAttribute('positionHigh')
  const positionLow = mesh.geometry.getAttribute('positionLow')
  if (!positionHigh || !positionLow) {
    return target
  }

  scratchHigh.fromBufferAttribute(positionHigh, index)
  scratchLow.fromBufferAttribute(positionLow, index)
  scratchOrigin.copy(scratchHigh).add(scratchLow)
  target.setPosition(scratchOrigin)
  return target
}
