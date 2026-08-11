# 场景效果：大气 / 光照 / 体积云 / 后处理 / 地表材质

所有视觉氛围能力都在 `viewer.scene` 下，按领域分组。**初始化配置与运行时入口同构**（路径一致），下文示例两种用法通用。

## 光照模式（先选模式再调参）

Tellux 有两种大气光照模式，默认 `light-source`。这是最关键的选择，决定材质和受光方式。

```ts
viewer.scene.atmosphere.lighting.mode = 'light-source'   // 或 'post-process'
```

| 模式 | 原理 | 适用 |
| --- | --- | --- |
| `'light-source'`（默认） | 用 Takram 太阳方向光 + 天空光探针，材质走 Three.js 常规受光 | 3D Tiles、地形、overlay、自定义模型、PBR——**大多数 GIS 场景** |
| `'post-process'` | 把渲染结果当 albedo，在 `AerialPerspectiveEffect` 里应用大气光照 | 需要统一大气后处理的高级场景；输入材质必须是不受光的（basic / unlit） |

### light-source 调光

```ts
viewer.scene.atmosphere.lighting.sunLight = true
viewer.scene.atmosphere.lighting.skyLight = true
viewer.scene.atmosphere.lighting.sunLightIntensity = 1.2
viewer.scene.atmosphere.lighting.skyLightIntensity = 0.8
```

### post-process 注意事项

PBR / 受光材质在 post-process 模式下光源会被关闭，瓦片可能变暗变黑。此时要么改回 `light-source`，要么给需要后处理光照的 3D Tiles 用 `materialMode: 'unlit'`：

```ts
const layer = viewer.load3DTileset({ type: 'url', url: '...', materialMode: 'unlit' })
viewer.scene.atmosphere.lighting.albedoScale = 0.6
```

## 大气与天空

```ts
viewer.scene.atmosphere.show = true   // 总开关，关掉则天空/空气透视/太阳光都不渲染
```

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

> **星空在 WebGPU 模式下不渲染。**

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

viewer.scene.atmosphere.fallbackAmbientLight.show = true   // 独立于夜景的兜底环境光
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

典型用法：阴天效果 `coverage = 0.7, quality = 'high'`；关云 `show = false`。

## 地表材质

只作用于 Viewer 管理的基础地球和地形，不影响 `load3DTileset` / `addModel`。

```ts
viewer.scene.surface.materialMode = 'auto'   // 'auto'(随光照) | 'basic' | 'standard'
viewer.scene.surface.material.roughness = 1
viewer.scene.surface.material.metalness = 0
viewer.scene.surface.material.useRoughnessMap = false   // 关掉可避免海面强太阳反光
```

## 后处理

每个阶段用 `.enabled` 单独控制；色调曝光是顶层属性。

```ts
viewer.scene.postProcess.smaa.enabled = true
viewer.scene.postProcess.lensFlare.enabled = true
viewer.scene.postProcess.lensFlare.intensity = 0.005
viewer.scene.postProcess.lensFlare.quality = 'medium'
viewer.scene.postProcess.dithering.enabled = false
viewer.toneMappingExposure = 10
```

> **SMAA / 镜头光晕 / 抖动在 WebGPU 模式下不渲染**，WebGPU 下调这些开关无视觉效果。

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
    surface: { materialMode: 'auto', material: { roughness: 1, useRoughnessMap: false } },
    postProcess: {
      lensFlare: { enabled: true, intensity: 0.005, quality: 'medium' },
      smaa: true,
      toneMappingExposure: 10
    }
  }
})
```
