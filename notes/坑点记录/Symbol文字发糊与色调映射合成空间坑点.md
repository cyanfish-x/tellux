# Symbol 文字发糊与色调映射合成空间坑点

本文记录 SymbolEntity（文字标签 / 图标）渲染质量远逊于 Mapbox GL 的排查结论。核心经验是：**文字发糊的根因不在字形生成，而在渲染管线把 symbol 画进了色调映射之前的 HDR linear 缓冲**——抗锯齿的 coverage 渐变被 AgX 非线性压扁，任何 atlas / SDF 方案都救不了。这比"字形质量差"的直觉误判方向更值得沉淀。

## 现象

- 文字看起来"糊糊的脏脏的"，边缘膨胀、带灰色脏边，与 MapboxGL 差距明显。
- 每个字背后出现一块暗色矩形（描边色填满整个 quad）。
- 改字形生成参数（MSDF / TinySDF、distanceRange、smoothing）收效甚微。

## 容易误判的方向

1. **误以为是字形生成质量不够**（最易掉进去）。

   第一反应是去调 TinySDF / MSDF 的 fontSize、buffer、radius、distanceRange，甚至考虑换 troika-three-text。实际这些只能带来边际改善——字形数据本身是好的，问题在字形被画进了一个错误的合成空间。**排查 symbol 渲染问题，先查合成阶段，再查字形生成**，顺序反了会浪费大量时间在调参上。

2. **误以为是 MSDF 路线本身不行，想推翻换 SDF**。

   MSDF 在小字号标签上确实非主流（Mapbox 用单通道 SDF @ 24px），但 MSDF 路线修好合成阶段后完全能达标，且大字号下尖角优于 SDF。路线选择不是根因，不该在没查清合成阶段前推翻架构。

3. **误以为是 pixelRatio / 分辨率没传对**。

   实测 `uResolution` 用 drawing-buffer 物理尺寸、quad 尺寸 `*pr`、`uPixelSize` 也 `*pr`，三者口径一致，pixelRatio 链路是对的。不要在这条线上浪费时间。

4. **误以为是颜色反求（AgX inverse）没算准**。

   `resolveColor` 对**不透明**像素的反求是正确的（正向回代验证一致）。但它对**半透明边缘**失效——这是结构性的，不是算法精度问题（见根因一）。

## 真实根因（按致命程度排序）

### 根因一：symbol 在色调映射之前的 HDR linear 缓冲里混合（最致命）

Tellux 的渲染链：所有 pass 画进 HDR 离屏缓冲（HalfFloat targetA）→ 链尾 output material 对**整帧**做 AgX + sRGB 编码输出到 canvas。原先 `SymbolOcclusionPass` 作为链内 pass，symbol 也画在 targetA 里，颜色用 `resolveColor` 做 AgX 反求补偿——白色反求出来是 HDR 巨值（≈16 量级）。

- 不透明像素：AgX 把巨值还原回白，没问题。
- **半透明边缘像素**（抗锯齿 coverage 渐变）：`out = α·HDR巨值 + (1-α)·场景色`，哪怕 α=0.2，AgX 也把它映射到接近纯白。**coverage 渐变被整体压扁**——字形视觉膨胀、边缘与深色 halo 的过渡带变成灰色脏边。

这就是"糊糊脏脏、掩膜不对"的主凶，和 SDF/MSDF 字形质量完全无关。**换任何 atlas 方案都救不了**，因为问题在合成空间不在字形数据。

> 与 [实体颜色被AgX色调映射压扁坑点](./实体颜色被AgX色调映射压扁坑点.md) 的区别：实体（点/线/面）是不透明的，AgX 反求对它们有效；symbol 的抗锯齿边缘是半透明的，反求在 coverage 渐变上失效。同一套反求补偿，对不透明实体可用，对半透明文字边缘不可用。

### 根因二：SMAA（默认开启）排在 symbol 之后

