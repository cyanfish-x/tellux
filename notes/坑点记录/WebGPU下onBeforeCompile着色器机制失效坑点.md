# WebGPU 下 onBeforeCompile 着色器机制失效坑点

本文记录 WebGPU 渲染模式下，所有依赖 Three.js `onBeforeCompile` GLSL 注入机制的能力都会失效的限制。核心经验是：Three.js 的 WebGPURenderer 走 NodeMaterial / TSL 体系并直接翻译为 WGSL，根本不执行 `material.onBeforeCompile` 回调，也不会编译其中拼接的 GLSL 片段。因此凡是基于这套机制实现的渲染增强，在 WebGPU 下需要等价替换实现，否则会静默失效。

## 背景

Tellux 在 `feat-webgpu` 分支接入 WebGPU 渲染模式，渲染器适配位于：

- `src/rendering/RendererAdapter.ts`：`createRendererAdapter` 根据 `renderer.type` 选择 `WebGLRendererAdapter` 或 `WebGPURendererAdapter`。
- `src/Viewer.ts:344`：`useWebGPUCompatibleSurfaceOverlay: this.rendererType === 'webgpu'`，WebGPU 模式下 surface / terrain overlay 走替换实现。

`3d-tiles-renderer` 的若干插件通过改写材质 `onBeforeCompile` 来扩展 GLSL 着色器。这些插件在 WebGL 下正常工作，但在 WebGPU 下完全失效。最典型的是 LOD 淡入淡出（fade）和影像 overlay 纹理复合。

## 现象

WebGPU 渲染模式下，地球瓦片在 LOD 层级切换时**没有丝滑的 fade 过渡**，瓦片显隐是直接 pop，对比 WebGL 版本的丝滑淡入淡出体验明显退步。

影像 overlay 贴图在 WebGPU 下反而能正常工作，但这不是「原本的 `ImageOverlayPlugin` 在 WebGPU 下能用」，而是 Tellux 已经写了一套替换实现（见下文根因第 2 点）。

## 根因

### 1. fade 的实现完全依赖 onBeforeCompile + GLSL 注入

`TilesFadePlugin`（`node_modules/3d-tiles-renderer/src/three/plugins/fade/`）的工作链路：

- `FadeMaterialManager.prepareScene(scene)` → `wrapFadeMaterial(material, material.onBeforeCompile)`。
- `wrapFadeMaterial`（`fade/wrapFadeMaterial.js`）改写材质的 `onBeforeCompile`，向顶点 / 片元着色器注入 GLSL：基于 **Bayer 4×4 抖动矩阵**（`bayerDither4x4`），根据 `fadeIn` / `fadeOut` uniform 对片元做 `discard` / 保留，实现瓦片淡入淡出。
- 每帧 `TilesFadePlugin` 的 `onUpdateAfter` 里 `fadeMaterialManager.setFade(scene, fadeIn, fadeOut)` 更新 `fadeIn` / `fadeOut` uniform，并通过 `defines.FEATURE_FADE` 开关抖动代码。

这是纯粹的 GLSL 字符串注入 + WebGL shader 编译期 hook。

### 2. WebGPURenderer 不支持 onBeforeCompile

确认依据：

- `node_modules/three/build/three.webgpu.js` 整个产物里没有任何 `onBeforeCompile` 处理逻辑。
- `node_modules/three/src/renderers/webgpu/WebGPURenderer.js` 只有 `isWebGPURenderer = true`，没有任何 GLSL / WebGLProgram 路径。

WebGPURenderer 走 NodeMaterial / TSL 体系，材质以 Node 节点图构建并直接翻译成 WGSL，编译材质时根本不会调用 `material.onBeforeCompile`。所以 `TilesFadePlugin` 即便被正常注册（`TilesetManager.registerCommonTilesetPlugins`，`src/tiles/TilesetManager.ts:373`）、`FadeMaterialManager.prepareScene` 也被调用、`onBeforeCompile` 也挂上了材质，注入的 `FEATURE_FADE` / bayer 抖动代码永远进不了实际 shader。

### 3. overlay 已经做了替换实现，fade 没有等价替换

`ImageOverlayPlugin` 的正常路径也通过 `onBeforeCompile`（`_wrapMaterials` → `wrapOverlaysMaterial`）注入 `LAYER_COUNT` / `layerMaps` / `layerInfo` 等 GLSL，把 overlay 纹理复合进 shader。这条路在 WebGPU 下同样不通。

