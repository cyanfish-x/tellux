import * as THREE from 'three'
import type { ColorInput, LonLatHeightLike, PolygonOptions } from '../types'
import { readLonLat } from '../lonlat'
import { DEG2RAD } from '../constants'
import { createEncodedCartesian3, encodeCartesian3 } from '../utils/EncodedCartesian3'
import type { ResolveColor } from './invertToneMapping'
import type { EllipsoidLike, GroundClampSharedUniforms } from './groundClamp'

interface GroundPolygonGraphicOptions {
  /** 外环顶点的经纬高序列（高度忽略——贴地）。 */
  positions: readonly LonLatHeightLike[]
  options: PolygonOptions
  ellipsoid: EllipsoidLike
  /** 由 GroundClampPass 提供、每帧刷新的共享 uniform。 */
  uniforms: GroundClampSharedUniforms
  resolveColor: ResolveColor
}

// 与 GroundPolylineGraphic 相同的固定全局高度带（米，相对椭球面）。
const BAND_MIN_HEIGHT = -1000
const BAND_MAX_HEIGHT = 9000

// 每三角形棱柱：顶点 [B0,B1,B2,T0,T1,T2]（B=带底、T=带顶），8 个三角形、
// 绕序统一朝外（三角形已保证相对 up 为 CCW；配合 BackSide 每像素恰一次 FS）。
const PRISM_INDICES = [
  3, 4, 5, // top (+up)
  0, 2, 1, // bottom (-up)
  0, 1, 4, 0, 4, 3, // side 0-1
  1, 2, 5, 1, 5, 4, // side 1-2
  2, 0, 3, 2, 3, 5 // side 2-0
]

/**
 * 贴地多边形图形。不用 Cesium 的模板两遍（合成器 target 无 stencil buffer），
 * 而是等价的单 pass 方案：外环在切平面内 earcut 三角化（凹多边形天然支持），
 * 每个三角形挤出一个棱柱分类体；片元着色器读主场景深度还原地表点，做三条边的
 * 外向半平面测试判定是否落在三角形 footprint 内。全多边形共用一个 up 向量，
 * 相邻三角形共享边的半平面在两侧严格互补（叉积精确反号），无缝隙无重叠。
 *
 * Ground-clamped polygon. Instead of Cesium's two-pass stencil (the composer
 * targets have no stencil buffer), an equivalent single-pass scheme: the ring is
 * earcut-triangulated in the tangent plane (concave polygons supported), each
 * triangle extruded into a classification prism; the fragment shader
 * reconstructs the ground point from scene depth and runs three outward
 * half-plane tests. A single polygon-wide up vector makes shared-edge planes
 * exactly complementary — no seams or overlaps.
 */
export class GroundPolygonGraphic {
  readonly object3D: THREE.Mesh
  private geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly ellipsoid: EllipsoidLike
  private readonly resolveColor: ResolveColor
  private readonly currentColor: THREE.Color
  private optionOpacity: number
  private colorAlpha: number
  private positions: readonly LonLatHeightLike[]

  constructor({ positions, options, ellipsoid, uniforms, resolveColor }: GroundPolygonGraphicOptions) {
    this.ellipsoid = ellipsoid
    this.positions = positions
    this.resolveColor = resolveColor

    const { color, alpha } = extractColorAlpha(options.color)
    this.currentColor = new THREE.Color(color ?? 0xffffff)
    this.optionOpacity = options.opacity ?? 1
    this.colorAlpha = alpha
    this.material = new THREE.ShaderMaterial({
      name: 'TelluxGroundPolygon',
      uniforms: {
        u_cameraHigh: uniforms.u_cameraHigh,
        u_cameraLow: uniforms.u_cameraLow,
        u_viewMatrixRTE: uniforms.u_viewMatrixRTE,
        u_projectionMatrix: uniforms.u_projectionMatrix,
        telluxGroundDepth: uniforms.telluxGroundDepth,
        uResolution: uniforms.uResolution,
        uInverseProjection: uniforms.uInverseProjection,
        uColor: { value: this.resolveColor(this.currentColor) },
        uOpacity: { value: this.optionOpacity * this.colorAlpha },
        uUp: { value: new THREE.Vector3(0, 0, 1) }
      },
      vertexShader: GROUND_POLYGON_VERTEX_SHADER,
      fragmentShader: GROUND_POLYGON_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.BackSide
    })

    this.geometry = this.buildGeometry()
    this.object3D = new THREE.Mesh(this.geometry, this.material)
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
  }

  get color(): number {
    return this.currentColor.getHex()
  }

  get opacity(): number {
    return this.optionOpacity
  }

  setColor(color: ColorInput) {
    const { color: rgb, alpha } = extractColorAlpha(color)
    this.currentColor.set(rgb ?? 0xffffff)
    this.colorAlpha = alpha
    ;(this.material.uniforms.uColor.value as THREE.Color).copy(
      this.resolveColor(this.currentColor)
    )
    this.material.uniforms.uOpacity.value = this.optionOpacity * this.colorAlpha
  }