SMAA 是形态学抗锯齿，会检测小字形边缘并沿边模糊。13px 中文过一遍 SMAA 必然发糊。即使修好根因一，只要 symbol 还在 SMAA 之前的缓冲里，仍会被糊。

### 根因三：MSDF atlas 开了 mipmap

`MsdfAtlasLoader` 原先 `generateMipmaps=true` + `LinearMipmapLinearFilter`。MSDF 三通道存的是有符号距离，边角靠 `median(r,g,b)` 重建；mipmap 会把相邻纹素的距离盒式平均再跨层插值，median 重建失效、尖角抹圆、边缘发灰。**MSDF 绝不能开 mipmap**，这是 MSDF 最典型的错误。atlas 字形 41px 渲染 13px 是 ~3:1 缩小，正好采样到被平均坏的 mip level。

### 根因四：MSDF shader AA 用 `fwidth(sd)` 且过渡带跨 ~2px

原先 `aa=fwidth(sd); smoothstep(0.5-aa, 0.5+aa, sd)`。`fwidth(sd)≈1/screenPxRange`，smoothstep 跨约 2 个屏幕像素，等于人为把边缘模糊 2px。msdfgen 官方做法是 `screenPxRange` 解析 AA：`clamp((sd-0.5)·screenPxRange + 0.5)`，只在边缘 ±0.5px 内过渡。

### 根因五：halo 宽度超出距离场可表达范围，整块 quad 被描边色填满

距离场只能表达边缘 ±0.5·screenPxRange（MSDF）或 ±radius（TinySDF）的范围。1.2px 的 halo 在 distanceRange=4 的 atlas 上超出可表达范围，远场（sd 饱和为 0）也落进 halo 区间，整个矩形被描边色填满——这就是字背后的暗色方块。

### 根因六：TinySDF 回退的 smoothing 公式相对 Mapbox 反了

`smoothing = 0.105·fontScale/pr`（乘法）。Mapbox 是 `gamma = (0.105/dpr)/(fontScale·gamma_scale)`（对 fontScale 是**倒数**）。小字号下 tellux 偏锐、易出锯齿。

### 根因七：atlas distanceRange=4 对 1.2px halo + 13px 字号偏小

渲染 13px 时 screenPxRange ≈ (13/42)·4 ≈ 1.2px，低于 msdfgen 推荐的 ≥2px；且 1.2px halo 需要 ±3.9 atlas px 的可表达范围，distanceRange=4（±2）不够，halo 被 clamp 变细。

## 修复方案

### 1. symbol 移到后合成阶段（对齐 Mapbox，根因一+二的根治）

`SymbolOcclusionPass` 拆成两步：
- **链内 `render()`**：只捕获本帧场景深度纹理与其 texel 尺寸，不绘制（`needsSwap` 恒 false）。
- **`renderAfterComposite()`**：由 `Viewer.renderFrame` 在 `rendererAdapter.render()`（已跑完 `end()` 输出到 canvas）之后调用，把 symbol 子树直接画到默认帧缓冲（`setRenderTarget(null)`）。

此时 canvas 已是 tone mapping + sRGB 后的最终图像，symbol 以 display 色彩空间做 alpha 混合——文字不过 AgX、不过 SMAA、不过 dithering，锚点遮挡逻辑（fragment shader 采样捕获的深度纹理，全有/全无）不变。

**必须旁路 effects 链**：否则 `renderer.render()` 会递归触发整条 `setEffects` 管线。`PostProcessingManager.renderWithEffectsBypassed` 临时 `setEffects([])` + `toneMapping=NoToneMapping`（`begin()` 对 NoToneMapping+空 effects 直接放行直绘），执行后恢复。无 PostProcessingManager 时 Viewer 手动旁路。

### 2. 颜色去掉 AgX 反求，改 display sRGB 直出

新增 `resolveDisplayColor`：把用户 sRGB 输入色用 `convertLinearToSRGB` 编码回 sRGB 分量（symbol shader 的 uniform 值即最终显示字节）。SymbolGraphic / AnchorQuadGraphic 全部从 `resolveColor` 切到 `resolveDisplayColor`。

