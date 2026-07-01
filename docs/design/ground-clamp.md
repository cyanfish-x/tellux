# 实体贴地（Ground Clamp）技术方案

> 状态：**设计中，暂未实现**（2026-07-01）
> 范围：点 / 线 / 面实体的真·贴地渲染，对标 Cesium `GroundPrimitive` / `GroundPolylinePrimitive`。
> 渲染器：**WebGL 优先全量实现**；WebGPU 支持暂不处理，后续单独立项。

---

## 0. 背景与决策

### 0.1 现状

实体位置由 [Viewer.cartographicToVector3](../../src/Viewer.ts) 经椭球 `getCartographicToPosition` 落点，输入里的 `height` 米数即最终绝对椭球高，**无任何地形跟随**。材质统一 `depthWrite: false`（[PolygonGraphic](../../src/entities/PolygonGraphic.ts)、[PolylineGraphic](../../src/entities/PolylineGraphic.ts)、[EntityRenderManager](../../src/entities/EntityRenderManager.ts)）。

### 0.2 被否决的方案：CPU 采样重建

"沿几何采样地形高程 → 重建几何"的妥协路线被否决，原因：

- terrain/3D Tiles 是流式 LOD，相机移动、新瓦片载入后采样即过时，需要反复重采样重建，面几何每次重建代价高；
- 仍会出现穿山 / 浮空，**满足不了真贴地需求**。

### 0.3 采用的方案：GPU 阴影体 + 深度纹理逐片元分类

完全对标 Cesium：**CPU 建静态"分类体（shadow volume）"几何，渲染时在片元着色器里读主场景深度纹理、还原地表点、逐像素判定该点是否落在图元 footprint 内**。几何不随地形 LOD 重建。

该方案在 tellux **可行且不从零搭**，因为：

| Cesium 依赖                                | tellux 现状                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `czm_globeDepthTexture`（地形+瓦片深度） | `postprocessing` EffectComposer 的 `readBuffer.depthTexture`，主场景（terrain + 3D Tiles + 不透明实体）已渲入其中                                                                                    |
| 片元读深度 + 改写材质注入分类逻辑          | [EntityRenderManager](../../src/entities/EntityRenderManager.ts) 的 OIT pass 已用 `onBeforeCompile` + `telluxSceneDepth` uniform 读 `readBuffer.depthTexture` 做 `telluxDepthDiscard`（L336-357） |
| 多 pass 编排                               | effects 链 +`EntityRenderManager` 已是多 pass 范式                                                                                                                                                     |
| tile 材质打 stencil bit                    | 已有 tile 材质插件机制（`TilesetModelPlugins`、`WebGPUTerrainOverlayPlugin`）可 patch 材质                                                                                                           |

即：**贴地分类 pass 与 OIT pass 同构**——读 `readBuffer.depthTexture`、用自定义材质渲一组几何、把分类结果合成回主色。

### 0.4 关键约束

- **WebGPU 下 `onBeforeCompile` GLSL 注入失效**（见根 [TODO.md](../../TODO.md) 已记录坑点）。本方案的材质注入强依赖该机制，故 **WebGL 优先**；WebGPU 需改用 TSL/WGSL 原生着色器，**本期不做**。
- 点实体走 **CPU `heightReference` 采样**（见 §3.7）。这是 Cesium 对点 / 布告板 / 标签 / 模型的**正解**（`Model.updateClamping`、`Billboard._updateClamping` 均 CPU 采样改 modelMatrix），不是妥协。线 / 面才用 GPU 分类。

---

## 1. Cesium 实现回顾（决策依据）

> 源码版本 1.136，路径 `D:/dev_work/gis-template/node_modules/cesium/Build/CesiumUnminified/`。

### 1.1 贴地线：静态墙体积 + 逐片元分类

