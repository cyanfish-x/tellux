# 类型入口

Tellux 的类型入口是 `dist/index.d.ts`，源码中的公开类型主要从 `src/types.ts` 导出。

## Viewer 配置

常用类型：

- `ViewerOptions`
- `ViewerSceneOptions`
- `ViewerAtmosphereOptions`
- `ViewerCloudOptions`
- `ViewerSurfaceOptions`
- `ViewerPostProcessOptions`
- `AtmosphereLightingMode`
- `CloudQualityPreset`
- `SurfaceMaterialMode`
- `TerrainOptions`
- `ImageryLayerOptions`
- `Load3DTilesetOptions`
- `AddModelOptions`
- `SampleHeightOptions`
- `SampleHeightMostDetailedOptions`

## 场景配置

`ViewerOptions.scene` 使用按领域分组的配置结构，避免把大气、云、地表和后处理参数拍平成同一层。

```ts
const viewer = new Viewer(container, {
  scene: {
    atmosphere: {
      show: true,
      lighting: {
        mode: 'light-source',
        sunLight: true,
        skyLight: true,
        sunLightIntensity: 1,
        skyLightIntensity: 1,
        albedoScale: 1
      },
      scattering: {
        intensity: 0.6,
        horizonBlend: true,
        horizonRange: [0, 0.6]
      },
      sky: {
        stars: true,
        starsIntensity: 1,
        starsPointSize: 1
      },
      fallbackAmbientLight: {
        show: true,
        intensity: 0.5
      }
    },
    clouds: {
      show: true,
      quality: 'medium',
      coverage: 0.3,
      speed: 0.001,
      layer: {
        altitude: 1500,
        height: 650
      }
    },
    surface: {
      materialMode: 'auto'
    },
    postProcess: {
      toneMappingExposure: 10,
      lensFlare: true,
      smaa: true,
      dithering: false
    }
  }
})
```

对应的运行时控制入口也保持同样的分组：

```ts
viewer.scene.atmosphere.lighting.mode = 'post-process'
viewer.scene.atmosphere.scattering.intensity = 0.45
viewer.scene.atmosphere.sky.stars.show = false
viewer.scene.clouds.quality = 'high'
viewer.scene.clouds.coverage = 0.35
viewer.scene.surface.materialMode = 'standard'
viewer.scene.postProcess.smaa.enabled = true
viewer.toneMappingExposure = 8
```

## 坐标类型

```ts
type CartographicCoordinateTuple = [
  longitude: number,
  latitude: number,
  height?: number
]

interface CartographicCoordinates {
  latitude: number
  longitude: number
  height: number
}
```

数组输入顺序是 `[经度, 纬度, 高度]`。对象输入使用 `{ longitude, latitude, height }`。

## 事件类型

```ts
viewer.on('mousemove', (event) => {
  event.position
  event.cartographic
})
```

`event.position` 是相对于 canvas 左上角的像素坐标，`event.cartographic` 是命中的经纬高，未命中时为 `null`。
