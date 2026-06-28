# 大气、云与后处理

Tellux 把视觉氛围相关的能力组织在 `viewer.scene` 下，分为大气与天空、体积云、地表材质和后处理四个领域。其中**光照模式**单独有一篇详细说明（见「光照模式与参数」），本章覆盖其余部分。

## 场景结构总览

```ts
viewer.scene.atmosphere          // 大气天空、空气透视、光照、夜景、星空、云影
viewer.scene.clouds              // 体积云
viewer.scene.surface             // 基础地球表面材质
viewer.scene.postProcess         // 后处理开关（镜头光晕、SMAA、抖动）
```

每个领域都遵循「初始化配置与运行时入口同构」的原则：`ViewerOptions.scene.xxx` 的字段结构和 `viewer.scene.xxx` 的属性一一对应。

```ts
// 初始化配置
new tellux.Viewer(container, {
  scene: {
    clouds: { show: true, quality: 'medium', coverage: 0.35 }
  }
})

// 运行时修改同样的路径
viewer.scene.clouds.coverage = 0.5
```

## 大气与天空

`viewer.scene.atmosphere` 控制天空、空气透视、光照和夜景。

### 开关与基础参数

```ts
// 大气总开关（关闭后天空、空气透视、太阳光均不渲染）
viewer.scene.atmosphere.show = true
```

### 散射参数

`viewer.scene.atmosphere.scattering` 控制大气散射的物理参数：

| 参数 | 说明 |
| --- | --- |
| `transmittance` | 是否应用大气透射（远处的光被大气衰减）。 |
| `inscatter` | 是否应用空气透视内散射（远处发蓝/发雾）。 |
| `intensity` | 内散射强度。 |
| `horizonBlend` / `horizonRange` | 地平线区域的散射过渡控制。 |
| `correctAltitude` | 是否按相机高度修正散射。 |
| `correctGeometricError` | 是否按几何误差修正散射。 |
| `solarIrradianceScale` | 太阳辐照度缩放。 |
| `rayleighScatteringScale` | 瑞利散射缩放（影响天空蓝色）。 |
| `mieScatteringScale` / `mieExtinctionScale` / `miePhaseFunctionG` | 米氏散射参数（影响日间光晕、朝晚霞）。 |
| `absorptionExtinctionScale` | 臭氧等吸收衰减缩放。 |
| `groundAlbedo` | 地面反照率，影响大地对天空的反射光。 |

```ts
viewer.scene.atmosphere.scattering.intensity = 0.6
viewer.scene.atmosphere.scattering.rayleighScatteringScale = 1.2
```

> 这些是面向调参的物理参数，大多数场景使用默认值即可。WebGPU 模式下部分 WebGL 专属的散射调试参数暂不映射。

### 天空（太阳、月亮、星空）

`viewer.scene.atmosphere.sky` 控制天空中的天体：

| 参数 | 说明 |
| --- | --- |
| `sun` / `moon` | 是否在天空中绘制太阳盘 / 月亮。 |
| `ground` | 是否绘制天空中的地面项。 |
| `stars.show` | 是否显示星空。 |
| `starsIntensity` | 星空亮度缩放。 |
| `starsPointSize` | 星点大小（像素）。 |
| `sunAngularRadius` / `moonAngularRadius` | 太阳 / 月亮角半径（弧度）。 |
| `lunarRadianceScale` | 月光辐射亮度缩放。 |

```ts
viewer.scene.atmosphere.sky.stars.show = true
viewer.scene.atmosphere.sky.sun = true
```

### 夜景

`viewer.scene.atmosphere.night` 控制太阳落山后的夜间光照，避免黑夜一片：

| 参数 | 说明 |
| --- | --- |
| `enabled` | 是否启用夜景光照。 |
| `moonLight` | 是否启用月光方向光。 |
| `ambientLight` | 是否启用夜间环境光。 |
| `color` | 夜间环境光颜色。 |
| `moonLightIntensity` / `ambientIntensity` | 月光 / 环境光强度。 |
| `useMoonPhase` | 是否按月相调整月光强度。 |
| `transitionRange` | 昼夜过渡的太阳高度角范围（度）。 |