- **几何**（`Workers/createGroundPolylineGeometry.js`）：沿大地线 / 恒向线按 `granularity`（默认 9999m）细分，**不采样地形**；每段生成一个 `minHeight..maxHeight`（0..1000m）的墙立方体（8 顶点 36 索引，`REFERENCE_INDICES` L1075）。`min/maxHeight` 仅来自超粗全局表 `ApproximateTerrainHeights`（6 级 ≈1°），**只用于撑大包围球、保证墙体包住地形范围**（L1434），不参与真实贴合。
- **顶点属性**：`startHi/startLo`（`EncodedCartesian3` 高 / 低双精度拆分）、`forwardOffset`、`startPlaneNormal`、`endPlaneNormal`、`rightNormal`、texcoord 归一化（L1130-1558）。
- **渲染**（`Cesium.js` `GroundPolylinePrimitive` / `PolylineShadowVolumeFS` L57231，pass `TERRAIN_CLASSIFICATION`=3）：
  ```glsl
  float d = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
  if (d == 0.0) discard;                                       // 天空丢弃
  vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, d);
  // 用当前线段的 右平面 / 起点平面 / 终点平面 + 半宽 判定地表点是否在线条 footprint 内
  if (abs(planeDistance(v_rightPlaneEC, eye.xyz)) > halfWidth) discard;
  if (planeDistance(v_startPlane..., eye.xyz) < 0.0) discard;
  if (planeDistance(v_endPlane...,   eye.xyz) < 0.0) discard;
  // 命中 → 输出颜色，czm_depthClamp() 让墙体在地下也参与
  ```
- `czm_depthClamp` 保证墙体被地形遮挡时片元仍参与计算；墙体几何只提供"哪些像素运行 FS"+"平面属性"，可见结果完全由重建的地表点决定。

### 1.2 贴地面：模板阴影体两遍

`GroundPrimitive`（= `_extruded:true` 的 `ClassificationPrimitive`，L54413）每几何**两条命令**：

| pass                    | colorMask | 模板                                             | 作用                                                  |
| ----------------------- | --------- | ------------------------------------------------ | ----------------------------------------------------- |
| stencil-depth（L53611） | 全 false  | `zFail: 前 DECREMENT_WRAP / 后 INCREMENT_WRAP` | 阴影体打掩码：地形挡住墙体处掩码 ≠0 = "在体内且可见" |
| color（L53645）         | 写色      | `NOT_EQUAL 0`，命中后 ops 全 `ZERO` 清掩码   | 只给掩码 ≠0 的像素着色                               |

color pass 的 `ShadowVolumeAppearanceFS`（L52658）同样读深度还原世界坐标，并用 `vectorFromOffset` **采样相邻像素深度重建地表法线**用于打光。

### 1.3 3D Tiles 分类：同几何 + 换 pass / 模板 / 深度源

3D Tiles 画时 `REPLACE` 写模板位 128（`CESIUM_3D_TILE_MASK`），分类命令在 `CESIUM_3D_TILE_CLASSIFICATION`（pass=6）用 `EQUAL` 模板门控、深度源换为瓦片打包深度。**同一份分类体，仅换 pass + 渲染状态 + 深度来源**——对应 tellux `HeightSampler.source` 的 `terrain | tileset | all`。

### 1.4 heightReference：CPU 采样（点 / 布告板 / 模型）

`CLAMP_TO_GROUND` = 清零高度偏移；`RELATIVE_TO_GROUND` = 采样地表高 + 偏移。CPU 改 modelMatrix / 位置属性，**与 GroundPrimitive 着色器无关**。

### 1.5 两个值得落实的工程细节

1. **`EncodedCartesian3` 高 / 低双精度**：顶点位置拆 `high + low`（Float32 + Float32），VS 里 `vec3 p = high.xyz + low.xyz` 还原，对抗地球尺度 Float32 抖动。当前 [PolylineGraphic](../../src/entities/PolylineGraphic.ts) 用 `LineGeometry.setPositions`（Float32），长贴地线必抖。
2. **法向微偏移（normal nudge）治 z-fighting**：墙体前 / 后两面沿 `rightNormal` 各偏移 `±EPSILON5`（L1458-1489）+ `nudgeXZ`（L1014）处理日期变更线，而非简单抬高度（抬高度会破坏贴地语义）。

---

## 2. 总体架构

```
postprocessing EffectComposer 链
  ├─ [主场景渲染]  terrain + 3D Tiles + 不透明实体 → readBuffer（含 depthTexture）
  ├─ EntityRenderManager（OIT，已有）
  ├─ GroundClampPass（新增） ─────────────────────────────┐
  │     in:  readBuffer.texture（主色） + readBuffer.depthTexture（地表深度）
  │     渲:  groundClampRoot（贴地线墙体积 + 贴地面阴影体，分类材质）
  │     出:  writeBuffer（主色 ⊕ 分类着色）
  └─ 后续 effects（大气 / tonemap / ...）
```

数据流（分类片元）：

```
gl_FragCoord → 采样 depthTexture → 窗口深度 z
  → NDC → clip → inverseProjection → 眼坐标 eye
  → (inverseView → 世界坐标 world，面/打光用)
  → 平面测试（线：右/起/终平面 + 半宽；面：阴影体模板已界定内外）
  → 命中：输出颜色（预乘 alpha）；未命中：discard
```