正因为如此，Tellux 写了 `src/tiles/WebGPUTerrainOverlayPlugin.ts`：

- `WebGPUTerrainOverlaySplittingPlugin extends ImageOverlayPlugin`。
- `_wrapMaterials() {}` 把父类的 GLSL 注入路径**空覆盖**（`src/tiles/WebGPUTerrainOverlayPlugin.ts:74`）。
- 改用「直接把 `material.map` 指向 overlay texture + 手写 uv」实现贴图（见 `_updateLayers` / `applyOverlayUvToMesh` / `applyTextureToMesh` / `applyTextureToMaterial`）。
- `TerrainTilesetFactory`（`src/tiles/TerrainTilesetFactory.ts:55-61`）在 `useDirectOverlayTexture === true`（即 WebGPU 模式）时用 `WebGPUTerrainOverlayPlugin` 替代原生 `ImageOverlayPlugin`。

也就是说：**overlay 在 WebGPU 下能工作，是因为已经做了替换实现；fade 没有做任何替换实现，所以失效。**

## 当前状态

- fade 在 WebGPU 模式下静默失效，瓦片 LOD 切换为直接 pop。
- `TilesFadePlugin` 仍被注册，但不产生任何视觉效果（只消耗少量 CPU 开销维护 fade 状态）。
- overlay 通过 `WebGPUTerrainOverlayPlugin` 替换实现，在 WebGPU 下正常工作。

这不是 Tellux 代码 bug，而是上游 + 渲染后端的根本限制：在 WebGPU 渲染模式下，所有依赖 `onBeforeCompile` 的效果都会失效，fade 和原生 overlay 路径是其中两类。

## 后续完善方向

要让 WebGPU 下恢复丝滑 fade，基本没有「小改」可以解决，缺失的是一整个 WGSL 着色器层。候选方向：

1. **WebGPU 版 fade 插件（推荐）**：仿照 `WebGPUTerrainOverlayPlugin` 替换 `ImageOverlayPlugin` 的思路，做一个 WebGPU 版 fade 插件。注意无法用 `onBeforeCompile`，只能用 NodeMaterial / TSL 或自定义 WGSL 后处理实现 Bayer 抖动淡入淡出。工作量较大，且要和现有 surface / terrain 材质节点图兼容，需要和 `SurfaceMaterialPlugin`、`SceneTilesetMaterialPlugin` 的材质改写链路协调。

2. **透明度插值 fade**：放弃 Bayer 抖动，改用 `material.opacity` 插值 + 透明排序。实现简单，但地球瓦片是不透明排序的，会产生排序 / blending 问题，效果与 WebGL 版不一致。

3. **统一规划**：这本质上是「WebGPU 渲染模式下整套 GLSL 注入能力需要 TSL 等价物」的子问题。如果未来还有其他 `onBeforeCompile` 能力要接入，建议统一设计一套 WebGPU 材质扩展方案，而不是逐个能力临时替换。

## 关键源码索引

实现 fade 替换时需要对照的源码：

- 渲染器适配：`src/rendering/RendererAdapter.ts`
- WebGPU 模式开关：`src/Viewer.ts:344`（`useWebGPUCompatibleSurfaceOverlay`）
- 插件注册入口：`src/tiles/TilesetManager.ts:370`（`registerCommonTilesetPlugins`，注册 `TilesFadePlugin`）
- overlay 替换实现参考：`src/tiles/WebGPUTerrainOverlayPlugin.ts`、`src/tiles/TerrainTilesetFactory.ts:55-61`
- surface tileset 工厂：`src/tiles/SurfaceTilesetFactory.ts`
- 材质改写链路：`src/tiles/TilesetModelPlugins.ts`（`SurfaceMaterialPlugin`、`SceneTilesetMaterialPlugin`）

上游 fade 实现参考（GLSL 路径，WebGPU 下不可用，但逻辑需要移植）：

- `node_modules/3d-tiles-renderer/src/three/plugins/fade/TilesFadePlugin.js`
- `node_modules/3d-tiles-renderer/src/three/plugins/fade/FadeMaterialManager.js`
- `node_modules/3d-tiles-renderer/src/three/plugins/fade/wrapFadeMaterial.js`