```ts
viewer.scene.atmosphere.night.enabled = true
viewer.scene.atmosphere.night.moonLight = true
```

### 云影

`viewer.scene.atmosphere.shadow` 控制体积云投在地表的阴影：

```ts
viewer.scene.atmosphere.shadow.radius = 8
viewer.scene.atmosphere.shadow.sampleCount = 4   // 1 ~ 16
```

需要体积云和地表同时渲染时云影才可见。

### 兜底环境光

`viewer.scene.atmosphere.fallbackAmbientLight` 是独立于夜景的兜底环境光，保证暗面不至于纯黑：

```ts
viewer.scene.atmosphere.fallbackAmbientLight.show = true
viewer.scene.atmosphere.fallbackAmbientLight.intensity = 0.5
```

## 体积云

`viewer.scene.clouds` 控制程序化体积云：

```ts
viewer.scene.clouds.show = true
viewer.scene.clouds.quality = 'medium'
viewer.scene.clouds.coverage = 0.35
```

| 参数 | 说明 |
| --- | --- |
| `show` | 是否显示体积云。 |
| `quality` | 质量档位：`'low'` / `'medium'` / `'high'` / `'ultra'`。越高越细腻，开销越大。 |
| `lightShafts` | 是否启用体积云光柱（云缝间漏光）。 |
| `coverage` | 云覆盖率，`0` 到 `1`。 |
| `speed` | 天气纹理水平移动速度（UV 偏移 / 秒）。 |
| `layerAltitude` | 低云层组云底高度（米）。 |
| `layerHeight` | 低云层组厚度（米）。 |

```ts
// 演变为阴天
viewer.scene.clouds.coverage = 0.7
viewer.scene.clouds.quality = 'high'

// 关闭云
viewer.scene.clouds.show = false
```

::: warning WebGPU 限制
体积云是 WebGL 专属能力，在 **WebGPU 模式下不渲染**（`show` 即使为 `true` 也不会显示）。WebGPU 模式下应设置 `clouds.show: false`。
:::

## 地表材质

`viewer.scene.surface` 控制基础地球（裸球）和地形的表面 PBR 材质。光照模式下的材质切换（`materialMode`）详见「光照模式与参数」。

```ts
// 地表粗糙度 / 金属度
viewer.scene.surface.material.roughness = 1
viewer.scene.surface.material.metalness = 0

// 是否沿用 terrain watermask 等上游粗糙度贴图
viewer.scene.surface.material.useRoughnessMap = false
```

`materialMode` 决定瓦片材质类型：

| `materialMode` | 说明 |
| --- | --- |
| `'auto'`（默认） | 随光照模式自动切换（`light-source` 用 standard，`post-process` 用 basic）。 |
| `'standard'` | 强制 PBR 受光材质。 |
| `'unlit'` | 强制不受光材质，常用于后处理光照场景。 |

## 后处理

`viewer.scene.postProcess` 是后处理效果的开关，每个阶段可通过 `.enabled` 单独控制：

```ts
viewer.scene.postProcess.smaa.enabled = true
viewer.scene.postProcess.lensFlare.enabled = true
viewer.scene.postProcess.dithering.enabled = false
```

| 阶段 | 说明 |
| --- | --- |
| `smaa` | SMAA 抗锯齿。 |
| `lensFlare` | 镜头光晕（太阳 / 月亮产生的炫光）。 |
| `dithering` | 抖动，减少色带。 |

色调映射曝光通过 Viewer 顶层属性控制（不属于 postProcess 子树）：

```ts
viewer.toneMappingExposure = 10
```

::: warning WebGPU 限制
SMAA、镜头光晕、抖动等是 WebGL 专属后处理，在 **WebGPU 模式下不渲染**。WebGPU 模式下调整这些开关没有视觉效果。
:::