新增组件：

| 组件                          | 职责                                     | 对标 Cesium                                                           |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `GroundClampPass`           | effects pass：绑定深度、渲分类几何、合成 | `TERRAIN_CLASSIFICATION` pass 编排                                  |
| `GroundPolylineGraphic`     | 线墙体积几何 + 分类材质                  | `GroundPolylineGeometry` + `PolylineShadowVolumeFS`               |
| `GroundPolygonGraphic`      | 面阴影体几何 + 模板两遍材质              | `PolygonGeometry.createShadowVolume` + `ShadowVolumeAppearanceFS` |
| `EncodedCartesian3`（util） | 高 / 低双精度拆分                        | `EncodedCartesian3`                                                 |
| `heightReference` 枚举      | API                                      | `HeightReference`                                                   |
| 点：复用`HeightSampler`     | CPU 采样改点位置                         | `Billboard._updateClamping`                                         |

---

## 3. 组件设计

### 3.1 深度源与坐标还原

- **深度源**：复用 `readBuffer.depthTexture`。clamped 实体 `depthWrite:false`，不污染地表深度；该纹理所含即 terrain + 3D Tiles 深度（Phase 1 = union）。需**核实** 3D Tiles 是否也渲入该 readBuffer（render loop 顺序，见 §6 开放问题）。
- **还原**（ShaderMaterial 内置 `projectionMatrix` / `viewMatrix`）：
  ```glsl
  float z = texture2D(telluxGroundDepth, gl_FragCoord.xy / uResolution).r;  // [0,1] 窗口深度
  if (z >= 1.0) discard;                                                      // 天空（需按实际 clear 深度核实）
  vec4 clip = vec4(vec3(gl_FragCoord.xy / uResolution, z) * 2.0 - 1.0, 1.0);
  vec4 eye = inverseProjection * clip; eye /= eye.w;
  vec4 world = inverseView * eye;                                            // 面片元打光用
  ```

  深度纹理类型 / 编码需与投影一致，验证 `readBuffer.depthTexture` 的 `type`（fixed vs HalfFloat）与是否启用 logarithmic depth。

### 3.2 贴地线几何（port `createGroundPolylineGeometry`）

- 沿椭球细分：大地线（`EllipsoidGeodesic`）/ 恒向线（`EllipsoidRhumbLine`），`granularity` 默认 9999m。tellux 可用现有椭球（`tilesets.tileset.ellipsoid`）。
- 每段墙体积：8 顶点 / 36 索引（直引 `REFERENCE_INDICES`），`min/maxHeight` 撑包络。
- `min/maxHeight` 来源：**Phase 1 用固定带 + `HeightSampler` 粗采样**（对标 `ApproximateTerrainHeights`），仅作包围球与墙体高度，不参与贴合判定。
- 顶点属性 port：`startHi/startLo`、`forwardOffset`、`start/end/right` 平面法向、texcoord 归一化（含 2D 属性可裁剪，tellux 仅 3D 模式）。
- **细节 1 落实**：`startHi/startLo` 经 `EncodedCartesian3.fromCartesian` 拆分。
- **细节 2 落实**：前 / 后两面沿 `rightNormal` 各 `±EPSILON5` 偏移 + `nudgeXZ`。

### 3.3 贴地线分类材质（port `PolylineShadowVolumeFS/VS`）

- **VS**：用 `startHi + startLo` 双精度还原段起点；由属性 + `modelViewMatrix` 算眼空间 `rightPlaneEC / startPlaneEC / endPlaneEC` 与 `halfWidth` 作 varying。
- **FS**：§3.1 还原地表 `eye`；`abs(planeDistance(rightPlane, eye)) <= halfWidth && planeDistance(startPlane) >= 0 && planeDistance(endPlane) >= 0` 否则 discard；命中输出预乘 alpha 颜色。
- **渲染状态**：`depthTest:false`（手动比深度）、`depthWrite:false`、`blending: Normal` 或预乘 alpha；**不需 stencil**（单 pass 深度纹理分类，比 Cesium 更简，因始终有深度纹理）。

### 3.4 贴地面几何（阴影体）

- `PolygonGeometry`：环投影到椭球面、切平面内三角化、按 `arcType` 细分边界（port `createPolygonGeometry` 的 `perPositionHeight:false / height:0` 路径）。
- `createShadowVolume`：把扁平多边形沿法向上下挤出成体积（对标 Cesium `GroundPrimitive` 的 `_extruded`）。
- 包络高度同样走 `HeightSampler` 粗采样。

