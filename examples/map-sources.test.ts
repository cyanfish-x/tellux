import { describe, expect, it } from "vitest"
import { createExampleMapServiceConfig, resolveMapSourceProfile } from "./map-sources"
import { ARCGIS_WORLD_IMAGERY_URL } from "./map-sources.config"

const baseOptions = {
  cesiumIonToken: "ion-token",
  cesiumTerrainUrl: "https://terrain.example.com/layer.json",
  tiandituTokens: ["token-a", "token-b"],
}

describe("resolveMapSourceProfile", () => {
  it("keeps production on Tianditu", () => {
    expect(
      resolveMapSourceProfile({
        isDevelopment: false,
        localProfile: "local",
      })
    ).toBe("tianditu")
  })

  it("uses the config local profile during development", () => {
    expect(
      resolveMapSourceProfile({
        isDevelopment: true,
        localProfile: "local",
      })
    ).toBe("local")
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
      token: baseOptions.tiandituTokens,
    })
  })
})
