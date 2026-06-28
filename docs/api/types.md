# 类型入口

Tellux 的类型入口是 `dist/index.d.ts`，源码中的公开类型主要从 `src/types.ts` 导出。

## Viewer 配置

常用类型：

- `ViewerOptions`
- `ViewerSceneOptions`
- `ViewerAtmosphereOptions`
- `ViewerCloudOptions`
- `ViewerSurfaceOptions`
- `ViewerSurfaceMaterialOptions`
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
- `ViewerRendererOptions`
- `ViewerRendererType`

底层 Three.js renderer 实例类型也从 `tellux` 导出，用于在外部渲染循环或自定义 pass 中直接操作 renderer：

- `TelluxRenderer`：`TelluxWebGLRenderer | TelluxWebGPURenderer` 的联合类型。
- `TelluxWebGLRenderer`：WebGL 模式下的 renderer（带 Tellux 效果扩展的 `WebGLRenderer`）。
- `TelluxWebGPURenderer`：WebGPU 模式下的 `WebGPURenderer`。

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
      materialMode: 'auto',
      material: {
        roughness: 1,
        metalness: 0,
        useRoughnessMap: false
      }
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
viewer.scene.surface.material.roughness = 0.9
viewer.scene.postProcess.smaa.enabled = true
viewer.toneMappingExposure = 8
```

## Renderer 类型

`ViewerOptions.renderer` 控制底层 Three.js renderer 的创建方式，对应 `ViewerRendererOptions`：

```ts
const viewer = await tellux.Viewer.create(container, {
  renderer: {
    type: 'webgpu'
  }
})
```

`type` 取值对应 `ViewerRendererType`：

- `webgl`（默认）：使用 Three.js `WebGLRenderer`，完整支持大气、云、星空和后处理效果。
- `webgpu`（实验性）：使用 Three.js `WebGPURenderer`。基础地球、3D Tiles、地形、影像、模型、拾取和大气天空 / 空气透视走 WebGPU 管线；体积云、星空和 WebGL 专属后处理效果仍会降级为不渲染。

WebGPU renderer 需要异步初始化。推荐用 `Viewer.create(...)`，它会在返回前等待 `viewer.ready`；若使用 `new Viewer(...)` 并接入外部手动渲染循环，建议先 `await viewer.ready` 再调用 `viewer.render()`。WebGPU 模式目前不会在不支持的环境上自动回退 WebGL，需要应用层自行检测后再决定 `type`，或使用 `renderer.forceWebGL` 让 WebGPURenderer 走 Three.js 的 WebGL2 fallback backend。

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
