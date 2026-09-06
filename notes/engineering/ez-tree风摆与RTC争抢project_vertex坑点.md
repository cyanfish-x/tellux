# ez-tree 风摆 shader 与 RTC 注入争抢 project_vertex 坑点

本文记录 vegetation 案例接入第三方程序化树库 `@dgreenheck/ez-tree` 时，其风摆着色器与 Tellux 自研的 RTC（globe-scale 相对相机坐标）注入逻辑同时改写 Three.js `<project_vertex>` chunk 导致的"三方博弈"坑点。核心经验是：ez-tree 在 `onBeforeCompile` 阶段把 `#include <project_vertex>` 整段替换为自定义风摆代码，并顺手丢弃了 `instanceMatrix * mvPosition` 块；任何后续想在同一材质上注入位置变换的能力（RTC、GPU 实例剔除、impostor billboard、LOD）都只能用正则匹配 ez-tree 输出的字面字符串做二次替换，且必须手动补回 instancing 块。这种文本级 patch 链极度脆弱，任一库升级都可能静默失效。

## 背景

vegetation 案例的渲染栈：

- 用 `@dgreenheck/ez-tree` 程序化生成树几何与材质（`examples/vegetation.ts`）。
- 用 Three.js `InstancedMesh` 把多棵实例提交为单 draw call（`examples/vegetation.ts:326-335`）。
- 用 Tellux 的 RTC 方案把 globe-scale ECEF 平移编码进 `positionHigh/Low` 实例属性，并改写 vertex shader 用 RTE（relative-to-eye）数学投影，避免大尺度浮点精度抖动（`src/rendering/applyRTCInstancing.ts`）。

`<project_vertex>` 是 Three.js vertex shader 的核心 chunk：

```glsl
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
```

它把局部空间 `transformed` 一路变换到 clip 空间 `gl_Position`。任何想介入"顶点最终画在哪"的能力都要改这段。

## 现象

往 vegetation 森林里再加任何位置变换类能力，都会失败或行为异常：

- 风摆动画在 RTC 启用后位移错乱（整棵树飞到原点 / 摆动幅度变成 ECEF 尺度量级）。
- 实例化位置全部塌缩到原点（因为 `instanceMatrix` 平移列被清零，但 ez-tree 删了 instancing 块后没有等价替代）。
- 任何基于 GPU 实例剔除（用 `visible[i]` scale 退化三角形）的方案都找不到正确注入点，因为 include 占位符已经被吃掉。

## 根因

### 1. ez-tree 整段替换 project_vertex，且未考虑实例化

`node_modules/@dgreenheck/ez-tree/build/ez-tree.es.js:2287-2302`：

```js
g.vertexShader = g.vertexShader.replace(
  "#include <project_vertex>",
  `
  vec4 mvPosition = vec4(transformed, 1.0);
  float windOffset = ...;
  vec3 windSway = uv.y * uWindStrength * (...);
  mvPosition.xyz += windSway;
  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
  `
)
```

它做掉了三件事：

- 整段替换了 `<project_vertex>`，**include 占位符从 shader 字符串里消失**。
- 注入了 view 空间下的风摆位移。
- **删掉了 `#ifdef USE_INSTANCING mvPosition = instanceMatrix * mvPosition; #endif` 块**——ez-tree 设计时没考虑被 `InstancedMesh` 使用，原始 mesh 用 modelMatrix 即可，不需要 instanceMatrix。

### 2. Tellux RTC 注入也要改同一段

`src/rendering/applyRTCInstancing.ts:39-59` 定义了替换 `<project_vertex>` 的 RTE chunk：跳过 `modelViewMatrix`，改用 `positionHigh/Low - cameraHigh/Low + viewMatrixRTE`，把绝对 ECEF 平移从 `instanceMatrix` 平移列（已被清零）转移到高/低解码通道。

对普通 Three.js 材质走 `if (shader.vertexShader.includes('#include <project_vertex>'))` 分支直接替换 include 即可。

### 3. 应用于 ez-tree 叶子材质时 include 已经不存在

对 ez-tree 叶子材质，Tellux RTC 注入逻辑只能走 else 分支（`applyRTCInstancing.ts:96-111`）：

