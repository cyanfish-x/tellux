# 光照模式与参数

Tellux 的大气光照由 `viewer.scene` 控制。创建 `Viewer` 时可以在 `scene` 配置中设置初始值，也可以在运行时直接修改 `viewer.scene` 上的属性。

## 光照模式

Tellux 提供两种大气光照模式，默认使用 `light-source`：

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    atmosphere: {
      lighting: {
        mode: 'light-source'
      }
    }
  }
})
```

如果你的应用界面把光照模式简写成 `mode`，对应关系是：

```ts
const lightSourceLighting = {
  mode: 'light-source'
} as const

const postProcessLighting = {
  mode: 'post-process'
} as const

viewer.scene.atmosphere.lighting.mode = lightSourceLighting.mode
viewer.scene.atmosphere.lighting.mode = postProcessLighting.mode
```

### `light-source`

`light-source` 会在 Three.js 场景中使用 Takram 的太阳方向光和天空光探针。它适合大多数 3D GIS 场景：3D Tiles、地形、overlay 影像、自定义 Three.js 模型和 PBR 材质都可以沿用 Three.js 的常规受光方式。

```ts
viewer.scene.atmosphere.lighting.mode = 'light-source'
viewer.scene.atmosphere.lighting.sunLight = true
viewer.scene.atmosphere.lighting.skyLight = true
viewer.scene.atmosphere.lighting.sunLightIntensity = 1.2
viewer.scene.atmosphere.lighting.skyLightIntensity = 0.8
viewer.scene.atmosphere.lighting.photometric.enabled = true
viewer.scene.atmosphere.lighting.photometric.sunIlluminance = 111000
```

### `post-process`

`post-process` 是 Takram 的原生空气透视后处理光照路径。它会把渲染结果当作表面反照率（albedo），再在 `AerialPerspectiveEffect` 中应用太阳光、天空光、大气透射和空气散射。

这个模式适合需要统一大气后处理光照的高级场景，但输入材质应是不受 Three.js 光源影响的 albedo 材质，例如 `MeshBasicMaterial` 或 glTF 的 `KHR_materials_unlit`。

```ts
viewer.scene.atmosphere.lighting.mode = 'post-process'
viewer.scene.atmosphere.lighting.sunLight = true
viewer.scene.atmosphere.lighting.skyLight = true
viewer.scene.atmosphere.lighting.albedoScale = 0.6
```

Tellux 会根据当前光照模式自动调整 Viewer 管理的基础地表、地形、`tilesets.add` 瓦片和 `models.add` 模型材质：`post-process` 使用不受 Three.js 光源影响的 basic 材质，`light-source` 使用 standard 材质。

城市夜景、广告牌、窗灯这类 **局部光源** 应使用 `models.add({ lighting: 'local' })`（`materialMode: 'preserve'` 时默认就是 `local`）。局部模型走 forward 着色，大气不再把已着色 radiance 当地表反照率乘以日夜因子。`post-process` 模式下 `local` 会强制保留 glTF 材质。

```ts
const model = viewer.models.add({
  type: 'gltf',
  url: '/city.glb',
  coordinates: [121.47, 31.23, 0],
  materialMode: 'preserve',
  lighting: 'local'
})
```

基础地表和 terrain 会额外应用 `scene.surface.material` 中的 PBR 参数。默认 `roughness: 1`、`metalness: 0`、`useRoughnessMap: false`，用于保留受光明暗同时避免 terrain watermask 在海面产生强太阳反光。需要恢复上游粗糙度贴图时，可设置 `viewer.scene.surface.material.useRoughnessMap = true`。

摄影测量 3D Tiles 的几何法线可能缺失或不稳定。此时可以为该 3D Tiles 图层重新生成折痕法线，让 `NormalPass` 为后处理光照提供更稳定的几何法线：

```ts
const layer = viewer.tilesets.add({
  source: {
    type: 'cesium-ion',
    assetId: 2275207,
    apiToken
  },
  creasedNormals: true
})
```

如果应用明确希望某个 3D Tiles 图层始终不受 Three.js 光源影响，仍然可以使用 `materialMode: 'unlit'` 强制保持 basic 材质。强制 unlit 的图层不会随光照模式切回 standard。

## 常用光照参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `atmosphere.lighting.mode` | `'post-process'` | 大气光照模式，可选 `'light-source'` 或 `'post-process'`。 |
| `atmosphere.lighting.sunLight` | `true` | 是否应用太阳直射光照。 |
| `atmosphere.lighting.skyLight` | `true` | 是否应用天空环境光照。 |
| `atmosphere.lighting.sunLightIntensity` | `1` | 太阳光源辐射强度缩放，主要作用于 `light-source` 模式。 |
| `atmosphere.lighting.skyLightIntensity` | `1` | 天空光探针辐射强度缩放，主要作用于 `light-source` 模式。 |
| `atmosphere.lighting.albedoScale` | `1` | 后处理光照使用的反照率缩放，主要用于 `post-process` 模式。 |
| `atmosphere.lighting.photometric.enabled` | `false` | 是否启用光度单位。默认关闭，避免未改灯的地球示例过曝。 |
| `atmosphere.lighting.photometric.sunIlluminance` | `111000` | 正午太阳照度锚（lux），对齐 CesiumSunSky。映射为 Takram 强度缩放 `sunIlluminance / 111000`，**不会**写成 `SunDirectionalLight.intensity = 111000`，也**不会**换算点光或自发光。 |
| `surface.material.roughness` | `1` | 基础地表和 terrain 的 standard 材质粗糙度。 |
| `surface.material.metalness` | `0` | 基础地表和 terrain 的 standard 材质金属度。 |
| `surface.material.useRoughnessMap` | `false` | 是否沿用 terrain watermask 等上游粗糙度贴图。 |
| `atmosphere.fallbackAmbientLight.enabled` | `true` | 是否启用夜间兜底环境光。 |
| `atmosphere.fallbackAmbientLight.intensity` | `0.5` | 夜间兜底环境光最大强度。 |

## 初始配置示例

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    atmosphere: {
      lighting: {
        mode: 'light-source',
        sunLight: true,
        skyLight: true,
        sunLightIntensity: 1.2,
        skyLightIntensity: 0.8
      },
      fallbackAmbientLight: {
        enabled: true,
        intensity: 0.5
      }
    }
  }
})
```

