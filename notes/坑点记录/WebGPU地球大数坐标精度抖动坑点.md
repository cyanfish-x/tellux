# WebGPU 地球大数坐标精度抖动坑点

本文记录 Tellux WebGPU 模式下，ECEF 地球级坐标在相机移动时出现模型或水面抖动的根因、统一修复位置和能力边界。

## 现象

场景对象位于数百万米量级的 ECEF 坐标时，即使对象自身尺寸很小，镜头移动或旋转过程中也会出现顶点位置跳动。Water Area 案例会让该问题更明显：连续高光和光滑水面会放大相邻帧之间的亚米级位置误差。

## 根因

Three.js WebGPU / NodeMaterial 默认在 GPU 中分别以 32 位浮点数计算：

```text
projectionMatrix × viewMatrix × modelMatrix × position
```

`viewMatrix` 与 `modelMatrix` 都包含地球尺度的大平移。两个已经量化为 32 位浮点数的矩阵在 shader 中相乘时，低位有效数字会丢失，最终表现为相机相对坐标不稳定。仅把 WGSL 变量声明为 `highp` 不能改变 WebGPU `f32` 的精度，也不是问题的修复入口。

## Three.js 高精度 API

Three.js r184 的 `WebGPURenderer.highPrecision` 会把 model-view 和 normal-view 矩阵切换为高精度节点：

1. 在 JavaScript / CPU 侧用 64 位 Number 先计算 `camera.matrixWorldInverse × object.matrixWorld`。
2. 将已经消去两段大平移的组合矩阵上传到 GPU。
3. shader 使用组合后的 model-view 矩阵变换局部顶点，避免在 GPU 上直接相乘两个地球尺度矩阵。

Tellux 在 `src/rendering/RendererAdapter.ts` 的 `WebGPURendererAdapter` 构造阶段统一设置：

```ts
renderer.highPrecision = true
```

该设置位于 renderer 组合根，而不是 Water Area 私有材质中，因此 WebGPU 下的普通 Mesh、地形、3D Tiles 和水域 NodeMaterial 共用同一精度契约。WebGL 路径保持不变。

## 能力边界

Three.js 明确说明 `highPrecision` 不兼容 `InstancedMesh` 和 `SkinnedMesh` 的附加顶点变换。准确地说，renderer 只能在 CPU 上预合并对象级 model-view 矩阵；每实例矩阵和骨骼矩阵仍需在 GPU 中参与计算，不能由这个开关自动获得地球级精度。

- 普通 Mesh / NodeMaterial：使用 renderer 级高精度矩阵。
- Tellux HISM / `InstancedMesh`：继续使用 `applyRTCInstancing` 的 high/low 编码与 RTE 路径；不能把 renderer 开关当成 HISM 精度方案。
- WebGPU HISM：现有 RTC 实现依赖 `onBeforeCompile`，WebGPU 下仍需后续用 TSL 重建，详见 [WebGPU 下 onBeforeCompile 着色器机制失效坑点](./WebGPU下onBeforeCompile着色器机制失效坑点.md)。
- `SkinnedMesh`：若要放到地球级绝对坐标，应优先使用局部原点 / RTC 容器；不能只依赖 `highPrecision`。

## 验证

自动化测试 `src/test/rendererPrecision.test.ts` 固化以下契约：创建 WebGPU renderer adapter 后，底层 Three.js renderer 的 `highPrecision` 必须为 `true`。

视觉回归仍应使用真实 WebGPU 浏览器，在固定相机参数下观察近地水面、地形和 3D Tiles 的慢速平移与旋转；单元测试只能证明开关没有被移除，不能替代 GPU 画面验收。
