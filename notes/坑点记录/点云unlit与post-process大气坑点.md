# 点云 unlit 与 post-process 大气坑点

本文记录 3D Tiles 点云在 `lighting.mode = 'post-process'` 下颜色被冲白的完整根因，以及 Tellux 对无法线点云采用的标准 unlit 与显示色管理语义。

## 已确认的事实

- 对 Cesium Ion Melbourne Point Cloud（asset `43978`）抽样多层级 `pnts`：Draco 属性只有 `POSITION` / `RGB`，没有 `NORMAL` / `NORMAL_OCT16P`。
- Cesium 的 `PntsLoader` 不为点云重建法线。没有法线时模型被标记为 unlit；EDL 只读取邻域深度并乘暗当前颜色。
- Takram `AerialPerspectiveEffect` 看到退化法线时会跳过 `getSunSkyIrradiance`，先保留 `inputColor.rgb`；但后续空气透视仍会默认施加 transmittance / inscatter，这正是“已经 unlit 却仍被洗白”的第二段链路。
- Three r184 的 `WebGLRenderer.setEffects()` 在场景阶段强制 `NoToneMapping`，最后再由 output material 对整帧执行 AgX + sRGB。因而 `PointsMaterial.toneMapped = false` 在该链路中无效；默认曝光 `5` 会继续把已经 unlit 的 RGB 推亮。这是此前只修 NormalPass / 大气分支后画面仍发白的关键遗漏。
- `THREE.PointsMaterial` 本身不接受 Three.js 场景光照。用椭球法线、屏幕导数或固定环境光伪造光照，会制造并不存在的数据含义。

## 引擎语义

| 点云数据 / 配置 | NormalPass | 大气后处理 | 后续可选效果 |
|---|---|---|---|
| 有几何 `normal` 且 `normalShading: true` | 写真实法线 | 接受标准场景光照与空气透视 | attenuation / EDL |
| 无几何 `normal` | 写明确的 unlit 标记 | 保留原始点色，跳过光照与空气透视 | attenuation / EDL |
| `normalShading: false` | 写明确的 unlit 标记 | 即使数据有法线也保留原始点色 | attenuation / EDL |

实现中 `PointCloudShadingController` 只写 `aTelluxPointNormalEnabled` 状态；`PostProcessingManager` 的 NormalPass 用 `vec4(0)` 表示点云 unlit 像素。RGB=0 触发 Takram 的退化法线语义，alpha=0 只用于把这类像素从全局空气透视中排除。它不是光照参数，也不参与 EDL。

### 最终 output pass 的显示色保持

无法线点云的 `RGB` 是要显示的源颜色，而不是 HDR 光照结果。Tellux 在 WebGL 下为点云材质挂接 Viewer 级 `PointCloudColorTransform`：

1. 延迟生成一张标准尺寸的 33³ AgX 逆向 3D LUT。
2. 在点云顶点阶段按源 RGB 采样 LUT，并除以当前 `toneMappingExposure`。
3. Three 的最终 output pass 再乘曝光并执行 AgX，把点色还原成源显示色。

这是颜色管理，不是额外光照或艺术调色。LUT 不改写数百万点的颜色 attribute，只在 GPU 每个点顶点采样一次；所有点云图层共享同一个 TilesetManager / Viewer 级 LUT，曝光变化只同步一个 uniform。非 AgX 或非 WebGL 路径不会启用该补偿。尤其 WebGPU 下 `toneMapped=false` 同样不是最终输出豁免；在 TSL / `RenderPipeline` 存在等价显示色节点前，应明确视为“不提供显示色保持补偿”，而不是悄悄退化。

AgX 反求必须严格按 GLSL `mat3` 的列主序还原成 CPU 行主序。`LINEAR_SRGB_TO_LINEAR_REC2020` 与 `LINEAR_REC2020_TO_LINEAR_SRGB` 若直接照抄构造器分组，会发生矩阵转置错误，表现为“白色消失了但整片偏绿”。测试必须用 Three.js 的正向矩阵做 round-trip，而不能只断言反求结果发生变化。

## 五分钟定位流程

点云“发白 / 偏色 / 看起来不受预期控制”时，按渲染顺序取证；不要从环境光、材质参数或颜色增益开始试。

