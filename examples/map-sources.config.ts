/**
 * 示例 GIS 数据源配置。
 *
 * 改 `localMapSourceProfile` 切换本地默认底图 / 地形（默认 `local`）；
 * 改 `productionMapSourceProfile` 切换生产构建默认（默认 `cesiumIon`）。
 *
 * 密钥不要写在这里：
 * - Cesium Ion token：浏览器设置面板写入 `localStorage`（`tellux:cesium-ion-token`）
 * - `VITE_TIANDITU_TOKEN`：天地图影像 / 地形（可逗号分隔多个 tk），仍放项目根 `.env`
 * - `VITE_CESIUM_TERRAIN_URL`：仅当某个 profile 的 terrain 选 `cesium-url` 时使用
 *
 * GIS data sources for examples. Change `localMapSourceProfile` for local
 * defaults (`local`) and `productionMapSourceProfile` for production builds
 * (`cesiumIon`). Cesium Ion tokens live in `localStorage`; Tianditu tokens
 * stay in `.env`.
 */

export const ARCGIS_WORLD_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"

/** Cesium World Terrain。示例固定用这个 asset，不做成可配置项。 */
export const CESIUM_ION_WORLD_TERRAIN_ASSET_ID = 1

/** Cesium Ion Bing 航空影像。示例固定用这个 asset，不做成可配置项。 */
export const CESIUM_ION_BING_AERIAL_ASSET_ID = 2

/**
 * 首页 Hero 地球：NASA Blue Marble XYZ（EPSG:4326，z0–z1）。10 张瓦片
 * 放在 `examples/public/blue-marble/`，开发和生产都从本站静态目录加载。
 * 独立的 `/blue-marble/` 路径避开 `/maptiles` 远端代理，避免上游 502
 * 或响应中断阻塞首页。Hero 相机在 ~1.2 万 km，z0–z1 足够。
 *
 * Homepage hero globe: NASA Blue Marble XYZ (EPSG:4326, z0–z1). The ten tiles
 * in `examples/public/blue-marble/` are served by the site in both development
 * and production. The `/blue-marble/` path bypasses the remote `/maptiles`
 * proxy, avoiding upstream 502s and incomplete responses. The hero camera
 * sits at ~12,000 km, so z0–z1 is enough.
 */
export const NASA_BLUE_MARBLE_TILE_PATH =
  "/blue-marble/{z}/{x}/{y}.jpg"

export const NASA_BLUE_MARBLE_IMAGERY_SOURCE = {
  type: "xyz" as const,
  url: NASA_BLUE_MARBLE_TILE_PATH,
  projection: "EPSG:4326" as const,
  levels: 2,
  tileDimension: 256,
}

export const mapSourceCatalog = {
  imagery: {
    arcgis: {
      type: "xyz" as const,
      url: ARCGIS_WORLD_IMAGERY_URL,
      levels: 19,
    },
    "cesium-ion": {
      type: "cesium-ion" as const,
      assetId: CESIUM_ION_BING_AERIAL_ASSET_ID,
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
   * Cesium Ion Bing 航空影像 + Cesium World Terrain。
   *
   * Cesium Ion Bing aerial imagery + Cesium World Terrain.
   */
  cesiumIon: {
    imagery: "cesium-ion",
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

/**
 * 生产构建使用的数据源组合。改成 `'tianditu'` 后重新构建即可切回天地图。
 *
 * Production profile. Set to `'tianditu'` and rebuild to switch back.
 */
export const productionMapSourceProfile: MapSourceProfileId = "cesiumIon"
