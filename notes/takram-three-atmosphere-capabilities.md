# @takram/three-atmosphere 能力备忘

本文档记录 Tellux 当前依赖的 `@takram/three-atmosphere` 能力范围，便于后续评估大气、太阳/月亮、天空光照和后处理 API 的设计。

当前 Tellux 依赖版本：

- `@takram/three-atmosphere`: `0.19.1`
- 上游定位：Three.js / R3F 的预计算大气散射实现。
- Tellux 中主要入口：
  - `AerialPerspectiveEffect`
  - `PrecomputedTexturesGenerator`
  - `getSunDirectionECEF`
  - `getMoonDirectionECEF`

## 总体定位

`@takram/three-atmosphere` 提供基于 Eric Bruneton 预计算大气散射模型的天空、大气透射、空气透视、太阳/月亮方向、天空光照和太阳光照能力。

对 Tellux 来说，它承担的是地球场景的物理大气和光照层。Tellux 目前主要使用后处理路径，把大气、太阳盘、月亮、地面项、云影和云层合成到 `postprocessing` 的 `EffectPass` 中。

## 包入口和边界

可用子入口：

- `@takram/three-atmosphere`
  - 普通 Three.js / postprocessing 入口。
- `@takram/three-atmosphere/r3f`
  - React Three Fiber 组件入口，Tellux 当前不使用。
- `@takram/three-atmosphere/shaders`
  - shader 片段和工具入口。
- `@takram/three-atmosphere/shaders/bruneton`
  - Bruneton 大气散射 shader 入口。
- `@takram/three-atmosphere/webgpu`
  - WebGPU / TSL 相关入口，Tellux 当前不使用。

Tellux 当前是 ESM TypeScript 库，应优先使用普通 Three.js 入口，避免把 R3F 组件作为公开依赖方向。

## 预计算纹理能力

大气模型依赖一组 LUT 纹理：

- `transmittanceTexture`
- `scatteringTexture`
- `irradianceTexture`
- `singleMieScatteringTexture`
- `higherOrderScatteringTexture`

相关工具：

- `PrecomputedTexturesGenerator`
  - 使用 renderer 在运行时生成大气 LUT。
  - 返回可直接赋给大气、云、天空光和太阳光的纹理集合。
  - 需要在销毁时释放生成器和纹理。
- `PrecomputedTexturesLoader`
  - 从外部资源加载预计算纹理。
  - 适合离线预生成或固定资产部署场景。

Tellux 当前用法：

- `AtmosphereManager` 创建 `PrecomputedTexturesGenerator(renderer)`。
- `loadTextures()` 中调用 `texturesGenerator.update()`。
- 将生成的纹理同时赋给 `AerialPerspectiveEffect` 和 `CloudsEffect`。
- `dispose()` 时释放 generator 和已加载纹理。

## 空气透视后处理

`AerialPerspectiveEffect` 是 Tellux 当前最核心的大气入口。它是 `postprocessing` 的 `Effect`，可放入 `EffectPass`。

主要能力：

- 基于相机位置和深度/法线信息做大气透射和空气散射。
- 支持天空背景绘制。
- 支持太阳盘、月亮和大气中的地面项。
- 支持太阳直射光和天空环境光的后处理光照。
- 支持传入云层 overlay、云影和 shadow length，与 `@takram/three-clouds` 合成。
- 支持 STBN 纹理，减少采样噪声。
- 支持椭球和 ECEF 坐标系转换。

常用控制项：

- `normalBuffer`: 法线纹理。Tellux 当前由 `postprocessing` 的 `NormalPass` 提供。
- `octEncodedNormal`: normal buffer 是否为 oct 编码。
- `reconstructNormal`: 是否从深度重建法线。
- `ellipsoid`: 椭球，默认 WGS84。
- `correctAltitude`: 修正椭球和球形大气近似之间的高度误差。
- `correctGeometricError`: 修正地表瓦片几何误差导致的光照伪影。
- `sunDirection`: ECEF 下太阳方向。
- `moonDirection`: ECEF 下月亮方向。
- `sunLight`: 是否在后处理中应用太阳直射光。
- `skyLight`: 是否在后处理中应用天空光。
- `transmittance`: 是否应用大气透射。
- `inscatter`: 是否应用空气散射。
- `albedoScale`: 后处理光照使用的反照率缩放。
- `sky`: 是否绘制天空。
- `sun`: 是否绘制太阳盘。
- `moon`: 是否绘制月亮。
- `ground`: 是否绘制大气天空中的地面项。
- `sunAngularRadius`
- `moonAngularRadius`
- `lunarRadianceScale`
- `shadowRadius`
- `shadowSampleCount`

Tellux 当前用法：

- `AtmosphereManager` 创建 `new AerialPerspectiveEffect(camera)`。
- 默认开启 `sky`、`sunLight`、`skyLight`。
- `PostProcessingManager` 根据 `scene.skyAtmosphere.show` 将大气 effect 放入渲染管线。
- 云开启时使用 `EffectPass(camera, cloudsEffect, aerialPerspectiveEffect)`，云关闭时使用 `EffectPass(camera, aerialPerspectiveEffect)`。
- Tellux 额外 patch 了 shader uniform，用于控制 `atmosphereInscatterIntensity` 和地平线混合。

