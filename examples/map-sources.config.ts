/**
 * 示例 GIS 数据源配置。
 *
 * 改 `localMapSourceProfile` 即可切换本地默认底图 / 地形；生产构建忽略该项，
 * 固定使用 `tianditu`。
 *
 * 密钥不要写在这里，放项目根 `.env`：
 * - `VITE_CESIUM_ION_TOKEN`：Cesium Ion 地形
 * - `VITE_TIANDITU_TOKEN`：天地图影像 / 地形（可逗号分隔多个 tk）
 * - `VITE_CESIUM_TERRAIN_URL`：仅当某个 profile 的 terrain 选 `cesium-url` 时使用
 *
 * GIS data sources for examples. Change `localMapSourceProfile` to switch the
 * local default; production builds always use `tianditu`. Keep secrets in `.env`.
 */

export const ARCGIS_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

/** Cesium World Terrain。示例固定用这个 asset，不做成可配置项。 */
export const CESIUM_ION_WORLD_TERRAIN_ASSET_ID = 1

export const mapSourceCatalog = {
  imagery: {
    arcgis: {
      type: "xyz" as const,
      url: ARCGIS_WORLD_IMAGERY_URL,
      levels: 19,
    },
    tianditu: {
      type: "tianditu" as const,
    },
  },
  terrain: {
    "cesium-ion": {
      type: "cesium-ion" as const,
      assetId: CESIUM_ION_WORLD_TERRAIN_ASSET_ID,
    },
    "cesium-url": {
      type: "url" as const,
    },
    tianditu: {
      type: "tianditu" as const,
    },
  },
} as const

export type ImagerySourceId = keyof typeof mapSourceCatalog.imagery
export type TerrainSourceId = keyof typeof mapSourceCatalog.terrain

export const mapSourceProfiles = {
  /**
   * 本地开发默认：ArcGIS 卫星影像 + Cesium Ion 地形，不消耗天地图额度。
   *
   * Local default: ArcGIS satellite imagery + Cesium Ion terrain.
   */
  local: {
    imagery: "arcgis",
    terrain: "cesium-ion",
  },
  /**
   * ArcGIS 卫星影像 + `.env` 里的 `VITE_CESIUM_TERRAIN_URL` quantized-mesh。
   *
   * ArcGIS satellite imagery + the quantized-mesh URL in
   * `VITE_CESIUM_TERRAIN_URL`.
   */
  cesiumUrl: {
    imagery: "arcgis",
    terrain: "cesium-url",
  },
  /**
   * 天地图影像 + swdx 地形。本地经 Vite 代理改写 Referer。
   *
   * Tianditu imagery + swdx terrain. Local requests go through the Vite proxy.
   */
  tianditu: {
    imagery: "tianditu",
    terrain: "tianditu",
  },
} as const satisfies Record<
  string,
  {
    imagery: ImagerySourceId
    terrain: TerrainSourceId
  }
>

export type MapSourceProfileId = keyof typeof mapSourceProfiles

/**
 * 本地开发使用的数据源组合。改成 `'tianditu'` 后刷新即可全站切到天地图。
 *
 * Local profile. Set to `'tianditu'` and reload to test Tianditu everywhere.
 */
export const localMapSourceProfile: MapSourceProfileId = "local"
