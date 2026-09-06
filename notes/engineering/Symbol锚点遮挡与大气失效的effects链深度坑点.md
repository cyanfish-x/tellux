# Symbol 锚点遮挡失效与大气失效：effects 链深度的三个坑

> 2026-09-06 复核范围：核对 EffectPassAdapter autoClear 与实体 OIT 当前排序；早期 OIT 在大气前的步骤已被后续地平线修复取代。


2026-07 排查 symbol 锚点被地形遮挡后不隐藏（期望 Mapbox symbol 行为），连带发现 symbol 案例大气渲染失效。三个独立缺陷叠加，任一存在都会让锚点遮挡失效，其中一个还破坏大气。

## 坑 1：autoClear 在链中清掉 targetA 的深度（遮挡失效主因）

Three.js r184 内置的 `WebGLOutput.end()` 直接调用各 effect 的 `render()`，**不像 postprocessing 的 EffectComposer 那样全局关 `renderer.autoClear`**。postprocessing 的 pass（SMAA / dithering / 大气 EffectPass）都是为 autoClear=false 环境设计的（需要清屏的 pass 自带 ClearPass）。结果：任何向 targetA 写色的全屏 pass 会先把 targetA 的**深度清成 1.0**（swap 奇偶决定谁写 targetA，几乎任何配置都有人写）。

- OIT / 贴地分类在链**早期**采样深度（未被清）→ 正常，掩盖了问题。
- symbol 锚点遮挡在**整条链结束后**（后合成阶段）才采样 → 永远读到 1.0 → 判定"未遮挡"。
- 症状与深度比较公式无关：bias 怎么调都无效；把 bias 设 -1e9 却能让 symbol 全灭（分支活着）——这是"采样值恒为远平面"的特征。

**修复**：`EffectPassAdapter.render` 包裹 pass.render 时临时 `autoClear=false`（见 `src/effects.ts`）。

## 坑 2：OIT swap 奇偶性 + 一次性深度绑定（大气失效主因）

`EffectPassAdapter` 原先只在初始化那一帧从 `readBuffer` 绑深度。实体 OIT（EntityRenderManager）有透明实体时 `needsSwap=true`，大气 pass 初始化时 readBuffer 恰好是**无深度的 targetB** → 空气透视深度永远绑不上 → 大气静默失效。

- 症状：有透明实体（point 等）的案例大气消失；atmosphere.html（无实体，且开云走 cloudAtmosphereAdapter）正常——极具误导性，让人以为是"某个功能把管线改坏了"。
- **不是 symbol 渲染造成的**：symbol quad 被排除在 OIT 外，肇事者是案例里的 point 实体触发 OIT swap。

**修复三处**：
1. `EntityRenderManager`：OIT 合成改为 CustomBlending（SrcAlpha/OneMinusSrcAlpha，alpha 用 Zero/One 保底色 alpha）直接叠回 readBuffer，`needsSwap` 恒 false——`mix(base, c, a)` 本就等价于普通 alpha 混合，无需 tBase 采样 + 换 buffer。
2. `GroundClampPass`：分类结果 blit 回 readBuffer 而非 swap（分类材质采样 targetA 深度，不能直接写 targetA，会构成 feedback loop，故仍需绕道 targetB）。
3. `EffectPassAdapter`：深度绑定改为每帧检查，首见带深度的 readBuffer（或深度纹理对象更换）即重绑。

当前边界：大气之前的 pass 不得破坏其深度来源；大气之后允许 read/write 交换，需要深度的 pass 应检查两侧。实体 OIT 后续已移到大气之后，见 [地平线后续修复](透明实体在地平线被大气天空分支抹掉坑点.md)，不能照本节历史步骤把它移回大气之前。

## 坑 3：window-space 固定 bias + 邻域含天空（遮挡判定精度）

- 锚点遮挡的深度容差不能用 window-space 固定值（原 5e-4）：标准非线性深度下等效世界容差 ≈ Δd·z²/B，near=1 时 z=10km 处 5e-4 即等效 5km，吞掉全部遮挡差。**必须线性化到视空间用米制比较**：VS 传 `-(viewMatrix·anchor).z` 与 `projectionMatrix[2][2]/[3][2]`，FS 用 `-z_e = p32/(ndc+p22)` 反解场景视距，容差 `max(uOcclusionBiasMeters, uOcclusionBiasRel·锚点视距)`（默认 2m / 0.3%）。
- 防自遮挡的邻域 max 采样必须**剔除天空 texel（深度 1.0）**：锚点像素落在山脊/地平线剪影附近时邻域必含天空，不剔除的话 max 变远平面。锚点像素本身是天空则按不遮挡处理（剪影 ±1px 内固有歧义，可接受）。

## 排查方法备忘

- 相机 near/far 是动态的（运行时观测 near=1, far≈18 万），不要按 constants 里的默认值推算深度精度。
- 有效的运行时探测手段：playwright + 系统 Edge（`channel:'msedge'`）驱动 examples 页面，示例暴露 `window.viewer`，可直接钩私有成员（`viewer.symbolOcclusionPass`、`viewer.postProcessing.atmosphereAdapter.pass.fullscreenMaterial.uniforms`）、traverse 实体树改 uniform 做对照实验。
- 定位"shader 里到底读到了什么"：给可控 uniform 做**负 bias 扫描**（本例 `biasRel=-1e9` 固定、`biasMeters=-X` 二分），symbol 消失的阈值 X* 直接量出 `sceneViewZ − anchorViewZ`——X*≈9 万即采样值≈远平面，一次定位到"深度被清"。
- 构造无歧义遮挡场景：真实高山（富士山）后放实体，锚点像素深入山体几十像素，并用 `viewer.pickCartographic(锚点屏幕坐标)` 拿 CPU 真值对照；地平线场景锚点全贴剪影边缘，属病态用例。
