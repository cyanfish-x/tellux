import * as THREE from 'three'
import type { CartographicInput, ColorInput, PolylineOptions } from '../types'
import { DEG2RAD } from '../constants'
import { createEncodedCartesian3, encodeCartesian3 } from '../utils/EncodedCartesian3'
import { resolveColor } from './invertToneMapping'
import type {
  EllipsoidLike,
  GroundClampSharedUniforms,
  PolylinePickable
} from './groundClamp'

interface GroundPolylineGraphicOptions {
  /** 折线顶点的经纬高序列（高度忽略——贴地）。 */
  positions: CartographicInput[]
  options: PolylineOptions
  ellipsoid: EllipsoidLike
  /** 由 GroundClampPass 提供、每帧刷新的共享 uniform。 */
  uniforms: GroundClampSharedUniforms
}

// 墙体积撑到的固定全局高度带（米，相对椭球面）。墙只需覆盖屏幕区域，真实贴合
// 由片元读深度决定，故用能包住全球地形的保守带即可（Everest≈8850，Dead Sea≈-430）。
const BAND_MIN_HEIGHT = -1000
const BAND_MAX_HEIGHT = 9000
// 每个输入段按此长度细分，控制墙体积贴合弧面的误差。
const MAX_SUB_SEGMENT_METERS = 1000
// 墙体积横向半宽下限（米），保证极细线也有可覆盖的盒体。
const MIN_GEOMETRY_HALF_WIDTH = 0.5

// 立方体 12 三角形索引（DoubleSide 渲染，绕序无关）。角点编号见 buildWallGeometry。
const BOX_INDICES = [
  0, 1, 5, 0, 5, 4, // bottom
  2, 6, 7, 2, 7, 3, // top
  0, 1, 3, 0, 3, 2, // start cap
  4, 7, 5, 4, 6, 7, // end cap
  0, 2, 6, 0, 6, 4, // left
  1, 3, 7, 1, 7, 5 // right
]

/**
 * 贴地折线图形。对标 Cesium `GroundPolylinePrimitive`：CPU 建静态"墙体积"分类
 * 几何（不采样地形），渲染时在片元着色器读主场景深度纹理还原地表点、逐像素判定
 * 是否落在折线 footprint 内。几何不随地形 LOD 重建。
 *
 * 由 {@link GroundClampPass} 统一渲染（本对象的 `object3D` 挂到 pass 的 root，
 * 不进主场景）。顶点位置走 RTC 双精度（`positionHigh/Low`）消除地球尺度抖动。
 *
 * Ground-clamped polyline. Mirrors Cesium `GroundPolylinePrimitive`: a static
 * CPU "wall volume" classification geometry (no terrain sampling) whose fragment
 * shader reads the scene depth texture, reconstructs the ground point, and
 * per-pixel tests whether it falls within the polyline footprint. Rendered by
 * {@link GroundClampPass}; vertices use RTC double precision.
 */
export class GroundPolylineGraphic implements PolylinePickable {
  readonly object3D: THREE.Mesh
  private geometry: THREE.BufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly ellipsoid: EllipsoidLike
  private readonly uniforms: GroundClampSharedUniforms
  private positions: CartographicInput[]
  private surfaceVertices: THREE.Vector3[] = []
  private widthMeters: number

