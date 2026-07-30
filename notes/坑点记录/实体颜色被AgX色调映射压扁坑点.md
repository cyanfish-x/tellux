# 实体颜色被 AgX 色调映射压扁坑点

本文记录实体（点 / 折线 / 多边形）设置标准颜色后显示偏色的排查结论。核心经验是：在 r184 `WebGLRenderer.setEffects()` 后处理管线下，色调映射是"画面级"而非"材质级"操作，`material.toneMapped` 开关完全失效；要实现实体颜色"所见即所得"，必须对用户输入色做 AgX 解析反求补偿。

## 现象

实体设置标准纯色后显示偏色：

- 设置纯红 `#ff0000`，实际显示成橘色。
- 设置 `#38bdf8`、`#ffd166` 等饱和色，显示色与目标色明显对不上。

偏色程度随 `toneMappingExposure` 增大而加剧（默认曝光 10 放大效应明显）。

## 容易误判的方向

1. 误以为是材质 `toneMapped` 没关。

   第一反应是给实体材质加 `toneMapped: false`。在普通 `WebGLRenderer.render()` 直接出画布的旧管线下这确实有效，但在 Tellux 使用的 `setEffects()` 后处理管线下**完全无效**——色调映射发生在最后的 output pass，绕不过去（见下文根因）。这条改动留着会误导后续排查，已还原。

2. 误以为是 `ColorManagement` / `outputColorSpace` / 颜色解析问题。

   实测 `THREE.Color('#ff0000')` 解析出的 linear 值正确，`ColorManagement.enabled` 默认 true 也符合预期。颜色进材质前是正确的，问题出在材质之后。

3. 误以为是材质选型问题（Basic vs Standard）。

   实体本就用的 `MeshBasicMaterial` / `PointsMaterial` / `LineBasicMaterial` / `LineMaterial`，不受光照影响。换材质不解决问题。

4. 以为是 `renderer.setEffects` 是某个第三方库 patch 的方法。

   实际 `setEffects` 是 **three.js r184 新增的原生方法**（`three.module.js` 内置），配合 `outputBufferType: HalfFloatType` 启用内置后处理管线。不要去 takram / postprocessing 库里找它的实现。

## 真实根因

Tellux 在 `Viewer.ts` 设置 `renderer.toneMapping = THREE.AgXToneMapping`，并通过 `PostProcessingManager` 调用 `renderer.setEffects(effects)`。three.js r184 的内置后处理管线机制（`three.module.js`）：

1. **`begin()` 阶段（`:4916-4950`）**：场景渲染前，暂存 `renderer.toneMapping` 并强制设为 `NoToneMapping`：

   ```js
   // disable tone mapping during render - it will be applied in end()
   _savedToneMapping = renderer.toneMapping;
   renderer.toneMapping = NoToneMapping;
   ```

   场景渲染阶段所有材质的 `toneMapped` 判断都会因为 `renderer.toneMapping === NoToneMapping` 而跳过——材质以线性原色写入离屏缓冲 targetA。

2. **`end()` 阶段 output material（`:4847-4868`）**：用一个全屏 mesh 把 targetA 贴回画布，片元着色器**无条件**对整张画面应用 AgX + sRGB 编码：

   ```glsl
   gl_FragColor = texture2D( tDiffuse, vUv );      // 整张画面
   #elif defined( AGX_TONE_MAPPING )
       gl_FragColor.rgb = AgXToneMapping( ... );   // 无差别应用
   #ifdef SRGB_TRANSFER
       gl_FragColor = sRGBTransferOETF( ... );
   ```

   output material 的 tone mapping define 由 `renderer.toneMapping`（= AgX）驱动（`:4990-5002`）。

**结论**：在这套管线里，色调映射是"画面级"操作。实体像素先以线性原色进 targetA，再和地形、3D Tiles 一起被同一个 output pass 做 AgX。`toneMapped` 这个材质开关触达不到 AgX 步骤，彻底失效。纯红 `#ff0000`（线性 `1,0,0`）经 AgX + exposure=10 被压向橘黄区段——这就是"红变橘"的来源，与实体材质无关。

> 旁证：three.js 在 `setEffects()` 内部明确警告 "OutputPass is not needed... Tone mapping and color space conversion are applied automatically"（`:16682`）。

## 当前修复策略：AgX 解析反求补偿

无法让实体绕过 output pass，所以反向操作：对用户输入的目标 sRGB 色，解析反推出一个会被 AgX 还原回目标色的预补偿 linear 色，作为材质 color。

实现位置：`src/entities/invertToneMapping.ts`。

1. **反求算法**：把目标 sRGB 色逆向走一遍 AgX 的每一步——
   sRGB→linear → REC2020 → pow(1/2.2) → AgX outset 逆 → contrast 逆（单调多项式二分）→ log2 逆 → AgX inset 逆 → linear-sRGB，最后除以 exposure。
   得到的 linear 色可能含负分量（饱和色常见），但经 AgX 正向计算后显示色与目标一致。

2. **矩阵必须解析求逆**：three.js 源码里 AgX 的 inset/outset 矩阵、REC2020/sRGB 矩阵的数值**并非严格互逆**，硬编码配对矩阵做反求会引入误差。必须用 `invertMat3` 对每个矩阵解析求逆后再用。

