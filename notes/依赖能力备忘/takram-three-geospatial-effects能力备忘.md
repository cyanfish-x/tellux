# @takram/three-geospatial-effects 能力备忘

本文档记录 Tellux 当前依赖的 `@takram/three-geospatial-effects` 能力范围，便于后续评估镜头光晕、抖动、深度/法线调试和几何 G-buffer API 的设计。

当前 Tellux 依赖版本：

- `@takram/three-geospatial-effects`: `0.6.4`
- 上游定位：面向 Three.js / postprocessing 的后处理效果集合。
- Tellux 中主要入口：
  - `LensFlareEffect`
  - `DitheringEffect`

## 总体定位

`@takram/three-geospatial-effects` 提供一组基于 `postprocessing` 的效果和 pass。它不是专门的 GIS 数据加载包，而是为 Takram 地理渲染场景提供常用的屏幕后处理、G-buffer 辅助和调试输出。

对 Tellux 来说，它承担的是 `scene.postProcessStages` 里的镜头光晕和抖动能力。SMAA 当前来自 `postprocessing` 自身。

## 包入口和边界

可用子入口：

- `@takram/three-geospatial-effects`
  - 普通 Three.js / postprocessing 入口。
- `@takram/three-geospatial-effects/r3f`
  - React Three Fiber 组件入口，Tellux 当前不使用。

Tellux 当前应继续基于普通 Three.js 入口封装 API，避免把 R3F 后处理组件作为公开依赖方向。

## 镜头光晕

可用对象：

- `LensFlareEffect`

主要能力：

- 从输入 buffer 中提取高亮区域。
- 通过 downsample threshold、pre-blur、mipmap blur 和 features pass 生成镜头光晕。
- 作为 `postprocessing` 的 `Effect` 放入 `EffectPass`。

主要配置：

- `blendFunction`
- `resolutionScale`
- `width`
- `height`
- `resolutionX`
- `resolutionY`
- `intensity`

运行时属性：

- `intensity`
- `thresholdLevel`
- `thresholdRange`
- `resolution`
- `thresholdPass`
- `blurPass`
- `preBlurPass`
- `featuresPass`
- `featuresMaterial`

Tellux 当前用法：

- `PostProcessingManager` 创建 `new LensFlareEffect()`。
- 包装为 `EffectPassAdapter(new EffectPass(camera, new LensFlareEffect()), ...)`。
- 由 `scene.postProcessStages.lensFlare.enabled` 控制是否加入后处理管线。

后续可扩展方向：

- 公开 `scene.postProcessStages.lensFlare.intensity`。
- 公开阈值参数 `thresholdLevel` 和 `thresholdRange`。
- 根据太阳屏幕位置或亮度控制光晕强度。
- 提供质量 preset，调整 `resolutionScale`。

## 抖动

可用对象：

- `DitheringEffect`

主要能力：

- 对最终画面应用 dithering，降低 banding。
- 作为 `postprocessing` 的 `Effect` 放入 `EffectPass`。

主要配置：

- `blendFunction`

Tellux 当前用法：

- `PostProcessingManager` 创建 `new DitheringEffect()`。
- 由 `scene.postProcessStages.dithering.enabled` 控制是否加入后处理管线。
- 当前没有额外公开参数。

API 设计建议：

- 抖动通常作为最终 pass，适合默认放在 SMAA 之后。
- 对用户公开开关即可；如未来需要高级控制，可只暴露 blend mode 或强度类封装。

## 深度和法线效果

可用对象：

- `DepthEffect`
- `NormalEffect`

`DepthEffect` 主要能力：

- 输出或可视化深度信息。
- 支持 `blendFunction` 等 effect 选项。

`NormalEffect` 主要能力：

- 输出或可视化法线信息。
- 可接收 `normalBuffer`。
- 支持 `octEncoded`。
- 支持 `reconstructFromDepth`。
- 需要 camera，用于矩阵和深度重建。

Tellux 当前状态：

- 当前 Tellux 使用 `postprocessing` 的 `NormalPass` 给 `AerialPerspectiveEffect.normalBuffer` 提供法线。
- 未使用 Takram 的 `NormalEffect` 或 `DepthEffect`。

后续可扩展方向：

- 提供 debug post-process stage，显示 depth / normal。
- 如果未来要减少 `NormalPass` 依赖，可评估 `NormalEffect` 是否能满足大气所需 normal buffer 或调试需求。

## 几何 Pass 和材质设置

可用对象和函数：

- `GeometryPass`
- `setupMaterialsForGeometryPass`

相关上游类型：

- `GeometryEffect`
  - 类型声明中存在，但当前包的主入口没有导出它。

主要能力：

- 为后处理生成几何相关 buffer。
- 配合材质设置函数，让材质在 geometry pass 中输出特定信息。
- R3F 入口中提供与 geometry pass 相关的 `EffectComposer` 封装。

Tellux 当前状态：

- 当前没有接入 `GeometryPass`。
- 如后续要实现更完整的 deferred-style 后处理、材质调试或自定义 G-buffer，可评估这一组能力。

## Hald LUT 工具

可用函数：

- `createHaldLookupTexture(texture)`

主要能力：

- 从 Hald 图像纹理创建 `postprocessing` 可用的 `LookupTexture`。
- 适合色彩分级 LUT。

Tellux 当前状态：

- 当前没有接入 LUT 调色。

后续可扩展方向：

- 增加 `scene.postProcessStages.colorGrading`。
- 允许用户传入 Hald LUT 纹理。
- 作为演示和视觉风格参数，而不是 GIS 核心能力。

## 后处理管线集成

Tellux 当前管线顺序由 `PostProcessingManager.applyEffects()` 控制：

- 大气开启时先加入 `NormalPass`。
- 云开启时加入 `CloudsEffect + AerialPerspectiveEffect` 的组合 pass。
- 云关闭但大气开启时加入单独 `AerialPerspectiveEffect` pass。
- 镜头光晕开启时加入 `LensFlareEffect`。
- SMAA 开启时加入 `SMAAEffect`。
- 抖动开启时加入 `DitheringEffect`。

注意点：

- `LensFlareEffect` 应放在大气/云之后，才能基于最终亮部产生光晕。
- `DitheringEffect` 适合作为较靠后的最终画质 pass。
- 如果未来接入 depth / normal debug，应避免和真实渲染 pass 同时混用，最好作为 debug view 替换最终输出。

## 后续可扩展方向

- 为 `LensFlareEffect` 增加强度、阈值和质量配置。
- 为 `DitheringEffect` 保持简单开关，默认作为末尾 pass。
- 增加 depth / normal debug view。
- 评估 `GeometryPass` 用于更完整的材质和 G-buffer 调试。
- 评估 `createHaldLookupTexture` 用于色彩分级。

