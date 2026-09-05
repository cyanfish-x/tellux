import {
  buildTiandituTerrainServiceUrls,
  createTiandituXYZImagerySource,
  parseTiandituTokens,
} from "./tiandituLoadBalancer"
import {
  localMapSourceProfile,
  mapSourceCatalog,
  mapSourceProfiles,
  type MapSourceProfileId,
} from "./map-sources.config"
import type {
  TerrainOptions,
  XYZImagerySourceOptions,
} from "../src"

export {
  ARCGIS_WORLD_IMAGERY_URL,
  CESIUM_ION_WORLD_TERRAIN_ASSET_ID,
  localMapSourceProfile,
  mapSourceCatalog,
  mapSourceProfiles,
} from "./map-sources.config"
export type {
  ImagerySourceId,
  MapSourceProfileId,
  TerrainSourceId,
} from "./map-sources.config"

const cesiumIonToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ""
const cesiumTerrainUrl = import.meta.env.VITE_CESIUM_TERRAIN_URL ?? ""
const tiandituTokens = parseTiandituTokens(import.meta.env.VITE_TIANDITU_TOKEN ?? "")

export interface ExampleMapServiceConfig {
  profile: MapSourceProfileId
  createImagerySource(): XYZImagerySourceOptions
  createTerrainOptions(): TerrainOptions | undefined
}

export interface CreateExampleMapServiceConfigOptions {
  profile: MapSourceProfileId
  cesiumIonToken: string
  cesiumTerrainUrl: string
  tiandituTokens: string[]
}

export interface ResolveMapSourceProfileOptions {
  isDevelopment: boolean
  localProfile?: MapSourceProfileId
}

/**
 * 生产环境固定天地图。本地开发读 `localMapSourceProfile`。
 *
 * Production always uses Tianditu. Local development uses
 * `localMapSourceProfile`.
 */
export function resolveMapSourceProfile(
  options: ResolveMapSourceProfileOptions
): MapSourceProfileId {
  if (!options.isDevelopment) return "tianditu"
  return options.localProfile ?? localMapSourceProfile
}

function createArcGisImagerySource(): XYZImagerySourceOptions {
  return { ...mapSourceCatalog.imagery.arcgis }
}

function createCesiumIonTerrainOptions(
  options: CreateExampleMapServiceConfigOptions
): TerrainOptions | undefined {
  if (!options.cesiumIonToken) return undefined
  return {
    type: "cesium-ion",
    assetId: mapSourceCatalog.terrain["cesium-ion"].assetId,
    apiToken: options.cesiumIonToken,
    tileLoading: { enableTileSplitting: true },
  }
}

function createCesiumUrlTerrainOptions(
  options: CreateExampleMapServiceConfigOptions
): TerrainOptions | undefined {
  if (!options.cesiumTerrainUrl) return undefined
  return {
    type: "url",
    url: options.cesiumTerrainUrl,
    tileLoading: { enableTileSplitting: true },
  }
}

function createTiandituTerrainOptions(
  options: CreateExampleMapServiceConfigOptions
): TerrainOptions | undefined {
  const [firstToken] = options.tiandituTokens
  if (!firstToken) return undefined
  return {
    type: "tianditu",
    apiToken: options.tiandituTokens,
    urls: buildTiandituTerrainServiceUrls(firstToken),
    tileLoading: { enableTileSplitting: true },
  }
}

export function createExampleMapServiceConfig(
  options: CreateExampleMapServiceConfigOptions
): ExampleMapServiceConfig {
  const { imagery, terrain } = mapSourceProfiles[options.profile]

  return {
    profile: options.profile,
    createImagerySource: () => {
      if (imagery === "tianditu") {
        return createTiandituXYZImagerySource(options.tiandituTokens)
      }
      return createArcGisImagerySource()
    },
    createTerrainOptions: () => {
      if (terrain === "tianditu") return createTiandituTerrainOptions(options)
      if (terrain === "cesium-url") return createCesiumUrlTerrainOptions(options)
      return createCesiumIonTerrainOptions(options)
    },
  }
}

export const exampleMapSourceProfile = resolveMapSourceProfile({
  isDevelopment: import.meta.env.DEV,
  localProfile: localMapSourceProfile,
})

export const exampleMapServiceConfig = createExampleMapServiceConfig({
  profile: exampleMapSourceProfile,
  cesiumIonToken,
  cesiumTerrainUrl,
  tiandituTokens,
})

export const defaultTerrainUrl = cesiumTerrainUrl
export const defaultCesiumIonToken = cesiumIonToken
export const defaultTiandituTokens = tiandituTokens