## 太阳和月亮方向

可用工具：

- `getSunDirectionECEF(date, target?)`
- `getMoonDirectionECEF(date, target?)`

主要能力：

- 根据 `Date` 或时间戳计算 ECEF 坐标系中的太阳/月亮方向。
- 可复用 `Vector3` target，减少帧更新中的临时对象。

Tellux 当前用法：

- `Clock` 驱动 `AtmosphereManager.updateSunDirection(currentTime)`。
- 同步设置：
  - `aerialPerspectiveEffect.sunDirection`
  - `aerialPerspectiveEffect.moonDirection`
  - `cloudsEffect.sunDirection`
  - Tellux 自己的 `THREE.DirectionalLight` 位置

## 光源式光照能力

除后处理光照外，上游还提供光源式光照：

- `SunDirectionalLight`
  - 根据太阳方向和大气透射计算太阳方向光。
- `SkyLightProbe`
  - 根据天空辐照度计算环境光探针。
- `getSunLightColor`
  - 根据大气透射估算太阳光颜色。

适用场景：

- 自定义 Three.js 物体使用标准材质，需要真实光源照明。
- 不希望所有表面都通过后处理 Lambert 光照统一处理。

Tellux 当前状态：

- 当前 Tellux 使用自己的 `THREE.DirectionalLight` 和 `THREE.HemisphereLight` 做基础光照。
- 后处理路径中开启 `AerialPerspectiveEffect.sunLight` 和 `skyLight`。
- 未来如要增强自定义对象的物理光照，可评估把 `SunDirectionalLight` / `SkyLightProbe` 接入为可选模式。

注意点：

- 后处理光照和光源式光照同时使用时容易重复照明。
- 上游建议需要通过 `LightingMaskPass` 或 MRT 选择性混合。

## 天空和星空材质

可用对象：

- `SkyMaterial`
  - 用于绘制天空背景。
  - 依赖大气 LUT、太阳/月亮方向、椭球和 ECEF 矩阵。
- `StarsGeometry`
- `StarsMaterial`
  - 用于星空背景。

Tellux 当前状态：

- 当前 Tellux 没有直接创建 `SkyMaterial` 或星空对象。
- 天空主要由 `AerialPerspectiveEffect.sky` 在后处理中绘制。
- 后续若要提供独立天空对象或星空开关，可评估引入这些材质。

## 混合光照和遮罩

可用对象：

- `LightingMaskPass`

主要能力：

- 为后处理光照生成 mask。
- 允许部分对象走后处理光照，部分对象走 Three.js 光源式光照。
- 用于解决透明物体、自定义材质和后处理 Lambert 光照之间的职责边界。

Tellux 当前状态：

- 当前未接入 `LightingMaskPass`。
- 如果后续要让用户添加的 PBR 模型不受后处理光照重复影响，可以把该能力作为高级渲染选项。

## 与云层合成

`AerialPerspectiveEffect` 可接收来自 `CloudsEffect` 的合成资源：

- `overlay`
- `shadow`
- `shadowLength`

Tellux 当前用法：

- `AtmosphereManager.syncCloudAtmosphereComposition(...)` 根据云和大气可见性设置这些引用。
- 云开启且大气开启时，大气 effect 读取云层的 overlay / shadow / shadowLength。
- 云关闭或大气关闭时清空引用，避免残留合成状态。

光照模式限制：

- 体积云云影对地表/瓦片的明暗影响依赖 `AerialPerspectiveEffect.sunLight` 的后处理光照分支，因此只有 `scene.atmosphereLightingMode = 'post-process'` 时生效。
- `light-source` 模式下地表/瓦片走 Three.js 光源式照明；云层仍可渲染和合成，但 Three.js 普通光源不会采样 `CloudsEffect.atmosphereShadow`。

## 资源和部署注意点

- 运行时生成大气 LUT 不需要额外静态资产，但需要 WebGL 渲染能力。
- 如果改为加载预计算纹理，需要把相关纹理纳入 Tellux 资产路径或用户可配置路径。
- `AerialPerspectiveEffect` 与 `CloudsEffect` 都可使用 STBN 纹理；Tellux 当前通过 `@takram/three-geospatial` 的 `STBNLoader` 加载。

## 后续可扩展方向

- 暴露更完整的 Cesium 风格 `scene.skyAtmosphere` 参数。
- 增加 `scene.sun` / `scene.moon` / `scene.sky` 细分控制。
- 增加可选的 `SunDirectionalLight` 和 `SkyLightProbe` 光源式光照模式。
- 支持预计算纹理外部 URL 或本地资产注入。
- 用 `LightingMaskPass` 区分地表、3D Tiles、自定义对象和透明对象的光照路径。
- 为调试提供大气 LUT、太阳方向、月亮方向和云影合成状态输出。
