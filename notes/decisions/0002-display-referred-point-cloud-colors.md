# 无法线点云以显示色语义穿过全屏输出链

> 2026-09-06 复核范围：静态核对 PointCloudColorTransform、TilesetManager 与大气 unlit patch；Melbourne 数据观察和视觉结果仍属于原实验。


**状态：已接受**

**日期：2026-08-22**

## 背景

Tellux 的 WebGL 路径使用 three.js r184 `WebGLRenderer.setEffects()`：场景先以线性 HDR 写入 HalfFloat 缓冲，经大气、EDL 等 effect 后，再由 Three 的全屏 output material 统一执行 AgX 与 sRGB 输出。Three 对 `Material.toneMapped` 的契约是：它仅在 WebGL 直接渲染到 canvas 时可按材质绕过；渲染到 render target、使用后处理或 `WebGPURenderer` 时会被忽略，所有材质都经过最终 tone mapping。因此 `toneMapped=false` 不是跨管线的最终输出豁免。

Cesium Ion Melbourne Point Cloud（asset `43978`）等 legacy `pnts` 数据只提供 `POSITION` / `RGB`，没有法线。其 RGB 是采集数据的目标显示色，不是应与场景光照相乘的 HDR radiance。若直接写进这条 output 链，默认曝光会使画面偏亮、泛白；只跳过大气光照仍不足以解决问题。

约束：不得用伪法线、弱环境光、全局曝光调整或颜色增益改变数据语义；应保留标准 HDR 后处理、无遮挡的 depth 关系、attenuation 与 EDL。

## 决策

无法线点云（以及显式 `normalShading: false` 的点云）按 **display-referred 数据色** 处理。WebGL 下由 `TilesetManager` 持有一个 Viewer 级 `PointCloudColorTransform`：

1. 首次遇到带顶点色的 `PointsMaterial` 时，惰性生成共享的 33³ Float 3D LUT。
2. LUT 存储 AgX 的逆向线性颜色；顶点 shader 根据源 RGB 采样，并除以当前 `toneMappingExposure`。
3. Three 的最终全屏 AgX 再乘曝光并输出 sRGB，得到接近源 RGB 的显示色。
4. 每帧只同步两个 uniform（是否为 AgX、曝光）；不复制或改写原始点云颜色 attribute。

该策略只在 WebGL + AgX 条件下启用。WebGPU 不复用 `onBeforeCompile`，也不能靠 `toneMapped=false` 绕过最终输出；未来若要支持相同语义，必须在 TSL / `RenderPipeline` 中建立等价的显示色节点，而不是伪装为 WebGL 已支持。

## 被否决的方案

- **`material.toneMapped = false`**：在 `setEffects()` 的最终 output pass 前无效，无法解决整帧 AgX。
- **降低全局曝光或关闭 AgX**：会改变地形、模型、大气和所有用户画面的摄影曝光，不是点云局部问题的修复。
- **弱环境光、Lambert、椭球/导数法线重建**：把不存在的法线和光照含义写入数据，且不能修复最终 output。
- **CPU 逐点反求并改写颜色 attribute**：百万级点云会产生显著 CPU、内存和加载成本，且需要把紧凑 `Uint8` 扩展为可能有负分量的浮点数据。
- **在全屏 output 后再次渲染点云**：需要独立深度遮挡、透明合成和 EDL 协调，额外渲染成本高；在当前 WebGL 管线中收益不足。

## 后果与维护要求

- 每个 Viewer 最多增加一张约 0.55MB 的 Float 3D LUT；所有其点云 tileset 共享。
- 依赖 Three 的 `onBeforeCompile` shader chunk 和 AgX 实现。升级 Three 时必须核查 `WebGLOutput`、`tonemapping_pars_fragment`、GLSL `mat3` 的列主序，并跑 AgX 正反向 round-trip、LUT 注入与真实 Melbourne 回归。
- `PointCloudShadingController` 只维护法线/unlit、attenuation、EDL；颜色反求必须留在 `PointCloudColorTransform`，禁止散落进大气、EDL 或 loader。
- 这不是对 Cesium 像素级复刻；目标是保持相同的数据语义：无法线点云不受场景光照，RGB 在 Tellux 的标准全屏输出链中仍可被正确显示。

更多证据和排查流程见 [点云 unlit 与 post-process 大气坑点](../engineering/点云unlit与post-process大气坑点.md)。
