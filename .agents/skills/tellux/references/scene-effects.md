# 场景效果：大气 / 光照 / 体积云 / 后处理 / 地表材质

所有视觉氛围能力按领域分组：大气 / 云 / 地表在 `viewer.scene` 下，后处理在顶层 `viewer.postProcess`。**初始化配置与运行时入口同构**（路径一致），下文示例两种用法通用。

## 光照模式（先选模式再调参）

Tellux 有两种大气光照模式，默认 `post-process`。这是最关键的选择，决定材质和受光方式。

```ts
viewer.scene.atmosphere.lighting.mode = 'light-source'   // 或 'post-process'
```

| 模式 | 原理 | 适用 |
| --- | --- | --- |
| `'post-process'`（默认） | 把渲染结果当 albedo，在 `AerialPerspectiveEffect` 里应用大气光照 | 需要统一大气后处理的高级场景；输入材质必须是不受光的（basic / unlit） |
| `'light-source'` | 用 Takram 太阳方向光 + 天空光探针，材质走 Three.js 常规受光 | 3D Tiles、地形、overlay、自定义模型、PBR——**大多数 GIS 场景** |

### light-source 调光

```ts
viewer.scene.atmosphere.lighting.sunLight = true
viewer.scene.atmosphere.lighting.skyLight = true
viewer.scene.atmosphere.lighting.sunLightIntensity = 1.2
viewer.scene.atmosphere.lighting.skyLightIntensity = 0.8
viewer.scene.atmosphere.lighting.photometric.enabled = true
viewer.scene.atmosphere.lighting.photometric.sunIlluminance = 111000
```

### post-process 注意事项

PBR / 受光材质在 post-process 模式下光源会被关闭，瓦片可能变暗变黑。此时要么改回 `light-source`，要么给需要后处理光照的 3D Tiles 用 `materialMode: 'unlit'`：

```ts
const layer = viewer.tilesets.add({
  source: {
    type: 'url',
    url: '...'
  },
  materialMode: 'unlit'
})
viewer.scene.atmosphere.lighting.albedoScale = 0.6
```

## 大气与天空

```ts
viewer.scene.atmosphere.show = true   // 总开关，关掉则天空/空气透视/太阳光都不渲染
```

默认世界是 ECEF，不必改大气矩阵。仅当应用已经把 Three.js 世界从 ECEF 换走时：

```ts
viewer.scene.atmosphere.setWorldToECEFMatrix(worldToECEF) // 与场景重基准同一套；正交、只含平移旋转
viewer.scene.atmosphere.getWorldToECEFMatrix()
viewer.scene.atmosphere.setWorldToECEFMatrix(new THREE.Matrix4()) // 单位阵恢复默认
```

不要用 `viewer.atmosphere`。`cartographicToMatrix4` 是物体 Y-up / Z-forward，不是 ENU；仅当整个世界就用这套框架时才能把它当作 world→ECEF。地球 / 相机 / 控件仍按 ECEF。

### 空气散射（远处发蓝发雾）

```ts
viewer.scene.atmosphere.scattering.intensity = 0.6              // 0~1，内散射强度
viewer.scene.atmosphere.scattering.transmittance = true         // 远处光被大气衰减
viewer.scene.atmosphere.scattering.inscatter = true             // 进入视线的散射光
viewer.scene.atmosphere.scattering.rayleighScatteringScale = 1  // 影响天空蓝色
viewer.scene.atmosphere.scattering.mieScatteringScale = 1       // 影响光晕/朝晚霞
viewer.scene.atmosphere.scattering.groundAlbedo = 0.1           // 地表对天空的反射
// 其余：solarIrradianceScale / mieExtinctionScale / miePhaseFunctionG / absorptionExtinctionScale
```

> WebGPU 模式下部分散射调试参数不映射，`light-source` 模式支持更完整。

### 天空元素（太阳/月亮/星空）

```ts
viewer.scene.atmosphere.sky.sun = true
viewer.scene.atmosphere.sky.moon = true
viewer.scene.atmosphere.sky.stars.show = true
viewer.scene.atmosphere.sky.stars.intensity = 1
viewer.scene.atmosphere.sky.sunAngularRadius = 0.004675   // 弧度！
```

> 星空在 WebGPU 模式下已支持，并沿用 `show`、`intensity` 与 `pointSize` 配置。

### 夜景（太阳落山后的补光）

```ts
viewer.scene.atmosphere.night.enabled = true
viewer.scene.atmosphere.night.moonLight = true            // 月光方向光
viewer.scene.atmosphere.night.ambientLight = true         // 冷色环境补光
viewer.scene.atmosphere.night.moonLightIntensity = 0.18
viewer.scene.atmosphere.night.useMoonPhase = true         // 按月相衰减月光
```

