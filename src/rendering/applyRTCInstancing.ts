import * as THREE from 'three'
import {
  createEncodedCartesian3,
  encodeCartesian3
} from '../utils/EncodedCartesian3'
import type { RTCAutoUniforms } from './RTCAutoUniforms'

/**
 * 把 `THREE.InstancedMesh` 改造为 Cesium 风格的 RTC 实例化 mesh：
 *
 * 1. 在 geometry 上添加 `positionHigh` / `positionLow` 两个 InstancedBufferAttribute，
 *    承载每个实例的 ECEF 平移（高/低拆分）。`instanceMatrix` 的平移列随后被清零，
 *    仅承载旋转+缩放。
 * 2. 通过 `onBeforeCompile` 给材质注入：
 *    - 属性声明 `attribute vec3 positionHigh / positionLow`
 *    - 共享 `RTCAutoUniforms` 的 uniform
 *    - 把 Three.js 标准的 `mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`
 *      替换为 RTE 数学：相机相对位置 + 仅旋转的 view 矩阵投影。
 *    - 若 shader 中没有 `instanceMatrix`（如 ez-tree 叶子材质把 `<project_vertex>`
 *      整段替换了），同时注入 instancing 块。
 *
 * 调用方无需手动调用 `rtcUniforms.update()`——本函数已给 mesh 挂上
 * `onBeforeRender`，每帧绘制前自动刷新相机 uniform。
 */

const RTC_VERTEX_INJECTION = `
attribute vec3 positionHigh;
attribute vec3 positionLow;
uniform vec3 u_cameraHigh;
uniform vec3 u_cameraLow;
uniform mat4 u_viewMatrixRTE;
uniform mat4 u_projectionMatrix;
`

// 用于直接替换 `#include <project_vertex>`：复制了 Three.js 原版 chunk 的全部
// 结构（含 batching/instancing 块），把末尾的 modelView+projection 链替换成
// RTE 数学。仅当 onBeforeCompile 阶段 shader 里仍是 include 占位符时启用
// （Three.js 在 onBeforeCompile 之后才用 resolveIncludes 展开 include）。
const RTC_PROJECT_VERTEX_CHUNK = `
vec4 mvPosition = vec4( transformed, 1.0 );

#ifdef USE_BATCHING

	mvPosition = batchingMatrix * mvPosition;

#endif

#ifdef USE_INSTANCING

	mvPosition = instanceMatrix * mvPosition;

#endif

vec3 rtcHighDiff = positionHigh - u_cameraHigh;
vec3 rtcLowDiff = positionLow - u_cameraLow;
vec3 worldPosRTE = rtcHighDiff + rtcLowDiff + mvPosition.xyz;
mvPosition = u_viewMatrixRTE * vec4(worldPosRTE, 1.0);
gl_Position = u_projectionMatrix * mvPosition;
`

const RTC_INLINE_REPLACEMENT = `
vec3 rtcHighDiff = positionHigh - u_cameraHigh;
vec3 rtcLowDiff = positionLow - u_cameraLow;
vec3 worldPosRTE = rtcHighDiff + rtcLowDiff + mvPosition.xyz;
mvPosition = u_viewMatrixRTE * vec4(worldPosRTE, 1.0);
gl_Position = u_projectionMatrix * mvPosition;`

function patchMaterial(
  material: THREE.Material,
  rtcUniforms: RTCAutoUniforms
): void {
  const originalOnBeforeCompile = material.onBeforeCompile?.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    if (originalOnBeforeCompile) {
      originalOnBeforeCompile(shader, renderer)
    }

    Object.assign(shader.uniforms, rtcUniforms.uniforms)

    if (!shader.vertexShader.includes('attribute vec3 positionHigh;')) {
      shader.vertexShader = shader.vertexShader.replace(
        /(\s*void\s+main\s*\(\s*\)\s*\{)/,
        `\n${RTC_VERTEX_INJECTION}$1`
      )
    }

    // Three.js 在 onBeforeCompile 之后才展开 include，所以此时 shader 里仍是
    // `#include <project_vertex>` 字面。优先整段替换 include（标准材质走这里）。
    if (shader.vertexShader.includes('#include <project_vertex>')) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        RTC_PROJECT_VERTEX_CHUNK
      )
    } else {
      // 回退：ez-tree 之类已经把 `<project_vertex>` 整段替换为自定义 chunk，
      // 此时 `mvPosition = modelViewMatrix * mvPosition;` 已经是字面字符串。
      // 先补 instancing 块（若缺失），再做 RTE 内联替换。
      if (!/instanceMatrix\s*\*\s*mvPosition/.test(shader.vertexShader)) {
        shader.vertexShader = shader.vertexShader.replace(
          /(mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;)/,
          `#ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      $1`
        )
      }
      shader.vertexShader = shader.vertexShader.replace(
        /mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;\s*gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition;/,
        RTC_INLINE_REPLACEMENT.trimStart()
      )
    }
  }
  material.needsUpdate = true
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

  // instanceMatrix 的平移列已被清零，原生 `computeBoundingBox/Sphere` 会把所有实
  // 例聚到原点。这里改成从 positionHigh+positionLow 还原真实 ECEF 位置参与计算，
  // 否则 frustum 剔除、flyToTarget 的 setFromObject 都会失效（飞到地心之类）。
  const rtcBoundsState = installRTCBounds(mesh)

  // 每帧绘制前刷新 RTC uniform，保证用当前帧的相机位姿。多个 mesh 共享同一份
  // uniform 时会重复算几次，但单次成本只有矩阵求逆 + 编码，可忽略；同时避免
  // 了调用方需要把 update() 接到正确的渲染时序上。
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
    // 取包围盒中心作为球心，半径 = 最远实例距离 + 局部几何球半径（保守估计）。
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
