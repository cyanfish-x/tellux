/**
 * 3D Tiles 点云着色选项（Cesium 形公开字段）。
 *
 * Tellux 在 Three.js + Takram 大气管线下实现 attenuation / EDL / 法线光照；
 * **不是** Cesium 像素级复刻。默认值以 Tellux 为准（与 Cesium 文档默认有差异）。
 *
 * Point cloud shading options (Cesium-shaped public fields).
 *
 * Tellux implements attenuation / EDL / normal-based lighting on the
 * Three.js + Takram stack; this is **not** a pixel-identical Cesium port.
 * Defaults follow Tellux (they differ from Cesium docs in places).
 */
export interface PointCloudShadingOptions {
  /**
   * 是否按瓦片 `geometricError` 做点大小衰减。Tellux 默认 `false`（Cesium 同为 `false`）。
   *
   * Whether to attenuate point size from tile `geometricError`.
   * Tellux default `false` (same as Cesium).
   */
  attenuation?: boolean
  /**
   * 应用到每个瓦片 geometricError 的缩放。默认 `1.0`。
   *
   * Scale applied to each tile's geometric error. Defaults to `1.0`.
   */
  geometricErrorScale?: number
  /**
   * 点大小衰减上限（像素）。未设置时使用该图层 `tileLoading.errorTarget`（默认 16）。
   *
   * Maximum attenuated point size in pixels. When omitted, uses the layer's
   * `tileLoading.errorTarget` (default 16).
   */
  maximumAttenuation?: number
  /**
   * 数据集平均基分辨率（米）。瓦片缺少有效 `geometricError` 时作为 attenuation 回退值。
   *
   * Average base resolution in meters. Used as the attenuation fallback when a
   * tile has no valid `geometricError`.
   */
  baseResolution?: number
  /**
   * 是否启用 Eye Dome Lighting。Tellux 默认 `false`（Cesium 文档常为 `true`）。
   *
   * 仅 WebGL 后处理管线可用；WebGPU 降级忽略。
   *
   * Whether to enable Eye Dome Lighting. Tellux default `false`
   * (Cesium docs often default to `true`).
   *
   * WebGL post-process only; ignored on WebGPU.
   */
  eyeDomeLighting?: boolean
  /**
   * EDL 边缘对比强度。默认 `1.0`。
   *
   * EDL edge contrast strength. Defaults to `1.0`.
   */
  eyeDomeLightingStrength?: number
  /**
   * EDL 轮廓厚度（采样半径缩放）。默认 `1.0`。
   *
   * EDL contour thickness (neighbor sample radius scale). Defaults to `1.0`.
   */
  eyeDomeLightingRadius?: number
  /**
   * 有几何法线时是否接受场景光照。默认 `true`。
   *
   * 无法线点云始终按 unlit 处理；`false` 时即使数据带法线也按 unlit 处理。
   *
   * Whether point clouds with geometric normals receive scene lighting.
   * Point clouds without normals are always unlit; `false` also keeps point
   * clouds with normals unlit.
   */
  normalShading?: boolean
  /**
   * 背向点剔除。类型预留；当前实现为 no-op。
   *
   * Back-face culling for points. Reserved; currently a no-op.
   */
  backFaceCulling?: boolean
}

/**
 * 解析后的点云着色状态（运行时可变）。
 *
 * Resolved point cloud shading state (mutable at runtime).
 */
export interface ResolvedPointCloudShading {
  attenuation: boolean
  geometricErrorScale: number
  maximumAttenuation: number | undefined
  baseResolution: number | undefined
  eyeDomeLighting: boolean
  eyeDomeLightingStrength: number
  eyeDomeLightingRadius: number
  normalShading: boolean
  backFaceCulling: boolean
}

/**
 * Tellux 点云着色默认值（与 Cesium 文档默认不完全相同）。
 *
 * Tellux point-cloud shading defaults (not identical to Cesium docs).
 */
export const DEFAULT_POINT_CLOUD_SHADING: ResolvedPointCloudShading = {
  attenuation: false,
  geometricErrorScale: 1,
  maximumAttenuation: undefined,
  baseResolution: undefined,
  eyeDomeLighting: false,
  eyeDomeLightingStrength: 1,
  eyeDomeLightingRadius: 1,
  normalShading: true,
  backFaceCulling: false
}

/**
 * 合并用户选项与 Tellux 默认值。
 *
 * Merges user options with Tellux defaults.
 */
export function resolvePointCloudShading(
  options?: PointCloudShadingOptions | null
): ResolvedPointCloudShading {
  if (!options) {
    return { ...DEFAULT_POINT_CLOUD_SHADING }
  }

  return {
    attenuation: options.attenuation ?? DEFAULT_POINT_CLOUD_SHADING.attenuation,
    geometricErrorScale:
      options.geometricErrorScale ?? DEFAULT_POINT_CLOUD_SHADING.geometricErrorScale,
    maximumAttenuation:
      options.maximumAttenuation !== undefined
        ? options.maximumAttenuation
        : DEFAULT_POINT_CLOUD_SHADING.maximumAttenuation,
    baseResolution:
      options.baseResolution !== undefined
        ? options.baseResolution
        : DEFAULT_POINT_CLOUD_SHADING.baseResolution,
    eyeDomeLighting: options.eyeDomeLighting ?? DEFAULT_POINT_CLOUD_SHADING.eyeDomeLighting,
    eyeDomeLightingStrength:
      options.eyeDomeLightingStrength ?? DEFAULT_POINT_CLOUD_SHADING.eyeDomeLightingStrength,
    eyeDomeLightingRadius:
      options.eyeDomeLightingRadius ?? DEFAULT_POINT_CLOUD_SHADING.eyeDomeLightingRadius,
    normalShading: options.normalShading ?? DEFAULT_POINT_CLOUD_SHADING.normalShading,
    backFaceCulling: options.backFaceCulling ?? DEFAULT_POINT_CLOUD_SHADING.backFaceCulling
  }
}
