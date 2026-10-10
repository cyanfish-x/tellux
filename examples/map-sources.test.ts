import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createExampleMapServiceConfig, resolveMapSourceProfile } from "./map-sources"
import {
  ARCGIS_WORLD_IMAGERY_URL,
  NASA_BLUE_MARBLE_IMAGERY_SOURCE,
  NASA_BLUE_MARBLE_TILE_PATH,
} from "./map-sources.config"

const baseOptions = {
  cesiumIonToken: "ion-token",
  cesiumTerrainUrl: "https://terrain.example.com/layer.json",
  tiandituTokens: ["token-a", "token-b"],
}

describe("resolveMapSourceProfile", () => {
  it("defaults production to the config production profile", () => {
    expect(resolveMapSourceProfile({ isDevelopment: false })).toBe("cesiumIon")
  })

  it("uses the production profile and ignores the local profile", () => {
    expect(
      resolveMapSourceProfile({
        isDevelopment: false,
        localProfile: "tianditu",
        productionProfile: "local",
      })
    ).toBe("local")
  })

  it("can switch production back to Tianditu", () => {
    expect(
      resolveMapSourceProfile({
        isDevelopment: false,
        localProfile: "local",
        productionProfile: "tianditu",
      })
    ).toBe("tianditu")
  })

  it("uses the config local profile during development", () => {
    expect(
      resolveMapSourceProfile({
        isDevelopment: true,
        localProfile: "local",
        productionProfile: "tianditu",
      })
    ).toBe("local")
  })
})

describe("NASA_BLUE_MARBLE_IMAGERY_SOURCE", () => {
  it("loads homepage tiles from the site without the remote maptiles proxy", () => {
    expect(NASA_BLUE_MARBLE_IMAGERY_SOURCE.url).toBe(
      "/blue-marble/{z}/{x}/{y}.jpg"
    )
  })

  it("is geographic XYZ at z0–z1 for the homepage globe", () => {
    expect(NASA_BLUE_MARBLE_IMAGERY_SOURCE).toMatchObject({
      type: "xyz",
      url: NASA_BLUE_MARBLE_TILE_PATH,
      projection: "EPSG:4326",
      levels: 2,
      tileDimension: 256,
    })
  })

  it("ships every JPEG needed by the configured geographic tile pyramid", () => {
    for (let z = 0; z < NASA_BLUE_MARBLE_IMAGERY_SOURCE.levels; z++) {
      for (let x = 0; x < 2 ** (z + 1); x++) {
        for (let y = 0; y < 2 ** z; y++) {
          const path = NASA_BLUE_MARBLE_TILE_PATH
            .replace("{z}", String(z))
            .replace("{x}", String(x))
            .replace("{y}", String(y))
          const jpeg = readFileSync(new URL(`./public${path}`, import.meta.url))
          expect(jpeg.subarray(0, 2).toString("hex"), path).toBe("ffd8")
          expect(jpeg.subarray(-2).toString("hex"), path).toBe("ffd9")
        }
      }
    }
  })
})

describe("createExampleMapServiceConfig", () => {
  it("uses ArcGIS imagery and Cesium Ion terrain for the local profile", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      profile: "local",
    })

    expect(config.profile).toBe("local")
    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: ARCGIS_WORLD_IMAGERY_URL,
      levels: 19,
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "cesium-ion",
      assetId: 1,
      apiToken: baseOptions.cesiumIonToken,
    })
  })

  it("uses a Cesium terrain URL when the cesiumUrl profile is selected", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      profile: "cesiumUrl",
    })

    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: ARCGIS_WORLD_IMAGERY_URL,
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "url",
      url: baseOptions.cesiumTerrainUrl,
    })
  })

  it("uses Cesium Ion imagery and terrain for the cesiumIon profile", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      profile: "cesiumIon",
    })

    expect(config.profile).toBe("cesiumIon")
    expect(config.createImagerySource()).toMatchObject({
      type: "cesium-ion",
      assetId: 2,
      apiToken: baseOptions.cesiumIonToken,
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "cesium-ion",
      assetId: 1,
      apiToken: baseOptions.cesiumIonToken,
    })
  })

  it("does not start Cesium Ion imagery or terrain without a token", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      cesiumIonToken: "",
      profile: "cesiumIon",
    })

    expect(config.createImagerySource()).toBeUndefined()
    expect(config.createOverlays()).toEqual([])
    expect(config.createTerrainOptions()).toBeUndefined()
  })

  it("keeps ArcGIS imagery when local Ion terrain has no token", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      cesiumIonToken: "",
      profile: "local",
    })

    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: ARCGIS_WORLD_IMAGERY_URL,
    })
    expect(config.createOverlays()).toHaveLength(1)
    expect(config.createTerrainOptions()).toBeUndefined()
  })

  it("uses Tianditu imagery and terrain for the tianditu profile", () => {
    const config = createExampleMapServiceConfig({
      ...baseOptions,
      profile: "tianditu",
    })

    expect(config.profile).toBe("tianditu")
    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}",
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "tianditu",
      apiToken: baseOptions.tiandituTokens,
    })
  })
})
