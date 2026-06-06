# @takram/three-clouds 能力备忘

本文档记录 Tellux 当前依赖的 `@takram/three-clouds` 能力范围，便于后续评估体积云、云影、天气纹理和性能调参 API 的设计。

当前 Tellux 依赖版本：

- `@takram/three-clouds`: `0.7.6`
- 上游定位：Three.js / R3F 的地理体积云实现。
- Tellux 中主要入口：
  - `CloudsEffect`
  - `CloudLayer`
  - `CloudLayers`
  - 默认云纹理 URL 常量

## 总体定位

`@takram/three-clouds` 提供地球尺度的体积云后处理效果，包括云层建模、天气纹理、体积 ray marching、时间重投影、云影、光柱、雾霾和与大气散射的合成。

对 Tellux 来说，它承担的是 `scene.clouds` 能力。Tellux 当前以 `CloudsEffect` 作为唯一渲染入口，并通过 `AerialPerspectiveEffect` 完成云与大气的最终合成。

## 包入口和边界

可用子入口：

- `@takram/three-clouds`
  - 普通 Three.js / postprocessing 入口。
- `@takram/three-clouds/r3f`
  - React Three Fiber 组件入口，Tellux 当前不使用。

Tellux 当前应继续基于普通 Three.js 入口封装 API，避免把 R3F 组件作为公开依赖方向。

## CloudsEffect 能力

`CloudsEffect` 是 `postprocessing` 的 `Effect`，可放入 `EffectPass`。

主要能力：

- 渲染体积云颜色和透明度。
- 对云本身应用大气透射和天空/太阳光照。
- 支持时间重投影和 temporal upscale。
- 支持光柱、shape detail、turbulence、haze。
- 支持 Beer shadow maps 和级联云影。
- 输出可供 `AerialPerspectiveEffect` 合成的：
  - `atmosphereOverlay`
  - `atmosphereShadow`
  - `atmosphereShadowLength`
- 支持接收大气 LUT：
  - `irradianceTexture`
  - `scatteringTexture`
  - `transmittanceTexture`
  - `singleMieScatteringTexture`
  - `higherOrderScatteringTexture`
- 支持椭球、ECEF 矩阵和太阳方向。

常用控制项：

- `qualityPreset`: `'low' | 'medium' | 'high' | 'ultra'`
- `resolutionScale`
- `temporalUpscale`
- `lightShafts`
- `shapeDetail`
- `turbulence`
- `haze`
- `coverage`
- `scatteringCoefficient`
- `absorptionCoefficient`
- `turbulenceDisplacement`
- `scatterAnisotropy1`
- `scatterAnisotropy2`
- `scatterAnisotropyMix`
- `skyLightScale`
- `groundBounceScale`
- `powderScale`
- `powderExponent`
- `correctAltitude`
- `sunAngularRadius`

Tellux 当前用法：

- `AtmosphereManager` 创建 `new CloudsEffect(camera)`。
- 设置 `localWeatherVelocity` 形成云纹理位移动画。
- 调整 `shadow` shorthand：
  - `farScale`
  - `maxFar`
  - `cascadeCount`
  - `mapSize`
  - `splitMode`
  - `splitLambda`
- 监听 `cloudsEffect.events` 的 `change` 事件，在云合成资源变化时刷新后处理管线。
- `Scene.cloudCoverage` 映射到 `cloudsEffect.coverage`。
- `Scene.cloudLayerAltitude` 和 `Scene.cloudLayerHeight` 修改低云层组的前两层。

## 云层建模

可用对象：

- `CloudLayer`
- `CloudLayers`

单个 `CloudLayer` 主要参数：

- `channel`
  - 使用 local weather 纹理的哪个通道。
  - 上游最多支持 4 个云层，因为层覆盖率以 `vec4` 通道方式打包。
- `altitude`
  - 云底高度，单位米，基于椭球表面。
- `height`
  - 云层厚度，单位米。为 `0` 时可视为禁用该层。
- `densityScale`
- `shapeAmount`
- `shapeDetailAmount`
- `weatherExponent`
- `shapeAlteringBias`
- `coverageFilterWidth`
- `densityProfile`
- `shadow`
  - 是否参与云影。

Tellux 当前用法：

- 使用上游默认云层。
- 对默认低云层组做用户 API 映射：
  - 第 0 层高度偏移 `0`
  - 第 1 层高度偏移 `250`
  - 第 0 层厚度比例 `1`
  - 第 1 层厚度比例 `1200 / 650`
- 暂未公开完整 `CloudLayer` 数组配置。

后续可扩展方向：

- 支持用户传入多云层配置。
- 支持按层设置覆盖率通道、云底高度、厚度和是否投影云影。
- 支持高云、低云分组 preset。
- 支持把云层参数以 Cesium 风格 `scene.clouds.layers` 暴露。

## 天气和噪声纹理

`CloudsEffect` 需要多类纹理：

- `localWeatherTexture`
  - 本地天气纹理。
  - 每个通道表示一个云层的天气信号。
  - 纹理需要可平铺。
- `shapeTexture`
  - 3D shape 纹理。
  - 控制云体基础形状。
