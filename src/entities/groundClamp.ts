import type * as THREE from 'three'
import type { ClampInput, HeightSamplingSource } from '../types'

/**
 * 归一化后的贴地配置。`normalizeClamp` 把 `boolean | GroundClamp | undefined`
 * 收敛成这个形状或 `null`（不贴地）。
 *
 * Normalized ground-clamp config produced by {@link normalizeClamp}.
 */
export interface ResolvedClamp {
  source: HeightSamplingSource
  offset: number
}

/**
 * 把用户输入的 `clamp` 字段归一化。
 * - `undefined` / `false` → `null`（不贴地）。
 * - `true` → `{ source: 'all', offset: 0 }`。
 * - 对象 → 补默认值（`source: 'all'`、`offset: 0`）。
 *
 * Normalizes the user-facing `clamp` field; returns `null` when clamping is off.
 */
export function normalizeClamp(clamp: ClampInput | undefined): ResolvedClamp | null {
  if (!clamp) return null
  if (clamp === true) return { source: 'all', offset: 0 }
  return {
    source: clamp.source ?? 'all',
    offset: clamp.offset ?? 0
  }
}

/**
 * 分类材质需要、由 {@link GroundClampPass} 每帧刷新的共享 uniform。所有贴地
 * graphic 共用同一批 `THREE.IUniform` 实例，pass 更新一次全体生效（沿用
 * `RTCAutoUniforms` 的共享范式）。
 *
 * Shared uniforms consumed by ground-clamp classification materials and updated
 * once per frame by {@link GroundClampPass}. Every ground graphic references the
 * same `THREE.IUniform` instances, mirroring the `RTCAutoUniforms` sharing model.
 */
export interface GroundClampSharedUniforms {
  u_cameraHigh: THREE.IUniform<THREE.Vector3>
  u_cameraLow: THREE.IUniform<THREE.Vector3>
  u_viewMatrixRTE: THREE.IUniform<THREE.Matrix4>
  u_projectionMatrix: THREE.IUniform<THREE.Matrix4>
  /** 主场景深度纹理（terrain + 3D Tiles 并集），由 pass 首帧捕获。 */
  telluxGroundDepth: THREE.IUniform<THREE.Texture | null>
  /** 绘制缓冲像素尺寸，用于把 gl_FragCoord 归一化成深度纹理 uv。 */
  uResolution: THREE.IUniform<THREE.Vector2>
  /** `u_projectionMatrix` 的逆，用于把窗口深度反投影回眼空间。 */
  uInverseProjection: THREE.IUniform<THREE.Matrix4>
}

/**
 * 分类几何构建所需的椭球方法子集（避免与 3d-tiles-renderer 的具体类型耦合）。
 * 角度为弧度，纬度在前。
 *
 * The subset of ellipsoid methods needed to build classification geometry.
 * Angles in radians, latitude first.
 */
export interface EllipsoidLike {
  getCartographicToPosition(
    latitude: number,
    longitude: number,
    height: number,
    target: THREE.Vector3
  ): THREE.Vector3
  getCartographicToNormal(
    latitude: number,
    longitude: number,
    target: THREE.Vector3
  ): THREE.Vector3
}

/**
 * 贴地实体所需的注入依赖，由 Viewer 经 EntityManager 传入 Entity。WebGPU 下
 * 无贴地 pass 时为 `null`。
 *
 * Ground-clamp dependencies injected from the Viewer through EntityManager into
 * Entity. `null` when there is no clamp pass (e.g. WebGPU).
 */
export interface GroundClampContext {
  /** 贴地几何挂载的根节点（由 GroundClampPass 自渲，不入 threeScene）。 */
  root: THREE.Group
  /** 分类材质共享 uniform。 */
  uniforms: GroundClampSharedUniforms
}

/**
 * 供 EntityPicker 屏幕空间拾取的折线最小接口，普通折线与贴地折线都实现它。
 *
 * Minimal polyline interface for EntityPicker screen-space picking, implemented
 * by both the plain and the ground-clamped polyline graphics.
 */
export interface PolylinePickable {
  readonly width: number
  forEachSegment(callback: (start: THREE.Vector3, end: THREE.Vector3) => void): void
  syncResolution(width: number, height: number): void
}
