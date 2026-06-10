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

Tellux 会根据当前光照模式自动调整 Viewer 管理的基础地表、地形、`load3DTileset` 瓦片和 `addModel` 模型材质：`post-process` 使用不受 Three.js 光源影响的 basic 材质，`light-source` 使用 standard 材质。

摄影测量 3D Tiles 的几何法线可能缺失或不稳定。此时可以为该 3D Tiles 图层重新生成折痕法线，让 `NormalPass` 为后处理光照提供更稳定的几何法线：

```ts
const layer = viewer.load3DTileset({
  type: 'cesium-ion',
  assetId: 2275207,
  apiToken,
  creasedNormals: true
})
```

如果应用明确希望某个 3D Tiles 图层始终不受 Three.js 光源影响，仍然可以使用 `materialMode: 'unlit'` 强制保持 basic 材质。强制 unlit 的图层不会随光照模式切回 standard。

## 常用光照参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `atmosphere.lighting.mode` | `'light-source'` | 大气光照模式，可选 `'light-source'` 或 `'post-process'`。 |
| `atmosphere.lighting.sunLight` | `true` | 是否应用太阳直射光照。 |
| `atmosphere.lighting.skyLight` | `true` | 是否应用天空环境光照。 |
| `atmosphere.lighting.sunLightIntensity` | `1` | 太阳光源辐射强度缩放，主要作用于 `light-source` 模式。 |
| `atmosphere.lighting.skyLightIntensity` | `1` | 天空光探针辐射强度缩放，主要作用于 `light-source` 模式。 |
| `atmosphere.lighting.albedoScale` | `1` | 后处理光照使用的反照率缩放，主要用于 `post-process` 模式。 |
| `atmosphere.fallbackAmbientLight.show` | `true` | 是否启用夜间兜底环境光。 |
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
        show: true,
        intensity: 0.5
      }
    }
  }
})
```
