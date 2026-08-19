# WebGPU 地形瓦片 modelView 精度抖动坑点

本文记录 WebGPU 渲染模式下，拖转相机时地形 / 3D Tiles 瓦片网格出现抖动，而同配置 WebGL 几乎不抖的根因。核心经验是：**WebGL 在 CPU float64 上预乘 `modelViewMatrix`；WebGPU Node/TSL 默认在 GPU float32 上做 `view × world`，地球尺度 ECEF 会丢精度。** 这和 Tellux 自研的 RTC / RTE（`positionHigh/Low`）是同一类问题的不同解法，不要误判成「WebGL 已经给地形接了 RTC」。

## 背景

触发场景（2026-08，`examples/ocean.ts` WebGPU + Cesium World Bathymetry）：

- 近岸低空观察地形接缝 / 瓦片网格。
- 左右键（拖转）操作相机时，WebGPU 下瓦片网格明显抖动、搓动。
- 同一位置切到 WebGL 复测，抖动基本消失。

相关代码入口：

- WebGL / WebGPU 适配：`src/rendering/RendererAdapter.ts`
- 海洋示例自建 RTE（仅水面 mesh，不覆盖地形）：`examples/ocean.ts`（`RTCAutoUniforms` + `originHigh/Low`）
- 实例化 RTC（HISM / 植被等，不覆盖普通 terrain mesh）：`src/rendering/applyRTCInstancing.ts`、`src/rendering/RTCAutoUniforms.ts`

## 现象

| 渲染后端 | 近岸拖转相机时地形瓦片网格 |
|----------|---------------------------|
| WebGL | 基本稳定 |
| WebGPU（默认） | 接缝 / 网格随相机搓动、抖动 |

易误判方向：

1. 以为是 `TilesFadePlugin` Bayer 抖动（那是 LOD fade 的片元 discard，不是网格几何抖）。
2. 以为 WebGL 路径给地形注入了 Tellux RTC；实际上普通 terrain / quantized-mesh 瓦片**没有**走 `applyRTCInstancing`。
3. 以为要立刻给每块地形 mesh 上 high/low RTE；对「对齐 WebGL」来说，上游已有更轻的开关（见下文）。

## 根因

### 1. WebGL：CPU float64 预乘 modelView（隐式高精度）

`WebGLRenderer` 每画一个 object 时：

```js
// node_modules/three/src/renderers/WebGLRenderer.js
object.modelViewMatrix.multiplyMatrices(
  camera.matrixWorldInverse,
  object.matrixWorld
)
```

- Three.js `Matrix4` 在 JS 侧是 **float64**。
- `view × world` 在 CPU 双精度下完成：两个约 \(10^6\sim10^7\) m 的 ECEF 矩阵相乘后，得到**相对眼点**的 model-view（平移量变小）。
- 再把该矩阵作为 float32 uniform 上传；顶点着色器用的已是相对化后的矩阵，地球尺度精度损失小。

因此 WebGL 下地形「看起来没抖」，不是 Tellux 单独修过地形，而是经典 WebGL 路径自带的 CPU 高精度 model-view。

### 2. WebGPU：默认 mediump = GPU float32 相乘

Node/TSL 默认：

```js
// node_modules/three/src/nodes/accessors/ModelNode.js
export const mediumpModelViewMatrix =
  cameraViewMatrix.mul(modelWorldMatrix)

export const modelViewMatrix = /* ... */
  builder.context.modelViewMatrix || mediumpModelViewMatrix
```

即 shader 内 `viewMatrix * modelMatrix`，两边都是大 ECEF → float32 有效精度约到分米～米量级 → 邻接瓦片误差方向不一致 → 网格抖动。

### 3. Three.js 已提供对齐 WebGL 的开关（Tellux 尚未启用）

`Renderer.highPrecision`（`node_modules/three/src/renderers/common/Renderer.js`）：