### 3.5 贴地面分类材质（port `ShadowVolumeAppearanceFS`，模板两遍）

WebGL `WebGLRenderTarget` 支持 `stencilBuffer:true`；`THREE.Material` 支持 `stencilWrite/stencilFunc/stencilOp/stencilRef`。

- **stencil-depth 材质**：`colorWrite:false`、`depthTest:LESS`、模板 `zFail: front DECR_WRAP / back INCR_WRAP`、`ref=CESIUM_3D_TILE_MASK/CLASSIFICATION_MASK`。
- **color 材质**：`stencilFunc: NOT_EQUAL, ref 0`、命中后 `stencilOp: ZERO` 清掩码；FS 读深度还原世界坐标 + `vectorFromOffset` 重建法线打光。

> 备选简化（评估）：始终有深度纹理时，面也可走单 pass "重建地表点 → 点在多边形 footprint 内判定"，省去模板。凹多边形的逐片元 point-in-polygon 是难点，故 Phase 1 仍采 Cesium 模板阴影体（稳健、支持凹多边形）。

### 3.6 GroundClampPass 编排

- 实现 `ThreeEffectPass`（同 `EntityRenderManager` 形态）：`render(renderer, writeBuffer, readBuffer)`。
- 维护 `groundClampRoot: THREE.Group`，挂所有 `GroundPolylineGraphic` / `GroundPolygonGraphic` 的 `object3D`。
- 绑定 `readBuffer.depthTexture` 到分类材质的 `telluxGroundDepth` uniform（同 OIT 的 `telluxSceneDepth` 注入范式）。
- 渲分类几何到 `writeBuffer`（主色 ⊕ 分类色）；`needsSwap = true`。
- **插入位置**：effects 链中、`EntityRenderManager` 邻近、tonemap / 大气合成之前（具体顺序 §6 核实）。

### 3.7 点：heightReference CPU 采样（正解，非妥协）

- `heightReference !== NONE` 时，`Entity` add 发起 `HeightSampler.sampleHeightMostDetailed([pos], {source})`，resolve 后 `PointGraphic.setPosition`。
- add 立即用椭球高先摆出来，采样 resolve 后 snap（渐进式，同瓦片流式体验）。
- **LOD 重采样**：挂 `TilesetSamplingAdapter` readiness 信号或 `update()` 周期去抖重采样（点仅 1 顶点，几乎免费）。
- `source` 由 `heightReference` 决定：`CLAMP_TO_GROUND→'all'`、`CLAMP_TO_TERRAIN→'terrain'`、`CLAMP_TO_TILESET→'tileset'`。

### 3.8 实体集成

- `Entity` 构造：`polyline.heightReference !== NONE` → 建 `GroundPolylineGraphic`，加入 `groundClampRoot`（非普通 entity root）；面同理。
- `EntityManager` 需持有 `groundClampRoot` 引用（由 `GroundClampPass` 提供 / 注入）。
- 普通拾取（[EntityPicker](../../src/sampling/EntityPicker.ts)）对线 / 面走射线或屏幕投影——贴地几何为墙体积，射线命中语义需重新定义（建议按 footprint 投影拾取，复用现有 `forEachSegment` 屏幕投影逻辑）。

---

## 4. API 设计

```ts
export type HeightReference =
  | 'NONE'                // 绝对椭球高（当前行为）
  | 'CLAMP_TO_GROUND'     // source:'all'，terrain 与 3D Tiles 取上（union 深度）
  | 'CLAMP_TO_TERRAIN'    // source:'terrain'，不粘建筑顶（需 Phase 3 分离深度）
  | 'CLAMP_TO_TILESET'    // source:'tileset'，贴 3D Tiles 表面（需 Phase 3）
  | 'RELATIVE_TO_GROUND'  // CLAMP_TO_GROUND + height 作为偏移米数（Phase 4）
```

- 每个 graphic 各自一个字段，落 `PointOptions / PolylineOptions / PolygonOptions`：
  ```ts
  heightReference?: HeightReference
  ```
- 与现有多边形 `height / extrudeHeight` 的关系：`CLAMP_*` 时 `height` 被忽略；`RELATIVE_TO_GROUND` 时 `height` 作地表之上的偏移。
- **Phase 1 仅实现 `NONE` + `CLAMP_TO_GROUND`**；`CLAMP_TO_TERRAIN/TILESET` 依赖 §3.6 的分离深度快照（Phase 3）。