  constructor({ positions, options, ellipsoid, uniforms }: GroundPolylineGraphicOptions) {
    this.ellipsoid = ellipsoid
    this.uniforms = uniforms
    this.positions = positions
    this.widthMeters = options.width ?? 2

    this.material = new THREE.ShaderMaterial({
      name: 'TelluxGroundPolyline',
      uniforms: {
        // 共享 uniform：引用 pass 的实例，pass 每帧更新即全体生效。
        u_cameraHigh: uniforms.u_cameraHigh,
        u_cameraLow: uniforms.u_cameraLow,
        u_viewMatrixRTE: uniforms.u_viewMatrixRTE,
        u_projectionMatrix: uniforms.u_projectionMatrix,
        telluxGroundDepth: uniforms.telluxGroundDepth,
        uResolution: uniforms.uResolution,
        uInverseProjection: uniforms.uInverseProjection,
        // 每 graphic 独有：
        uColor: { value: resolveColor(options.color) },
        uOpacity: { value: 1 },
        uHalfWidthMeters: { value: Math.max(this.widthMeters / 2, 0) }
      },
      vertexShader: GROUND_POLYLINE_VERTEX_SHADER,
      fragmentShader: GROUND_POLYLINE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    })

    this.geometry = this.buildGeometry()
    this.object3D = new THREE.Mesh(this.geometry, this.material)
    this.object3D.matrixAutoUpdate = false
    this.object3D.updateMatrix()
    this.object3D.renderOrder = 0
  }

  get color(): number {
    return (this.material.uniforms.uColor.value as THREE.Color).getHex()
  }

  /** 贴地折线宽度，语义为**米**（非像素）。 */
  get width(): number {
    return this.widthMeters
  }

  setColor(color: ColorInput) {
    ;(this.material.uniforms.uColor.value as THREE.Color).copy(resolveColor(color))
  }

  setWidth(width: number) {
    this.widthMeters = width
    this.material.uniforms.uHalfWidthMeters.value = Math.max(width / 2, 0)
  }

  setPositions(positions: CartographicInput[]) {
    this.positions = positions
    const next = this.buildGeometry()
    this.object3D.geometry = next
    this.geometry.dispose()
    this.geometry = next
  }

  /** 贴地折线无像素宽度语义，分辨率同步为空操作（满足 PolylinePickable）。 */
  syncResolution(_width: number, _height: number) {
    // no-op
  }

  /** 遍历细分后的地表顶点段，供 EntityPicker 屏幕空间拾取。 */
  forEachSegment(callback: (start: THREE.Vector3, end: THREE.Vector3) => void) {
    for (let i = 0; i < this.surfaceVertices.length - 1; i += 1) {
      callback(this.surfaceVertices[i], this.surfaceVertices[i + 1])
    }
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }

  private buildGeometry(): THREE.BufferGeometry {
    this.surfaceVertices = this.buildSurfaceVertices()
    const vertices = this.surfaceVertices
    const geometry = new THREE.BufferGeometry()
    if (vertices.length < 2) return geometry

    const halfWidth = Math.max(this.widthMeters / 2, MIN_GEOMETRY_HALF_WIDTH)
    const segmentCount = vertices.length - 1
    const vertexCount = segmentCount * 8

    const position = new Float32Array(vertexCount * 3)
    const positionHigh = new Float32Array(vertexCount * 3)
    const positionLow = new Float32Array(vertexCount * 3)
    const segStartHigh = new Float32Array(vertexCount * 3)
    const segStartLow = new Float32Array(vertexCount * 3)
    const segEndHigh = new Float32Array(vertexCount * 3)
    const segEndLow = new Float32Array(vertexCount * 3)
    const segUp = new Float32Array(vertexCount * 3)
    const indices = new Uint32Array(segmentCount * BOX_INDICES.length)

    const encoded = createEncodedCartesian3()
    const startEncoded = createEncodedCartesian3()
    const endEncoded = createEncodedCartesian3()
    const normalStart = new THREE.Vector3()
    const normalEnd = new THREE.Vector3()
    const forward = new THREE.Vector3()
    const up = new THREE.Vector3()
    const right = new THREE.Vector3()
    const corner = new THREE.Vector3()
    const cornerOffsets = [
      { end: 0, side: -1, band: BAND_MIN_HEIGHT },
      { end: 0, side: 1, band: BAND_MIN_HEIGHT },
      { end: 0, side: -1, band: BAND_MAX_HEIGHT },
      { end: 0, side: 1, band: BAND_MAX_HEIGHT },
      { end: 1, side: -1, band: BAND_MIN_HEIGHT },
      { end: 1, side: 1, band: BAND_MIN_HEIGHT },
      { end: 1, side: -1, band: BAND_MAX_HEIGHT },
      { end: 1, side: 1, band: BAND_MAX_HEIGHT }
    ]

    for (let s = 0; s < segmentCount; s += 1) {
      const start = vertices[s]
      const end = vertices[s + 1]
      this.surfaceNormal(s, normalStart)
      this.surfaceNormal(s + 1, normalEnd)

      forward.subVectors(end, start)
      if (forward.lengthSq() === 0) forward.copy(normalStart) // 退化段兜底
      forward.normalize()
      up.addVectors(normalStart, normalEnd).normalize()
      right.crossVectors(up, forward)
      if (right.lengthSq() === 0) right.set(1, 0, 0)
      right.normalize()

      encodeCartesian3(start, startEncoded)
      encodeCartesian3(end, endEncoded)

      const baseVertex = s * 8
      for (let c = 0; c < 8; c += 1) {
        const offset = cornerOffsets[c]
        const anchor = offset.end === 0 ? start : end
        const anchorNormal = offset.end === 0 ? normalStart : normalEnd
        corner
          .copy(anchor)
          .addScaledVector(right, offset.side * halfWidth)
          .addScaledVector(anchorNormal, offset.band)
        encodeCartesian3(corner, encoded)

        const vi = (baseVertex + c) * 3
        position[vi] = corner.x
        position[vi + 1] = corner.y
        position[vi + 2] = corner.z
        writeVec3(positionHigh, vi, encoded.high)
        writeVec3(positionLow, vi, encoded.low)
        writeVec3(segStartHigh, vi, startEncoded.high)
        writeVec3(segStartLow, vi, startEncoded.low)
        writeVec3(segEndHigh, vi, endEncoded.high)
        writeVec3(segEndLow, vi, endEncoded.low)
        writeVec3(segUp, vi, up)
      }

      const indexBase = s * BOX_INDICES.length
      for (let k = 0; k < BOX_INDICES.length; k += 1) {
        indices[indexBase + k] = baseVertex + BOX_INDICES[k]
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('positionHigh', new THREE.BufferAttribute(positionHigh, 3))
    geometry.setAttribute('positionLow', new THREE.BufferAttribute(positionLow, 3))
    geometry.setAttribute('segStartHigh', new THREE.BufferAttribute(segStartHigh, 3))
    geometry.setAttribute('segStartLow', new THREE.BufferAttribute(segStartLow, 3))
    geometry.setAttribute('segEndHigh', new THREE.BufferAttribute(segEndHigh, 3))
    geometry.setAttribute('segEndLow', new THREE.BufferAttribute(segEndLow, 3))
    geometry.setAttribute('segUp', new THREE.BufferAttribute(segUp, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeBoundingSphere()
    return geometry
  }

  /**
   * 把输入折线沿经纬线性细分为地表点序列（高度 0）。每个输入段按弦长切成
   * ≤ {@link MAX_SUB_SEGMENT_METERS} 的子段。
   */
  private buildSurfaceVertices(): THREE.Vector3[] {
    const lonLat = this.positions.map((input) => toLonLat(input))
    if (lonLat.length < 2) {
      return lonLat.map(({ lon, lat }) => this.surfacePoint(lon, lat, new THREE.Vector3()))
    }

    const out: THREE.Vector3[] = []
    const tmpStart = new THREE.Vector3()
    const tmpEnd = new THREE.Vector3()
    for (let i = 0; i < lonLat.length - 1; i += 1) {
      const a = lonLat[i]
      const b = lonLat[i + 1]
      this.surfacePoint(a.lon, a.lat, tmpStart)
      this.surfacePoint(b.lon, b.lat, tmpEnd)
      const chord = tmpStart.distanceTo(tmpEnd)
      const steps = Math.max(1, Math.ceil(chord / MAX_SUB_SEGMENT_METERS))
      const first = i === 0 ? 0 : 1 // 避免与上一段末点重复
      for (let k = first; k <= steps; k += 1) {
        const t = k / steps
        const lon = a.lon + (b.lon - a.lon) * t
        const lat = a.lat + (b.lat - a.lat) * t
        out.push(this.surfacePoint(lon, lat, new THREE.Vector3()))
      }
    }
    return out
  }

  private surfacePoint(lon: number, lat: number, target: THREE.Vector3): THREE.Vector3 {
    return this.ellipsoid.getCartographicToPosition(lat * DEG2RAD, lon * DEG2RAD, 0, target)
  }

  private surfaceNormal(vertexIndex: number, target: THREE.Vector3): THREE.Vector3 {
    // 用地心到地表点方向近似当地法向（球面足够精确；椭球下细分足够密时误差可忽略）。
    return target.copy(this.surfaceVertices[vertexIndex]).normalize()
  }
}

function toLonLat(input: CartographicInput): { lon: number; lat: number } {
  if (Array.isArray(input)) return { lon: input[0], lat: input[1] }
  return { lon: input.longitude, lat: input.latitude }
}

function writeVec3(array: Float32Array, offset: number, v: THREE.Vector3) {
  array[offset] = v.x
  array[offset + 1] = v.y
  array[offset + 2] = v.z
}

const GROUND_POLYLINE_VERTEX_SHADER = /* glsl */ `
attribute vec3 positionHigh;
attribute vec3 positionLow;
attribute vec3 segStartHigh;
attribute vec3 segStartLow;
attribute vec3 segEndHigh;
attribute vec3 segEndLow;
attribute vec3 segUp;

uniform vec3 u_cameraHigh;
uniform vec3 u_cameraLow;
uniform mat4 u_viewMatrixRTE;
uniform mat4 u_projectionMatrix;

varying vec3 vStartEye;
varying vec3 vEndEye;
varying vec3 vUpEye;

vec3 toEye(vec3 high, vec3 low) {
  vec3 rte = (high - u_cameraHigh) + (low - u_cameraLow);
  return (u_viewMatrixRTE * vec4(rte, 1.0)).xyz;
}

void main() {
  vStartEye = toEye(segStartHigh, segStartLow);
  vEndEye = toEye(segEndHigh, segEndLow);
  // w=0：仅旋转（u_viewMatrixRTE 本就无平移），把当地 up 变到眼空间。
  vUpEye = (u_viewMatrixRTE * vec4(segUp, 0.0)).xyz;
  vec3 posEye = toEye(positionHigh, positionLow);
  gl_Position = u_projectionMatrix * vec4(posEye, 1.0);
}
`

const GROUND_POLYLINE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform sampler2D telluxGroundDepth;
uniform vec2 uResolution;
uniform mat4 uInverseProjection;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uHalfWidthMeters;

varying vec3 vStartEye;
varying vec3 vEndEye;
varying vec3 vUpEye;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float depth = texture2D(telluxGroundDepth, uv).x;
  if (depth >= 1.0) discard;                               // 天空/无地表

  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 eyeH = uInverseProjection * ndc;
  vec3 eye = eyeH.xyz / eyeH.w;                            // 眼空间地表点

  // 段在椭球面（高 0），而地表点带真实高程（可达数千米），不能量三维距离——
  // 对标 Cesium 右平面测试：只量垂直于段方向与当地 up 的"横向"偏距。
  vec3 se = vEndEye - vStartEye;
  float segLen2 = dot(se, se);
  if (segLen2 <= 0.0) discard;
  vec3 rightNormal = cross(normalize(se), normalize(vUpEye));
  float rightLen = length(rightNormal);
  if (rightLen < 1e-4) discard;                            // 退化段
  rightNormal /= rightLen;
  float lateral = abs(dot(eye - vStartEye, rightNormal));
  if (lateral > uHalfWidthMeters) discard;                 // 超出 ribbon 半宽

  float t = dot(eye - vStartEye, se) / segLen2;
  if (t < 0.0 || t > 1.0) discard;                         // 投影落在段外

  gl_FragColor = vec4(uColor, uOpacity);
}
`