### 云影 & 兜底环境光

```ts
viewer.scene.atmosphere.shadow.radius = 8         // 体积云投地阴影的模糊半径
viewer.scene.atmosphere.shadow.sampleCount = 4    // 1~16

viewer.scene.atmosphere.fallbackAmbientLight.enabled = true   // 独立于夜景的兜底环境光
viewer.scene.atmosphere.fallbackAmbientLight.intensity = 0.5
```

## 体积云

> **WebGL 专属，WebGPU 模式下完全不渲染**——WebGPU 下应 `clouds.show = false`。

```ts
viewer.scene.clouds.show = true
viewer.scene.clouds.quality = 'medium'   // 'low' | 'medium' | 'high' | 'ultra'
viewer.scene.clouds.coverage = 0.35      // 0~1 覆盖率
viewer.scene.clouds.lightShafts = true   // 云缝光柱
viewer.scene.clouds.speed = 0.001        // UV 偏移/秒
viewer.scene.clouds.layer.altitude = 1500 // 低云层组云底高度（米）
viewer.scene.clouds.layer.height = 650    // 低云层组厚度（米）
viewer.scene.clouds.look.detail = true
viewer.scene.clouds.look.turbulence = true
viewer.scene.clouds.look.haze = true
viewer.scene.clouds.shadow.quality = 'medium' // 'low' | 'medium' | 'high'
```

典型用法：阴天效果 `coverage = 0.7, quality = 'high'`；关云 `show = false`。体积云从大约 20 km 起随相机高度淡出，约 40 km 以上不渲染；`show` / `coverage` 不会被改写。

## 地表材质

只作用于 Viewer 管理的基础地球和地形，不影响 `tilesets.add` / `models.add`。

```ts
viewer.scene.surface.materialMode = 'auto'   // 'auto'(随光照) | 'basic' | 'standard'
viewer.scene.surface.material.roughness = 1
viewer.scene.surface.material.metalness = 0
viewer.scene.surface.material.useRoughnessMap = false   // 关掉可避免海面强太阳反光
```

## 后处理

每个阶段用 `.enabled` 单独控制；色调曝光是顶层属性。

```ts
viewer.postProcess.smaa.enabled = true
viewer.postProcess.bloom.enabled = true
viewer.postProcess.bloom.intensity = 1.2
viewer.postProcess.bloom.luminanceThreshold = 0.6
viewer.postProcess.lensFlare.enabled = true
viewer.postProcess.lensFlare.intensity = 0.005
viewer.postProcess.lensFlare.quality = 'medium'
viewer.postProcess.taa.enabled = true // WebGPU，默认 false
viewer.postProcess.dithering.enabled = false
viewer.postProcess.autoExposure.enabled = false
viewer.postProcess.toneMappingExposure = 10
```

> Bloom 在 WebGL / WebGPU 均可用，基于整帧 HDR 亮度提取。`luminanceThreshold` 比的是 AgX / 曝光之前的线性 luma，不是屏幕看起来有多亮。`intensity` 乘的是已经提取的亮部，不是画面亮度百分比。城市夜景用 `models.add({ lighting: 'local' })`，点光挂在带 `scale` 的 glTF 根上并按 `(scale / 0.01)²` 补偿 intensity，打开 `photometric`（只缩放太阳）+ `autoExposure`；不要关太阳。夜景不依赖 Bloom（上游 Non-geospatial 未开）。WebGPU 顺序固定为 Bloom → LensFlare → TAA；SMAA / 抖动仍不渲染。WebGPU 暂无 lighting mask。

## 完整初始化示例

```ts
const viewer = new tellux.Viewer(container, {
  scene: {
    atmosphere: {
      show: true,
      lighting: { mode: 'light-source', sunLightIntensity: 1.2, skyLightIntensity: 0.8 },
      night: { enabled: true, moonLight: true },
      scattering: { intensity: 0.6 },
      sky: { stars: { show: true, intensity: 1 } }
    },
    clouds: {
      show: true,
      quality: 'medium',
      coverage: 0.35,
      look: { detail: true, turbulence: true, haze: true },
      shadow: { quality: 'medium' }
    },
    surface: { materialMode: 'auto', material: { roughness: 1, useRoughnessMap: false } }
  },
  postProcess: {
    bloom: { enabled: false, intensity: 1, luminanceThreshold: 1, luminanceSmoothing: 0.03, radius: 0.85 },
    lensFlare: { enabled: true, intensity: 0.005, quality: 'medium' },
    smaa: true,
    autoExposure: false,
    toneMappingExposure: 5
  }
})
```