  setOpacity(opacity: number) {
    this.optionOpacity = Math.max(0, Math.min(1, opacity))
    this.material.uniforms.uOpacity.value = this.optionOpacity * this.colorAlpha
  }

  refreshColors() {
    ;(this.material.uniforms.uColor.value as THREE.Color).copy(
      this.resolveColor(this.currentColor)
    )
  }

  setPositions(positions: readonly LonLatHeightLike[]) {
    this.positions = positions
    const next = this.buildGeometry()
    this.object3D.geometry = next
    this.geometry.dispose()
    this.geometry = next
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }

  private buildGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry()
    const lonLat = dedupeClosingVertex(this.positions.map(toLonLat))
    if (lonLat.length < 3) return geometry

    // 环顶点的地表点（h=0）与逐顶点椭球法向（地心方向近似）。
    const surface = lonLat.map(({ lon, lat }) =>
      this.ellipsoid.getCartographicToPosition(lat * DEG2RAD, lon * DEG2RAD, 0, new THREE.Vector3())
    )
    const normals = surface.map((p) => p.clone().normalize())

    // 全多边形共用 up（质心方向）：三角化绕序判定与 FS 半平面测试都用它，
    // 保证共享边两侧严格互补。
    const up = surface
      .reduce((acc, p) => acc.add(p), new THREE.Vector3())
      .normalize()
    ;(this.material.uniforms.uUp.value as THREE.Vector3).copy(up)

    // 切平面 2D 投影 + earcut 三角化（凹多边形支持）。基 (tangent, bitangent, up)
    // 右手，2D 正面积 ⇔ 相对 up 为 CCW。
    const reference = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const tangent = new THREE.Vector3().crossVectors(up, reference).normalize()
    const bitangent = new THREE.Vector3().crossVectors(up, tangent)
    const origin = surface[0]
    const offset = new THREE.Vector3()
    const points2d = surface.map((p) => {
      offset.subVectors(p, origin)
      return new THREE.Vector2(offset.dot(tangent), offset.dot(bitangent))
    })
    const triangles = THREE.ShapeUtils.triangulateShape(points2d, [])
    if (triangles.length === 0) return geometry

    const vertexCount = triangles.length * 6
    const position = new Float32Array(vertexCount * 3)
    const positionHigh = new Float32Array(vertexCount * 3)
    const positionLow = new Float32Array(vertexCount * 3)
    const v0High = new Float32Array(vertexCount * 3)
    const v0Low = new Float32Array(vertexCount * 3)
    const v1High = new Float32Array(vertexCount * 3)
    const v1Low = new Float32Array(vertexCount * 3)
    const v2High = new Float32Array(vertexCount * 3)
    const v2Low = new Float32Array(vertexCount * 3)
    const indices = new Uint32Array(triangles.length * PRISM_INDICES.length)

    const cornerEncoded = createEncodedCartesian3()
    const vertexEncoded = [createEncodedCartesian3(), createEncodedCartesian3(), createEncodedCartesian3()]
    const corner = new THREE.Vector3()
    const edgeA = new THREE.Vector2()
    const edgeB = new THREE.Vector2()