**hex getter 必须用 `getHex(THREE.LinearSRGBColorSpace)`**：存的分量已是 sRGB 编码值，`getHex()` 默认会再做一次 linear→sRGB 编码导致二次编码。`fillColorHex` / `tintHex` 等 getter 都要跳过。

### 3. MSDF atlas 关 mipmap

`generateMipmaps=false` + 双 `LinearFilter`。AA 由 shader 承担。

### 4. MSDF shader 改 screenPxRange 标准 AA

```glsl
vec2 unitPerTexel = uMsdfUnitRange / max(fwidth(atlasUv), vec2(1e-6));
float screenPxRange = max(0.5 * (unitPerTexel.x + unitPerTexel.y), 1.0);
float fillPx = (sd - 0.5) * screenPxRange;
float fill = clamp(fillPx + 0.5, 0.0, 1.0);
```

`uMsdfUnitRange = (distanceRange/scaleW, distanceRange/scaleH)`，从 GlyphAtlas 一路传到 quad。

### 5. halo clamp 到距离场可表达范围

MSDF：`maxHaloPx = max(0.5·screenPxRange - 0.5, 0)`，`outerPx = fillPx + min(uOutlineWidth, maxHaloPx)`。
TinySDF：`haloEdge = max(0.75 - outlineWidth/spread, smoothing + 0.02)`，保证不低于远场过渡带下界。

### 6. TinySDF smoothing 对齐 Mapbox

`smoothing = (0.105/pr) / fontScale`（倒数）。屏幕空间 billboard 无透视 `gamma_scale`（Mapbox 里是 `gl_Position.w`），取 1 近似。

### 7. atlas distanceRange 提到 8

`scripts/generate-msdf-atlas.js` 改 `distanceRange: 8`，重跑 `pnpm generate:msdf`。既满足小字号 screenPxRange≥2，又满足 1.2px halo 的 ±4 atlas px 可表达范围。

## 验证方法

- `pnpm type-check` + `pnpm test:run`（49/49）+ `pnpm exec vite build --config examples/vite.config.ts` 全绿。
- `symbolOcclusionPass.test.ts` 重写：断言链内 `render()` 不绘制只捕获深度（`needsSwap=false`）、`renderAfterComposite` 只画 symbol 且 `setRenderTarget(null)`（画到 canvas）、无深度时仍绘制但不做遮挡、无可渲染 symbol 时跳过。
- 视觉对比：刷新 `examples/symbol` 页面，文字应从"糊糊脏脏带色块"变为清晰锐利、无背景色块、颜色与输入一致。

## 快速排查清单

Symbol 文字渲染异常时，按这个顺序查（**先合成阶段，后字形生成**）：

1. **合成阶段**：symbol 是否在 tone mapping 之前画进 HDR 缓冲？是否在 SMAA/dithering 之前？若是——必糊。确认 `SymbolOcclusionPass.renderAfterComposite` 在 `rendererAdapter.render()` 之后被调用，且 `renderWithEffectsBypassed` 旁路了 effects 链。
2. **颜色空间**：symbol 颜色是否走了 `resolveDisplayColor` 而非 `resolveColor`？hex getter 是否用了 `getHex(LinearSRGBColorSpace)` 防二次编码？
3. **MSDF mipmap**：`MsdfAtlasLoader` 是否 `generateMipmaps=false` + 双 `LinearFilter`？（MSDF 绝不能 mipmap）
4. **MSDF AA**：shader 是否用 `screenPxRange` 标准公式而非 `fwidth(sd)` smoothstep？`uMsdfUnitRange` 是否正确传递？
5. **halo 溢出**：字背后是否有暗色方块？若有，halo 没被 clamp 到距离场可表达范围。
6. **distanceRange**：atlas 的 `distanceRange` 是否 ≥ 2×（halo_atlas_px）？小字号 screenPxRange 是否 ≥ 2？
7. **TinySDF 回退**：`smoothing` 公式是否对 fontScale 是倒数（`(0.105/pr)/fontScale`）？
8. 最后才轮到调字形生成参数（fontSize/buffer/radius/charset）。