## 光度单位与自动曝光

对齐 Cesium for Unreal / CesiumSunSky 的观感时，验收示例 `threejs-interop` 走 WebGPU（`Viewer.create` + `renderer.type: 'webgpu'`），并同时打开：

1. `lighting.photometric`：太阳用正午 111000 lux 语义锚，只缩放 Takram 太阳（默认仍是 intensity≈1）。**不要**把 Cesium 的 UE 10→111000 lux 比值（×11100）写进 `emissiveIntensity`。点光挂在带 `scale` 的模型根上，intensity 按世界距离平方补偿。
2. `models.add({ lighting: 'local' })`：灯和广告牌不被大气夜因子灭掉。WebGPU 没有 lighting mask，该页必须停在 `light-source`，不要切到 `post-process`。
3. `postProcess.autoExposure`：按太阳高度在白天曝光 `min` 与夜晚曝光 `max` 之间平滑插值。不要手拧 `toneMappingExposure` 当验收。
4. `postProcess.taa`：时间抗锯齿（仅 WebGPU）。`highlighter.outline` 在 WebGPU 无效，该页已关闭。
5. 对齐上游 Non-geospatial：**不开 Bloom**。夜景靠自发光、点光和自动曝光。点光必须挂在带 `scale` 的 glTF 根上；intensity 按 `(modelScale / 0.01)² × 0.1` 放大，才能在墙上留下和上游沙盘一样的暖色 spill。

其它地球示例默认 **不** 开 photometric / autoExposure，以免全球过曝。UE 的「扩展亮度范围」不是自动曝光；Tellux 已是 HalfFloat + AgX，不再抄同名开关。

```ts
viewer.scene.atmosphere.lighting.photometric.enabled = true
viewer.postProcess.autoExposure.enabled = true
viewer.postProcess.autoExposure.min = 2
viewer.postProcess.autoExposure.max = 10
viewer.postProcess.autoExposure.speed = 1.2
```