| 步骤 | 要确认的事实 | 结论与下一步 |
|---|---|---|
| 1. 数据 | `color` attribute 的数组类型、`normalized`、采样范围；`normal` 是否存在 | `Uint8Array + normalized=true` 且原始值不是接近 255，说明不是数据已白或 0–255 归一化错误；缺 normal 则进入 unlit 路径核查 |
| 2. 点材质 | `PointsMaterial.vertexColors`、`toneMapped`、`size` / `sizeAttenuation` | 顶点色未启用才修材质绑定；`toneMapped=false` 只能说明场景阶段不做材质 AgX，不能证明最终显示色安全 |
| 3. 大气 | `aTelluxPointNormalEnabled` 与 NormalPass 输出 | 无法线点必须为 0，且大气 / 空气透视必须跳过该像素；不满足才排查 `AtmosphereShaderPatches` |
| 4. 最终输出 | `renderer.toneMapping`、`toneMappingExposure`、是否调用 `renderer.setEffects()` | AgX + `setEffects()` 同时存在时，必然检查 `PointCloudColorTransform`；不要继续调弱环境光或尝试 `toneMapped=false` |
| 5. 着色程序 | 点材质 cache key / uniforms 是否含 `tellux-point-color-transform`，program diagnostics 是否为空 | 缺 patch 表示控制器或 WebGL 条件未接通；有 patch 仍偏色时先跑 AgX 正反向 round-trip，再检查矩阵方向 |
| 6. 可选增强 | attenuation 和 EDL 的运行时状态 | 只影响点大小和深度轮廓；它们不能解释整片泛白，也不能作为颜色修复手段 |

推荐先对一个已加载的 `Points` 节点采样，再切换 `toneMappingExposure` 做 A/B 截图：若背景随曝光大幅变化、点色也同步冲白，问题在最终 output；若点色稳定而只剩空气雾化，则问题仍在大气分支。调试探针必须只采集颜色范围、标记位和 renderer 状态，完成后移除。

## 责任边界与不可变量

```text
3D Tiles RGB（显示色语义）
  → PointCloudColorTransform（仅 WebGL + AgX）
  → 场景 HDR 缓冲
  → 大气 / EDL
  → Three WebGLOutput（AgX + sRGB）
  → canvas
```

- `PointCloudShadingController`：识别数据法线、维护 unlit 标记、attenuation 和 EDL 状态；不处理色调映射数学。
- `PointCloudColorTransform`：仅负责将源点色预补偿为能穿过最终 output 的线性值；不参与光照、法线或 EDL。
- `PostProcessingManager` / `AtmosphereShaderPatches`：尊重 unlit 标记，不能把散射重新加回无点云法线像素。
- `TilesetManager`：拥有一份 Viewer 级 LUT 并同步曝光；不能为每个 tile 或每帧重建 LUT。

这四层必须保持单向职责。把颜色补偿塞进 EDL、大气 shader 或点云 loader，都会让同一 RGB 在不同阶段被重复解释。

具体的取舍与升级边界见 [ADR 0002：无法线点云以显示色语义穿过全屏输出链](../架构/adr/0002-display-referred-point-cloud-colors.md)。

## attenuation 与 EDL

- **Attenuation**：根据瓦片 `geometricError`、相机距离与视口投影调整屏幕点大小，不改变 RGB。
- **EDL**：独立 mask + 邻域深度差后处理，只把轮廓压暗，不需要法线，也不生成法线。仅 WebGL 可用。

两者可以同时开启，并且与 unlit 不冲突：unlit 决定颜色来源，attenuation 决定点大小，EDL 决定深度轮廓。

## 明确拒绝的方案

- 不用椭球外向法线、导数法线或邻域法线重建来冒充源数据法线。
- 不为无法线点云注入弱环境光、Lambert、饱和度/增益或人为曝光增益；只允许为抵消引擎强制全屏 output transform 而做数学可逆的显示色管理。
- 不把 EDL 描述成光照或法线重建；它只是屏幕空间深度增强。
- 不宣称渲染结果与 Cesium 像素级一致，只对齐公开语义与管线职责。

## 相关文件

- `src/types/pointCloudShading.ts`
- `src/tiles/PointCloudShadingController.ts`
- `src/tiles/PointCloudColorTransform.ts`
- `src/entities/invertToneMapping.ts`
- `src/rendering/PostProcessingManager.ts`
- `src/rendering/AtmosphereShaderPatches.ts`
- `src/rendering/PointCloudEdlEffect.ts`
- `src/materials/materialMode.ts`
- `examples/point-cloud-3d-tiles.ts`

## 升级检查

升级 three、postprocessing 或 `@takram/three-atmosphere` 时，必须回归：

1. NormalPass 的点大小与 unlit 标记仍正确写入。
2. Takram 的 `degenerateNormal` 分支仍保留 `inputColor.rgb`。
3. unlit 点云仍跳过空气透视，带法线点云仍走正常大气路径。
4. EDL 仍位于大气成图之后，并使用独立点云 mask 与场景深度。
5. `setEffects()` 是否仍在场景阶段禁用 tone mapping、最终整帧统一输出；若 Three 改变该语义，应删除或调整 `PointCloudColorTransform`，避免重复补偿。
6. AgX 正反向 round-trip、曝光同步和 3D LUT shader 注入测试仍通过。
7. 用 Melbourne asset `43978` 做一次真实 WebGL 回归：检查绿色植被、深色建筑和地面层次，不得把“所有点云偏亮”误判为 EDL / attenuation 参数问题。