## 相关文件

- `src/entities/SymbolOcclusionPass.ts` — 链内捕获深度 + `renderAfterComposite` 后合成绘制
- `src/Viewer.ts` — `renderFrame` 末尾调用 `renderSymbolsAfterComposite`
- `src/rendering/PostProcessingManager.ts` — `renderWithEffectsBypassed` effects 旁路
- `src/entities/invertToneMapping.ts` — `resolveDisplayColor`（symbol 用）、`resolveColor`（不透明实体用）
- `src/entities/AnchorQuadGraphic.ts` — MSDF screenPxRange AA + halo clamp + display-sRGB 颜色
- `src/entities/GlyphAtlas.ts` — `msdfUnitRange` 传递、TinySDF smoothing 对齐 Mapbox
- `src/entities/MsdfAtlasLoader.ts` — 关 mipmap
- `scripts/generate-msdf-atlas.js` — `distanceRange: 8`

## 维护准则

- **symbol 永远在后合成阶段绘制**，不要为了"统一渲染"把它挪回 effects 链。Mapbox/MapLibre/deck.gl 全部这么做——文字标签是 display-space overlay，不是 HDR 场景内容。
- **symbol 颜色用 `resolveDisplayColor`，不透明实体颜色用 `resolveColor`**。两套补偿并存：不透明实体靠 AgX 反求在 HDR 缓冲里 WYSIWYG；symbol 靠后合成直出在 display 空间 WYSIWYG。不要混用——symbol 用 `resolveColor` 会导致半透明边缘发糊（本坑点），不透明实体用 `resolveDisplayColor` 会被 AgX 压扁。
- **MSDF 纹理永远 `generateMipmaps=false`**。任何"缩小采样要 mipmap 抗锯齿"的直觉对距离场都是错的——MSDF 的 AA 在 shader 里。
- **新增任何后处理 pass 时检查它是否排在 symbol 之后**。symbol 后合成意味着它不受后处理链影响；若新 pass 必须作用于 symbol，需重新评估合成顺序。
- **distanceRange 改动后要同时满足两个约束**：小字号 screenPxRange ≥ 2、halo_atlas_px ≤ 0.5·distanceRange。改 halo 默认宽度或字号下限时要复核。
- **`getHex` 的 colorSpace 参数**：存 sRGB 编码分量的 Color 用 `getHex(LinearSRGBColorSpace)` 跳过二次编码；存 linear 分量的 Color 用默认 `getHex()`。混用会偏色。

## 方法论反思：方向是否从根上错

用户直接问了"现在的方案从根上是不是错了、是否符合业界主流"。结论：

1. **合成阶段错了，这是"从根上错"的部分**。把 symbol 画进 HDR linear 缓冲再整帧 AgX，对文字抗锯齿是毁灭性的。业界（Mapbox/MapLibre/deck.gl）全部把标签在 tone mapping 之后、display 色彩空间直接混合到帧缓冲。这是主流方向，Tellux 原方案偏离了它。

2. **MSDF 路线不算错，但非小字号标签的主流**。地图小字号标签的主流是单通道 SDF（Mapbox 用 TinySDF @ 24px oneEm）；MSDF 的优势在大字号、任意缩放的 UI 文字。修好合成阶段后 MSDF 能达标且大字号更好，保留没问题；但若未来只做小字号标签、追求极简，纯 SDF 也足够。

3. **排查顺序的教训**：文字质量问题，"调字形生成参数"是最后一步，不是第一步。第一反应应该是画出渲染链路图，定位 symbol 在哪个缓冲、哪个阶段被合成、被哪些后处理作用。这次第一轮（修 MSDF mipmap/AA）收效甚微，就是因为没先解决合成空间；第二轮从管线结构入手才根治。**先结构后参数**，这条规律适用于所有"渲染结果不对"的排查。
