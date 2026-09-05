---
name: tellux
description: STALE during Tellux 1.0 API migration — do not use for implementing or refactoring the tellux library. How to write application code with Tellux after the 1.0 docs sync. Currently still documents 0.2 APIs (viewer.layers, load3DTileset, addModel, setTerrain, viewer.highlight, scene.postProcess). Do not use when working in the tellux repo on the 1.0 stable API, or when the user mentions API稳定版 / 破坏式变更方案.
---

# Tellux 应用开发助手

> **过期（1.0 施工中）**：本 skill 与 `references/` 仍是 0.2 公开 API（`viewer.layers`、`load3DTileset`、`addModel`、`setTerrain`、`viewer.highlight`、`scene.postProcess` 等）。实现 tellux 库或按 1.0 方案改代码时 **不要使用本 skill**；目标形状以仓库内 `notes/架构/API稳定版破坏式变更方案.md` 为准。应用侧代码在 1.0 文档同步完成前也不要按本 skill 新写。

Tellux 是一个基于 Three.js 的 ESM TypeScript 库，用于在网页里构建数字地球、加载 Cesium 地形 / 影像 / 3D Tiles，并集成大气、体积云和后处理。本 skill 辅助你为**使用 Tellux 的应用**编写正确、可运行的代码。

## 何时使用本 skill

当用户在做以下任何一件事时启用：

- 初始化 `tellux.Viewer`、配置场景 / 相机 / 渲染器
- 加载或切换地形、影像图层（XYZ / WMS / WMTS / MVT / GeoJSON / Cesium Ion）
- 加载 3D Tiles 或在经纬度放置 glTF 模型（点云可用 Cesium 形 `pointCloudShading`）
- 配置大气、光照模式、体积云、后处理
- 相机飞行 / 定位、鼠标交互、拾取、高度采样
- HISM 大规模实例化（森林、岩石场、多 LOD、实例拾取）
- 把自定义 Three.js 对象按经纬高放到地球上

## 核心约定（先读这一段）

这些是产出代码前必须遵守的硬性约定，违反会导致代码不可用或语义错误。

### 1. 安装与导入

Tellux 的 `three`、`3d-tiles-renderer` 和 `@takram/*` 是 peer dependency，应用侧必须显式安装：

```bash
npm install tellux three 3d-tiles-renderer postprocessing \
  @takram/three-geospatial @takram/three-geospatial-effects \
  @takram/three-atmosphere @takram/three-clouds
# 用 MVT 矢量瓦片时再加（可选）：
npm install @mapbox/vector-tile pbf
```

导入：默认导出 `tellux` 对象 + 命名导出类 / 类型。

```ts
import tellux from 'tellux'
// 也可按需导入类型
import type { ViewerOptions, ImageryLayerOptions } from 'tellux'
```

### 2. 单位与坐标系（高频踩坑点）

- **经纬度、heading / pitch / roll 用「度」**，不是弧度。
- **高度、near / far、云层高度用「米」**（WGS84 椭球海拔）。
- 太阳 / 月亮角半径（`sunAngularRadius` 等）是**弧度**。
- heading / pitch / roll 相对**当地东北天（ENU）**坐标系。
- **经纬高元组输入顺序是 `[经度, 纬度, 高度]`**（遵循 GeoJSON），和对象 `{ longitude, latitude, height }` 字段顺序相反——混用极易出错。

```ts
// 元组：[经度, 纬度, 高度]
viewer.sampleHeight([121.4737, 31.2304])
// 对象
viewer.sampleHeight({ longitude: 121.4737, latitude: 31.2304 })
```

### 3. 必须确保容器有尺寸

```css
#viewer { width: 100vw; height: 100vh; }
```

容器宽高为 0 时 Viewer 仍会创建，但画面不显示，这是最常见的"白屏"原因。

### 4. 销毁时机

`viewer.destroy()` 应放在**组件卸载 / SPA 路由切换**时调用，不要只挂在 `beforeunload`（浏览器卸载时同步释放不可靠）：

```ts
useEffect(() => {
  const viewer = new tellux.Viewer(container, options)
  return () => viewer.destroy()
}, [])
```

### 5. WebGPU 是实验性能力

用 `renderer.type: 'webgpu'` 时：

- 用 `await tellux.Viewer.create(...)`（异步工厂），不要用 `new Viewer(...)` 后立刻渲染。
- **体积云、SMAA / 抖动在 WebGPU 下不渲染**；星空、镜头光晕和 TAA 已支持。`taa` 默认关闭，LensFlare → TAA 的顺序固定，给 SMAA / 抖动开关赋值没有视觉效果。
- **瓦片 LOD 淡入淡出在 WebGPU 下不可用**，瓦片为直接切换。
- WebGPU **不会在不支持的环境自动回退 WebGL**，应用层需自行检测。

## 能力导航

产出代码前，先判断属于哪个领域，读对应的 reference 文件。**不要一次性把所有 reference 读进上下文**——按需读取，保持精简。

| 用户需求 | 读取的 reference |
| --- | --- |
| 初始化 Viewer、相机飞行、加影像/地形/3D Tiles/模型、HISM 实例化 | `references/core-api.md` |
| 大气、光照模式、体积云、后处理、地表材质 | `references/scene-effects.md` |
| 鼠标事件、拾取坐标 / feature、高度采样 | `references/interaction.md` |
| 把自定义 Three.js 对象按经纬度放到地球 | `references/coordinates.md` |

判断不准时，先读 `references/core-api.md`——它覆盖了 80% 的高频场景。

## 产出代码的规范

1. **完整可运行**：包含 import、容器准备、Viewer 创建。不要只给"核心片段"让用户自己拼。
2. **文档与 skill reference 使用占位 URL**（`https://example.com/...`）；可运行示例中的真实服务地址见 `examples/` 源码与环境变量配置。
3. **配置用领域分组结构**：`scene.atmosphere.lighting.mode` 而不是拍平的 `atmosphereLightingMode`。初始化配置和运行时入口同构（路径一致）。
4. **代码后跟简短中文说明**：解释关键参数为什么这么取值、有什么副作用，不展开成长篇。
5. **标注限制**：若用到 WebGPU 下不可用的能力，在说明里点明。

## 查不到时的兜底

- 公开 API 全量签名：仓库内 `src/Viewer.ts`、`src/types/`、`src/Camera.ts`、`src/LayerManager.ts`。
- 用户向文档：仓库内 `docs/guide/`（相机、交互、地形影像、光照、大气效果、数据源、能力边界）和 `docs/api/types.md`（完整 `ViewerOptions` 配置项参考）。
- 当本 skill 的 reference 与源码冲突时，**以源码为准**，并回来更新 reference。
