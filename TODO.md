# Tellux 待办事项

## WebGPU 渲染模式

- [ ] 实现 WebGPU 渲染模式下的瓦片 LOD fade 过渡效果

  - 背景：WebGPU 模式下地球瓦片层级切换时直接 pop，没有 WebGL 版的丝滑淡入淡出。
  - 根因：`TilesFadePlugin` 依赖 Three.js `onBeforeCompile` GLSL 注入，WebGPURenderer 不支持该机制。
  - 详细分析与完善方向见 [notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md](./notes/坑点记录/WebGPU下onBeforeCompile着色器机制失效坑点.md)。