    triangles.forEach((triangle, t) => {
      let [i0, i1, i2] = triangle
      // 强制相对 up 为 CCW（2D 有向面积为正），使 PRISM_INDICES 的朝外绕序成立。
      edgeA.subVectors(points2d[i1], points2d[i0])
      edgeB.subVectors(points2d[i2], points2d[i0])
      if (edgeA.cross(edgeB) < 0) {
        ;[i1, i2] = [i2, i1]
      }
      const ring = [i0, i1, i2]
      ring.forEach((ringIndex, k) => {
        encodeCartesian3(surface[ringIndex], vertexEncoded[k])
      })

      const baseVertex = t * 6
      // 顶点布局 [B0,B1,B2,T0,T1,T2]；每个棱柱顶点都携带三角形三个地表点的双精度。
      for (let c = 0; c < 6; c += 1) {
        const ringIndex = ring[c % 3]
        const band = c < 3 ? BAND_MIN_HEIGHT : BAND_MAX_HEIGHT
        corner.copy(surface[ringIndex]).addScaledVector(normals[ringIndex], band)
        encodeCartesian3(corner, cornerEncoded)

        const vi = (baseVertex + c) * 3
        position[vi] = corner.x
        position[vi + 1] = corner.y
        position[vi + 2] = corner.z
        writeVec3(positionHigh, vi, cornerEncoded.high)
        writeVec3(positionLow, vi, cornerEncoded.low)
        writeVec3(v0High, vi, vertexEncoded[0].high)
        writeVec3(v0Low, vi, vertexEncoded[0].low)
        writeVec3(v1High, vi, vertexEncoded[1].high)
        writeVec3(v1Low, vi, vertexEncoded[1].low)
        writeVec3(v2High, vi, vertexEncoded[2].high)
        writeVec3(v2Low, vi, vertexEncoded[2].low)
      }

      const indexBase = t * PRISM_INDICES.length
      for (let k = 0; k < PRISM_INDICES.length; k += 1) {
        indices[indexBase + k] = baseVertex + PRISM_INDICES[k]
      }
    })

    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('positionHigh', new THREE.BufferAttribute(positionHigh, 3))
    geometry.setAttribute('positionLow', new THREE.BufferAttribute(positionLow, 3))
    geometry.setAttribute('v0High', new THREE.BufferAttribute(v0High, 3))
    geometry.setAttribute('v0Low', new THREE.BufferAttribute(v0Low, 3))
    geometry.setAttribute('v1High', new THREE.BufferAttribute(v1High, 3))
    geometry.setAttribute('v1Low', new THREE.BufferAttribute(v1Low, 3))
    geometry.setAttribute('v2High', new THREE.BufferAttribute(v2High, 3))
    geometry.setAttribute('v2Low', new THREE.BufferAttribute(v2Low, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeBoundingSphere()
    return geometry
  }
}

function toLonLat(input: LonLatHeightLike): { lon: number; lat: number } {
  const point = readLonLat(input)
  return { lon: point.longitude, lat: point.latitude }
}

function dedupeClosingVertex(ring: Array<{ lon: number; lat: number }>) {
  if (ring.length < 2) return ring
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (Math.abs(first.lon - last.lon) < 1e-12 && Math.abs(first.lat - last.lat) < 1e-12) {
    return ring.slice(0, -1)
  }
  return ring
}

function writeVec3(array: Float32Array, offset: number, v: THREE.Vector3) {
  array[offset] = v.x
  array[offset + 1] = v.y
  array[offset + 2] = v.z
}

/**
 * 从颜色输入提取 alpha（`rgba(...)` 与 `#rrggbbaa`），返回去掉 alpha 的颜色和
 * 不透明度。THREE.Color 不承载 alpha，现有 resolveColor 链路会丢弃它；贴地面用
 * 单次 FS 输出（BackSide），可以安全支持半透明填充。
 */
function extractColorAlpha(input: ColorInput | undefined): {
  color: ColorInput | undefined
  alpha: number
} {
  if (typeof input !== 'string') return { color: input, alpha: 1 }

  const rgba = input.match(/^\s*rgba\(([^)]+)\)\s*$/i)
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => part.trim())
    if (parts.length === 4) {
      const alpha = Number.parseFloat(parts[3])
      return {
        color: `rgb(${parts.slice(0, 3).join(',')})`,
        alpha: Number.isFinite(alpha) ? THREE.MathUtils.clamp(alpha, 0, 1) : 1
      }
    }
  }

  const hex8 = input.match(/^\s*#([0-9a-f]{8})\s*$/i)
  if (hex8) {
    return {
      color: `#${hex8[1].slice(0, 6)}`,
      alpha: Number.parseInt(hex8[1].slice(6), 16) / 255
    }
  }

  return { color: input, alpha: 1 }
}

const GROUND_POLYGON_VERTEX_SHADER = /* glsl */ `
attribute vec3 positionHigh;
attribute vec3 positionLow;
attribute vec3 v0High;
attribute vec3 v0Low;
attribute vec3 v1High;
attribute vec3 v1Low;
attribute vec3 v2High;
attribute vec3 v2Low;

uniform vec3 u_cameraHigh;
uniform vec3 u_cameraLow;
uniform mat4 u_viewMatrixRTE;
uniform mat4 u_projectionMatrix;

varying vec3 vAEye;
varying vec3 vBEye;
varying vec3 vCEye;

vec3 toEye(vec3 high, vec3 low) {
  vec3 rte = (high - u_cameraHigh) + (low - u_cameraLow);
  return (u_viewMatrixRTE * vec4(rte, 1.0)).xyz;
}

void main() {
  vAEye = toEye(v0High, v0Low);
  vBEye = toEye(v1High, v1Low);
  vCEye = toEye(v2High, v2Low);
  vec3 posEye = toEye(positionHigh, positionLow);
  gl_Position = u_projectionMatrix * vec4(posEye, 1.0);
}
`

const GROUND_POLYGON_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D telluxGroundDepth;
uniform vec2 uResolution;
uniform mat4 uInverseProjection;
uniform mat4 u_viewMatrixRTE;
uniform vec3 uUp;
uniform vec3 uColor;
uniform float uOpacity;

varying vec3 vAEye;
varying vec3 vBEye;
varying vec3 vCEye;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float depth = texture2D(telluxGroundDepth, uv).x;
  if (depth >= 1.0) discard;                               // 天空/无地表

  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 eyeH = uInverseProjection * ndc;
  vec3 eye = eyeH.xyz / eyeH.w;                            // 眼空间地表点

  // 三角形相对 up 为 CCW → cross(边, up) 指向外侧；地表点在三条边的内侧
  // （s ≤ 0）即命中。up 全多边形共用，共享边两侧的测试严格互补。
  vec3 up = normalize((u_viewMatrixRTE * vec4(uUp, 0.0)).xyz);
  float s0 = dot(eye - vAEye, cross(vBEye - vAEye, up));
  float s1 = dot(eye - vBEye, cross(vCEye - vBEye, up));
  float s2 = dot(eye - vCEye, cross(vAEye - vCEye, up));
  if (max(s0, max(s1, s2)) > 0.0) discard;

  gl_FragColor = vec4(uColor, uOpacity);
}
`