```ts
if (!/instanceMatrix\s*\*\s*mvPosition/.test(shader.vertexShader)) {
  shader.vertexShader = shader.vertexShader.replace(
    /(mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;)/,
    `#ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    $1`
  )
}
shader.vertexShader = shader.vertexShader.replace(
  /mvPosition\s*=\s*modelViewMatrix\s*\*\s*mvPosition;\s*gl_Position\s*=\s*projectionMatrix\s*\*\s*mvPosition;/,
  RTC_INLINE_REPLACEMENT.trimStart()
)
```

两个文本级 patch：

- 先用正则匹配 ez-tree 输出的字面 `mvPosition = modelViewMatrix * mvPosition;`，前插 `instanceMatrix` 块（补回 ez-tree 删掉的部分）。
- 再用正则匹配同样字符串 + `gl_Position` 行，替换为 RTE 数学。

### 4. 链式文本替换的脆弱性

这套方案能跑，但完全依赖 ez-tree 输出的字面文本格式：

- ez-tree 哪天换变量名（`mvPosition` → `modelViewPosition`）、加个换行、改个空格——正则全失效，**静默退化**而非报错。
- 想再加第四方（GPU 剔除 / billboard / LOD）介入，可注入点只剩"匹配已 patch 输出"，越套越脆。
- 调试极困难：最终 GLSL 字符串里看不出哪段来自谁，shader 编译报错定位不到责任库。

## 当前状态（2026-09-06 静态复核）

- RTC 组合已进入 `src/hism/pipeline/PositionPipeline.ts`；`applyRTCInstancing.patchMaterial` 创建 RTC stage，并跳过带 Tellux position-pipeline 标记的材质。
- Tellux 叶片材质通过 `createWindSwayLeavesMaterial` 组合风摆与 RTC；兼容外部已改写 project_vertex 的材质时仍有内联 fallback。组合层已经存在，不应再把“新建 PositionPipeline”列作待实现任务。
- `examples/vegetation.ts` 仍调用通用 `applyRTCInstancing`，不能因存在自有叶片材质就声称所有客户端都摆脱第三方 shader 文本依赖。
- 本文旧行号与双正则片段是历史路径；当前修改从上述符号定位。没有重跑 wind + RTC 的视觉验收。

### 原实验状态

- 当前 vegetation 案例里这套 if/else + 双正则替换是 work 的（见 `applyRTCInstancing.ts:90-111`），但只在 ez-tree 当前锁定版本下验证过。
- `applyRTCInstancing.ts` 注释里写了 if/else 的原因（标准材质走 include 替换，ez-tree 走内联替换），但没有标记这是脆弱依赖、没加 fail-fast。
- ez-tree 升级是潜在 breaking change，需要回归风摆 + RTC 双开下的视觉表现。

## 原后续建议（部分已由 PositionPipeline 实现）

### 短期：固化 + 防回归

1. **ez-tree 版本锁死 + 升级回归测试**：`package.json` 锁住 ez-tree minor 版本，升级时强制重跑 vegetation 案例，对比 wind + RTC 双开下的视觉一致性。
2. **在 `applyRTCInstancing.ts` 加显式 fail-fast**：如果 else 分支的正则没匹配到任何东西（说明 ez-tree 改了输出格式），`console.error` 提示而非静默跳过，避免 shader 静默退化。
3. **加 shader 输出快照测试**：把最终 patch 后的 vertex shader 字符串 hash 存档，CI 比对，任何 shader 文本变化都触发人工 review。

### 中期：减少注入层数

1. **本地 fork ez-tree 风摆 shader**：把风摆逻辑从 ez-tree `onBeforeCompile` 里抽出来，直接写进 Tellux 自己的叶子材质，避免第三方库碰 `<project_vertex>`。一次性投入，永久消除该层博弈。
2. **统一 RTC + 风摆注入点**：在 Tellux 内部写一个组合 chunk，把 RTE 投影 + 风摆位移合到一段 `<project_vertex>` 替换里，ez-tree 只负责出几何与基本材质属性（颜色、alphaTest、texture）。

### 长期：迁 NodeMaterial / TSL

WebGPU 渲染模式下 `onBeforeCompile` 整体失效（见 [WebGPU下onBeforeCompile着色器机制失效坑点.md](WebGPU下onBeforeCompile着色器机制失效坑点.md)），这套字符串 patch 在 WebGPU 上根本不跑。如果未来需要在 WebGPU 下渲染植被，必须用 TSL 节点图重建风摆 + RTC 逻辑，`<project_vertex>` 的多 patch 问题会自动消失（但会换成"多 Node 拼接"的新问题）。

## 关键源码索引

- 实例化森林接入点：`examples/vegetation.ts:346-349`（`applyRTCInstancing` 调用）、`examples/vegetation.ts:363-364`（`setRTCMatrixAt` 调用）。
- RTC shader 注入主体：`src/rendering/applyRTCInstancing.ts`（`patchMaterial` 委托 PositionPipeline）。
- if/else 双分支替换：`src/hism/pipeline/PositionPipeline.ts`（`enableCustomProjectVertexFallback`）。
- 实例矩阵清零 + 高低编码：`src/rendering/applyRTCInstancing.ts:280-318`（`setRTCMatrixAt`）。
- RTC 每帧 uniform 刷新：`src/rendering/RTCAutoUniforms.ts:45-65`。
- ez-tree 风摆 shader 替换（上游）：`node_modules/@dgreenheck/ez-tree/build/ez-tree.es.js:2284-2305`。
