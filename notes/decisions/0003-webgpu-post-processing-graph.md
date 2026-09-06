# WebGPU 后处理图由单一组合根管理

> 2026-09-06 复核范围：静态核对 WebGPUPostProcessingManager 及 LensFlare/TAA stage；本次只确认所有权与接入，不验证 GPU 行为。


**状态：已接受**

**日期：2026-08-23**

## 背景

WebGPU 初版为了让 `AerialPerspectiveNode` 输出到屏幕，由 `WebGPUAtmosphereManager` 自己创建 `pass(scene, camera)`、`RenderPipeline`，并通过 renderer delegate 接管渲染。这个路径能渲染大气和星空，但后续任何 WebGPU 后处理（描边、EDL、调色或调试视图）都必须侵入大气类，或争抢同一个 render delegate。

`RenderPipeline` 的最终输出本身是 TSL node，适合以“场景颜色 → 场景合成 → 有序效果阶段 → 最终 output”的图形方式扩展。当前 `postprocessing` 的 WebGL `EffectPass`、`NormalPass` 和 `setEffects()` 不能直接复用到 WebGPU。

## 决策

新增内部 `WebGPUPostProcessingManager` 作为 WebGPU 后处理图的唯一组合根：

1. 它创建并持有唯一的 `scenePass`、`RenderPipeline` 和 renderer delegate。
2. `WebGPUAtmosphereManager` 只创建带 `AtmosphereContext` 的空气透视 / 天空合成节点，并通过 `setSceneCompositor()` 注册为场景合成阶段；关闭大气时图直接输出 `scenePass`。
3. 后续效果以具名 `WebGPUPostProcessStage` 按显式 `order`（相同 order 保留注册顺序）组合，输入是前一阶段的颜色节点；所有阶段共享同一个 `scenePass`，从而共享场景颜色和深度来源。
4. stage 可按需声明 `normal`、`velocity` 场景附件。图从活动 stage 汇总需求，并仅在需要时以 Three.js `mrt({ output, ... })` 配置共享 `scenePass`；颜色和深度始终可用，当前没有需求时不启用 MRT。
5. 图向已注册 stage 转发容器 CSS 尺寸和 renderer pixel ratio，并在移除或图销毁时调用 stage 的 `dispose()`；图本身负责销毁其创建的 `scenePass` 和 `RenderPipeline`。大气保留自己的资源所有权，销毁时先注销 scene compositor。
6. 当前不把任何 WebGL `postprocessing` 效果伪装成 WebGPU 已支持；LensFlare 已作为 TSL stage 接入并排在 TAA 前，SMAA、抖动、体积云、OIT 和 EDL 仍需各自以 TSL / WebGPU pass 方式接入。

## 被否决的方案

- **继续在 `WebGPUAtmosphereManager` 叠加效果节点**：大气类会同时负责物理参数、星表资源、光源、场景 pass、效果排序和 render delegate，职责不可维护。
- **让每种效果各自注册 renderer delegate**：delegate 只允许有一个实际渲染入口，后注册者会覆盖先注册者，效果顺序也不可预测。
- **复用 WebGL `PostProcessingManager` / `EffectPass`**：它依赖 WebGL render target、`setEffects()` 和 GLSL effect contract，不是 WebGPU/TSL 兼容接口。

## 后果与维护要求

- WebGPU 的最终色调映射仍由唯一 `RenderPipeline` 负责，新的阶段必须返回线性颜色节点，不能自行输出到 canvas 或绕过 output transform。
- 新阶段需要明确其 `sceneAttachments`、`setSize()` 和 `dispose()` 需求；不要重新创建场景 pass 或自行设置 MRT。法线、速度等附件由图按活动需求统一配置。
- `WebGPUAtmosphereManager` 不能恢复 render delegate 或 `RenderPipeline` 所有权。新增 WebGPU 渲染能力时，优先扩展图 stage，而不是向 Viewer 添加第二条渲染循环。
- `RenderPipeline` 是唯一执行 AgX 与输出色彩空间转换的位置。stage 必须保持在线性工作空间，不能自行输出到 canvas 或再次 tone map。
- 后续接入具体效果时必须分别补视觉和性能回归；本决策只提供组合、MRT、尺寸和生命周期基础设施。