---

## 5. 分阶段计划（仅 WebGL）

| 阶段                               | 交付                                                                                                                                                                    | 验收                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **P0** 深度分类管线 + 贴地线 | `GroundClampPass` 骨架、深度绑定、`EncodedCartesian3`、port `GroundPolylineGeometry` 墙体积、线分类材质、normal nudge、`heightReference: CLAMP_TO_GROUND`（线） | 线在山地上随地形起伏贴合，相机 / LOD 变化无穿山 / 浮空、无抖动 |
| **P1** 贴地面                | `GroundPolygonGraphic` 阴影体几何 + 模板两遍材质（port `ShadowVolumeAppearanceFS`）、`CLAMP_TO_GROUND`（面）                                                      | 面贴合地形，凹多边形正确，相邻面无 z-fighting                  |
| **P2** 点 heightReference    | `HeightSampler` 接入 + LOD 重采样、`CLAMP_TO_GROUND`（点）                                                                                                          | 点 snap 到地表，LOD 载入后位置收敛                             |
| **P3** terrain/tileset 分离  | 主渲染中插入 terrain-only 深度快照 →`CLAMP_TO_TERRAIN` / `CLAMP_TO_TILESET`                                                                                        | 同一线可仅贴地形或仅贴建筑顶                                   |
| **P4** RELATIVE + 打磨       | `RELATIVE_TO_GROUND`、精度 / 性能（scissor、bounding）、与 OIT 交互厘清                                                                                               | 偏移贴地稳定，大场景帧率达标                                   |
| ~~P5 WebGPU~~                     | **本期不做**，后续单独立项（TSL/WGSL 原生着色器）                                                                                                                 | —                                                             |

细节 1（双精度）与细节 2（微偏移）随 **P0** 落实，贯穿后续。

---

## 6. 风险与开放问题

- **深度源完整性**：`readBuffer.depthTexture` 是否含 3D Tiles 深度？需核实 [ViewerRenderLoop](../../src/rendering/ViewerRenderLoop.ts) 与 `3d-tiles-renderer` 渲染时序；若 3D Tiles 在独立 pass，Phase 1 的 union 深度需调整。
- **深度纹理格式 / log-depth**：还原公式依赖深度编码；若管线启用 logarithmic depth，需走对应反演路径（对标 `czm_reverseLogDepth`）。
- **MSAA**：分类 pass 读深度需与主场景 MSAA 解析一致；postprocessing 链通常非 MSAA，需确认。
- **模板可用性**：composer 目标需 `stencilBuffer:true`，否则面模板两遍需独立 stencil RT。
- **性能**：全屏深度采样按分类片元计；用紧致包围球 + `renderer.setScissor` 裁剪到图元屏区缓解。
- **与 OIT 交互**：贴地实体通常不透明；若半透明，分类色与 OIT 累加的先后 / 混合需厘清。
- **拾取语义**：墙体积被射线命中 ≠ 用户意图；需按 footprint 重定义（§3.8）。
- **granularity / 墙高默认值**：tellux 场景尺度下需标定（Cesium 9999m / 0..1000m）。

---

## 7. 参考

**Cesium 1.136**（`D:/dev_work/gis-template/node_modules/cesium/Build/CesiumUnminified/`）：

- `Workers/createGroundPolylineGeometry.js` — 线墙体积几何
- `Cesium.js` L52658 `ShadowVolumeAppearanceFS`、L57231 `PolylineShadowVolumeFS`、L53611/53645 模板 / color render state、L36379 `windowToEyeCoordinates`、L54413 `GroundPrimitive`、L57964 `GroundPolylinePrimitive.createCommands`

**tellux**：

- [EntityRenderManager.ts](../../src/entities/EntityRenderManager.ts) — OIT depth-reading pass 范式（`telluxDepthDiscard` L351、材质注入 L336）
- [effects.ts](../../src/effects.ts) — `ThreeEffectPass` / depthTexture 注入
- [HeightSampler.ts](../../src/sampling/HeightSampler.ts) — 点 heightReference 采样源
- [EntityPicker.ts](../../src/sampling/EntityPicker.ts) — 拾取
- [PolylineGraphic.ts](../../src/entities/PolylineGraphic.ts) / [PolygonGraphic.ts](../../src/entities/PolygonGraphic.ts) / [PointGraphic.ts](../../src/entities/PointGraphic.ts) — 现有 graphic
- [entities.ts](../../src/types/entities.ts) — `EntityOptions` / `*Options` 类型