- `true`：把 context 换成 `highpModelViewMatrix` / `highpModelNormalViewMatrix`。
- `highpModelViewMatrix` 在 **JS `onObjectUpdate` 里用 float64 `multiplyMatrices`**，语义对齐 WebGL。
- 官方注明：**与 `InstancedMesh` / `SkinnedMesh` 不兼容**（这两类应继续用专用 RTC / 其它路径）。

Tellux `WebGPURendererAdapter` 当前**没有**设置 `renderer.highPrecision = true`，故 WebGPU 地形仍走 mediump。

## 与 Tellux RTC / RTE 的关系

| 路径 | 做法 | 覆盖范围 |
|------|------|----------|
| WebGL 地形（默认） | CPU float64 `modelViewMatrix` | 所有普通 mesh |
| WebGPU 默认 | GPU float32 `view × world` | 会抖 |
| WebGPU `highPrecision` | CPU float64 model-view（对齐 WebGL） | 普通 mesh；官方称不兼容 Instanced/Skinned |
| 海洋示例 RTE | `originHigh/Low` + `cameraHigh/Low` + `viewMatrixRTE` | 仅该示例水面 |
| `applyRTCInstancing` | instance `positionHigh/Low` + shader RTE | HISM / 实例化物体 |

「要不要给地形上同样的 RTC」：

- **要对齐 WebGL 观感**：优先评估 `renderer.highPrecision = true`（或等价地为 tileset 材质指定 `highpModelViewMatrix` context），而不是先上完整 high/low RTE。
- **实例化 / 更极端精度**：仍用现有 RTC 管线；与 `highPrecision` 的官方限制一起做回归（尤其 HISM WebGPU）。

上游 `3d-tiles-renderer` 的 `BatchedTilesPlugin` → `ModelViewBatchedMesh` 也是同类思路（CPU 保留 float64 矩阵，按相机重算相对眼点的 model-view）。Tellux 地形路径当前未依赖该插件。

## 当前状态

- 根因已用 WebGL / WebGPU 对比与 Three.js 源码核对确认。
- `WebGPURendererAdapter` **已默认**开启 `renderer.highPrecision = true`（`src/rendering/RendererAdapter.ts`），用 CPU float64 model-view 对齐 WebGL。
- 需在 ocean / 普通地形示例上目视确认拖转是否还抖；并回归 HISM 等 InstancedMesh WebGPU 路径（官方称 highPrecision 与 Instanced/Skinned 不兼容，HISM 自有 RTC 是否受影响以实机为准）。
- 海洋示例的 RTE 只稳定水面，与本开关互补。

## 后续完善方向

1. **验证**：ocean / terrain / 基础地球 WebGPU 示例拖转相机；HISM WebGPU（若有）确认实例化未回归。
2. **若 highPrecision 与实例化冲突**：仅对 terrain / surface tileset 材质注入 `highpModelViewMatrix` context，全局改回 mediump；或继续依赖实例化 RTC。
3. **长期**：与 [WebGPU 下 onBeforeCompile 着色器机制失效坑点](./WebGPU下onBeforeCompile着色器机制失效坑点.md) 一并规划「WebGPU 地球尺度精度」策略（highPrecision / 分材质 highp / 完整 RTE），避免每个示例私自打补丁。

## 关键源码索引

- WebGL 预乘：`node_modules/three/src/renderers/WebGLRenderer.js`（`modelViewMatrix.multiplyMatrices`）
- WebGPU mediump / highp：`node_modules/three/src/nodes/accessors/ModelNode.js`
- `highPrecision` setter：`node_modules/three/src/renderers/common/Renderer.js`
- Tellux WebGPU 适配：`src/rendering/RendererAdapter.ts`（`WebGPURendererAdapter`）
- Tellux RTC：`src/rendering/RTCAutoUniforms.ts`、`src/rendering/applyRTCInstancing.ts`
- 相关坑点：[WebGPU 下 onBeforeCompile 着色器机制失效坑点](./WebGPU下onBeforeCompile着色器机制失效坑点.md)、[ez-tree 风摆与 RTC 争抢 project_vertex 坑点](./ez-tree风摆与RTC争抢project_vertex坑点.md)