- `shapeDetailTexture`
  - 3D detail 纹理。
  - 控制更细的侵蚀和细节。
- `turbulenceTexture`
  - 2D turbulence 纹理。
  - 用于 domain distortion。
- `stbnTexture`
  - 3D spatiotemporal blue noise 纹理。
  - 用于降低 ray marching 噪声。

上游提供默认资源 URL 常量：

- `DEFAULT_LOCAL_WEATHER_URL`
- `DEFAULT_SHAPE_URL`
- `DEFAULT_SHAPE_DETAIL_URL`
- `DEFAULT_TURBULENCE_URL`

Tellux 当前用法：

- 通过 `getTelluxAssetUrl(...)` 包装默认 URL。
- `localWeatherTexture` 和 `turbulenceTexture` 使用 `THREE.TextureLoader`。
- `shapeTexture` 和 `shapeDetailTexture` 通过 fetch 加载二进制，再创建 `THREE.Data3DTexture`。
- `stbnTexture` 使用 `@takram/three-geospatial` 的 `STBNLoader`。
- 所有手动加载的纹理都在 `AtmosphereManager.dispose()` 中释放。

部署注意点：

- 默认资源 URL 指向上游 GitHub media，内网或离线环境需要通过 Tellux 资产路径替换。
- 二进制 3D 纹理的尺寸需要匹配上游常量：
  - `CLOUD_SHAPE_TEXTURE_SIZE`
  - `CLOUD_SHAPE_DETAIL_TEXTURE_SIZE`
- 纹理 filter、wrap 和 colorSpace 需要保持与体积采样需求一致。

## 程序化纹理

可用对象：

- `ProceduralTexture`
- `Procedural3DTexture`
- `LocalWeather`
- `CloudShape`
- `CloudShapeDetail`
- `Turbulence`

主要能力：

- 用 shader / render target 生成云所需的 2D 或 3D 噪声纹理。
- 可作为 `CloudsEffect` 的纹理参数传入。
- 每帧可调用 `render(renderer)` 更新输出纹理。

Tellux 当前状态：

- Tellux 当前手动加载默认纹理，没有接入程序化生成。
- 后续如果要支持“无外部资产”的云层，或提供可调噪声种子，可以评估这些入口。

## 云影能力

`CloudsEffect` 内部包含：

- `shadowMaps`
- `shadowPass`
- `shadow` shorthand

主要能力：

- Beer shadow maps。
- 级联 shadow maps。
- 控制 shadow map 分辨率和级联数量。
- 控制 ray marching 步长、迭代次数、密度阈值和透射阈值。
- 输出 `atmosphereShadow` 和 `atmosphereShadowLength` 供大气后处理合成。

Tellux 当前用法：

- 默认降低云影开销：
  - `cascadeCount = 2`
  - `mapSize = 512 x 512`
  - `farScale = 0.25`
  - `maxFar = 1e5`
  - `splitMode = 'practical'`
  - `splitLambda = 0.71`
- 用户可通过 `scene.atmosphereShadowRadius` 和 `scene.atmosphereShadowSampleCount` 控制大气合成时的云影采样。
- 云影只在 `scene.atmosphereLightingMode = 'post-process'` 时会影响地表/瓦片光照。`CloudsEffect` 产出的 `atmosphereShadow` 由 `AerialPerspectiveEffect` 的后处理光照分支采样；默认 `light-source` 模式使用 Three.js 太阳光/天空光照明，不会读取体积云 shadow map。

## 性能注意点

上游明确指出体积云不是轻量效果。影响性能的主要因素：

- `qualityPreset`
- `resolutionScale`
- `temporalUpscale`
- `lightShafts`
- `shapeDetail`
- `turbulence`
- 云层总厚度
- ray marching 迭代次数和步长
- 云影级联数量和 shadow map 分辨率
- 视线穿过云层壳体的距离

Tellux API 设计建议：

- 默认保持保守参数。
- 先公开少量高价值参数：
  - 云开关
  - 覆盖率
  - 云底高度
  - 云层厚度
  - 质量 preset
  - 云影开关或质量
- 将高级 ray marching 参数放入 debug / advanced 配置，避免普通用户误调。

## 已知限制

上游限制和注意点：

- 云层数量最多 4 层。
- local weather 不是无缝覆盖整个地球，而是基于 cube-sphere UV 平铺，可能在部分位置出现接缝。
- 云底高度当前相对椭球表面，不完全等同真实气象高度。
- 难以在提升视觉质量、性能和功能时保持完全一致的输出。
- 体积云对移动端或低端 GPU 压力较大。

Tellux 对外说明建议：

- 体积云适合真实感地球和演示场景。
- 性能敏感场景可关闭云，或未来提供 skybox / 简化云方案。

## 后续可扩展方向

- 公开 `scene.clouds.qualityPreset`。
- 公开完整云层数组配置。
- 支持外部 weather / shape / turbulence / STBN 资源路径。
- 支持程序化云纹理生成和 seed。
- 支持云影质量 preset。
- 支持 debug 输出云层、云影级联、纹理加载状态和上游合成 buffer 状态。
