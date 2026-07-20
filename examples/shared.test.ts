import { describe, expect, it } from "vitest"
import { createExampleMapServiceConfig } from "./shared"

describe("createExampleMapServiceConfig", () => {
  const options = {
    cesiumIonTerrainAssetId: "1",
    cesiumIonTerrainToken: "ion-token",
    cesiumTerrainUrl: "https://terrain.example.com/layer.json",
    tiandituTokens: ["token-a", "token-b"],
  }

  it("uses ArcGIS imagery and the configured Cesium terrain during development", () => {
    const config = createExampleMapServiceConfig({
      ...options,
      isDevelopment: true,
    })

    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      levels: 19,
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "url",
      url: options.cesiumTerrainUrl,
    })
  })

  it("uses Tianditu imagery and terrain during production", () => {
    const config = createExampleMapServiceConfig({
      ...options,
      isDevelopment: false,
    })

    expect(config.createImagerySource()).toMatchObject({
      type: "xyz",
      url: "https://t0.tianditu.gov.cn/DataServer?T=img_w&x={x}&y={y}&l={z}",
    })
    expect(config.createTerrainOptions()).toMatchObject({
      type: "tianditu",
      token: options.tiandituTokens,
    })
  })
})