3. **必须传 `THREE.Color` 实例而非 hex/number**：反求结果含负分量，`getHex()` 会把负值裁成 0（丢失信息）。所以 `resolveColor` 返回 `THREE.Color`，`createPointMaterial` 等构造参数也从 `number` 改成 `THREE.Color`，全程直接传 Color 实例。

4. **Viewer 级状态隔离**：反求依赖当前 `toneMapping` 和 `toneMappingExposure`。每个 `Viewer` 持有独立的 `ToneMappingColorResolver`，并把绑定到本实例的 `resolveColor` 显式注入 `EntityManager` 和 `HighlightManager`，模块中不再保存可变 Viewer 状态。
   - Viewer 初始化 renderer 后创建自己的 resolver。
   - `toneMappingExposure` setter 更新该 resolver，并刷新已有实体材质和高亮样式。
   - 图形对象保留用户传入的语义颜色；刷新时重新反求，不从已经补偿过的材质颜色反推。

5. **非 AgX 不补偿**：`resolveColor` 检测到 `toneMapping !== AgXToneMapping`（含 NoToneMapping）时直接返回目标色，避免无谓反求。

## 验证方法

反求正确性用"正向回代"验证：把反求出的 material linear 色 × exposure 后再走一遍正向 AgX + sRGB OETF，得到的显示 hex 应与目标 hex 一致。

离线脚本和端到端测试结果（exposure=10）：

| 目标色   | 反求 material linear      | 正向回代显示色 |
|----------|---------------------------|----------------|
| #ff0000  | [0.182, -0.032, -0.019]   | #ff0000 ✓      |
| #00ff00  | [-0.069, 0.330, -0.023]   | #00ff00 ✓      |
| #0000ff  | [-0.009, -0.024, 0.163]   | #0000ff ✓      |
| #38bdf8  | [-0.024, 0.056, 0.209]    | #38bdf8 ✓      |
| #ffd166  | [0.111, 0.627, -0.064]    | #ffd166 ✓      |
| #f472b6  | [0.156, 0.010, 0.055]     | #f472b6 ✓      |

clamp 步骤不可逆，极高饱和度色有极轻微损失，但屏幕取色器基本无差。

## 快速排查清单

实体颜色显示偏色时，按这个顺序查：

1. 确认 `renderer.toneMapping` 是不是 `AgXToneMapping`，以及当前 `toneMappingExposure` 值（DebugSettingsPanel 可调）。
2. 确认是否走了 `setEffects()` 后处理管线（`PostProcessingManager` 存在即启用）。在该管线下 `toneMapped` 必然失效，不要再去改材质的 `toneMapped`。
3. 确认 `resolveColor` 是否被实体材质调用（点 / 线 / 面 / 描边都应走这个统一入口）。
4. 确认当前 `Viewer` 是否把自己的 `colorResolver.resolveColor` 注入实体和高亮；exposure setter 是否依次更新 resolver、调用 `entitiesManager.refreshColors()` 和 `highlightManager.syncStyleFromSettings()`。
5. 如果改了 AgX 相关常量或 three.js 升级，重新跑反求的正向回代验证脚本，确认 inset/outset 矩阵数值未变（变了要同步更新 `invertToneMapping.ts`）。

## 相关文件

- `src/entities/invertToneMapping.ts` — AgX 反求算法、纯函数 `resolveColor`、Viewer 级 `ToneMappingColorResolver`
- `src/entities/EntityManager.ts` — 把 Viewer 级解析器注入实体，并统一刷新已有图形
- `src/entities/PointGraphic.ts` — `resolveColor` 调用点，`createPointMaterial` 收 `THREE.Color`
- `src/entities/PolygonGraphic.ts` — `resolveColor` 调用点（填充 + 描边）
- `src/entities/PolylineGraphic.ts` — `resolveColor` 调用点
- `src/highlight/HighlightManager.ts` — 把同一解析器注入描边和 overlay 高亮
- `src/Viewer.ts` — 拥有 resolver，并在 exposure setter 中同步和刷新
- `node_modules/three/build/three.module.js` — `setEffects` / `begin` / `end` / output material（`:4830-5030`、`:16660-16693`）

## 维护准则

- 实体颜色"所见即所得"是靠反求补偿实现的，不是靠材质开关。**不要**给实体材质加 `toneMapped: false`，它在 `setEffects` 管线下无效，且会让后续维护者误以为色调映射已被处理。
- `resolveColor` 必须返回 `THREE.Color` 实例，调用方必须直接传 Color 给材质，**不要**中间转 `getHex()`——负分量会被裁掉。
- 反求算法依赖 AgX 的具体实现（矩阵、contrast 多项式、EV 范围）。three.js 升级或切换 tone mapping 时，要重新核对 `tonemapping_pars_fragment` 是否变化，并重跑正向回代验证。
- 色调映射运行时状态必须归当前 `Viewer` 所有，禁止重新引入模块级单例。新增颜色消费者时，应显式接收同一个 `ResolveColor` 依赖，并在已有材质需要重算时接入 `EntityManager.refreshColors()` 或对应 manager 的样式同步入口。
- 如果未来要让用户可控地"关闭实体色调映射补偿"（例如想要实体也参与整体调色），应作为实体领域选项暴露，而不是改全局 tone mapping。
