# API 稳定版破坏式变更原稿

> 2026-09-06 从决策入口完整保留原稿。当前决策摘要见 [API 决策](../decisions/API稳定版设计决策.md)。以下施工步骤、文件统计、估时与行号仅供历史追溯，不作为新的实施任务。

> 状态：1.0 设计背景；领域门面与采样新契约已进入当前源码。原批次、文件数和待办保留为设计时快照，不表示仍待实现，也不表示每个条目均在本次重新验收。
> 原目标版本：从 0.2.0 收敛到 1.0.0。当前用法见 [迁移指南](../../docs/guide/migration-1.0.md) 与 [API 文档](../../docs/api/viewer.md)。
> 目的：在宣发前一次性收敛公开 API 形状，之后长期不再破坏式变更

本方案面向「API 稳定版」这一次性窗口。0.x 期间积累的形状问题若不在此时清理，等示例、文档、Sandcastle 和用户代码扩散后，改动成本会高一个量级（AGENTS.md「公开 API 方向」已写明这条原则）。

## 配置分组的历史教训

早期 `ViewerOptions.scene` 把 atmosphere、clouds、surface 等配置拍平，随后这些前缀字段扩散到类型、运行时控制、默认值解析、渲染适配、widgets、examples 和文档。同一个配置复制到多个调用点后，局部命名调整就变成跨层迁移；因此分组要先表达领域边界，再增加参数，并保持初始化与运行时同构。

这一经验原记录于 `notes/坑点记录/设计缺陷导致的坑.md`，2026-09-06 合并到此处，删除重复文件。原文的 `scene.postProcess` 已由 1.0 顶层 `postProcess` 取代；“快速迭代期无兼容负担”只是当时选择破坏式迁移的前提，不能作为以后任意破坏稳定 API 的授权。项目要求在 `AGENTS.md` 维护，本文保留理由。

## 判断基线

本方案只收录满足以下任一条件的项：

1. **公开契约错误**：文档承诺与实际行为不符，或内部实现意外暴露在公开面。
2. **形状分裂**：同一领域概念存在两套及以上不兼容的表达方式。
3. **同构缺失**：初始化配置路径与运行时控制路径不一致（AGENTS.md 明确要求同构）。

只是「不够优雅」但语义自洽、且改动会牵动大量调用点的项，一律进「明确不改」一节并写明理由。

## 影响面基线

统计口径：`src/`、`examples/`、`docs/`、`README*.md`，排除 `examples/public/`、`examples/dist-ghpages/` 等构建产物。

| API | 真实引用文件数 |
| --- | --- |
| `CartographicInput` 系列类型 | 21 |
| `scene.postProcess.*` 公开路径（B8） | 20 |
| `toneMappingExposure` | 19 |
| `load3DTileset` | 18 |
| `sampleHeightMostDetailed` | 17 |
| `viewer.highlight` / `scene.highlight`（B9） | 16 |
| `camera.flyTo` | 12 |
| `outlineWidth` | 12 |
| `viewer.layers`（B3 更名 `viewer.overlays`） | 12 |
| `setTerrain` | 11 |
| `flyToTarget` | 11 |
| `threeScene` / `threeCamera` | 11 |
| `addModel` | 9 |
| `fillColor` | 6 |
| `showPickMarker` | 6 |
| `addHismLayer` / `getHismRuntimeStats` | 5 |
| `remove3DTileset` / `dracoDecoderPath` | 4 |
| `get3DTileset` / `getHismLayer` / `removeHismLayer` / `viewer.tileset` / `settingPanel` | 3 |
| `viewer.renderer` / `resolutionScale` / `rendererType` | 各 1～5 |
| `layers.getAll` | 1 |

两点口径说明：`scene.postProcess.*` 与 `toneMappingExposure` 两行存在重叠，后者是前者的子项，合计去重后约 20 个文件；`scene.postProcess.*` 只计经公开路径的引用，`src/rendering/` 下的实现类不计入。

结论：全部改动的总影响面在百余个文件量级且高度集中在 `docs/` 与 `examples/`，一次性改完可行，不需要分版本渐进。

---

## 批次 A：公开契约修正

优先级最高，风险最低，可独立先行落地。

### A1 三处默认值文档与实现不符

`src/types/scene.ts` 的 JSDoc 与 `src/ViewerOptionsResolver.ts` 的实际取值不一致：

| 字段 | 文档声称 | 实际默认 | 位置 |
| --- | --- | --- | --- |
| `atmosphere.lighting.mode` | `light-source` | `post-process` | `scene.ts:176` / `ViewerOptionsResolver.ts:43` |
| `atmosphere.night.enabled` | `true` | `false` | `scene.ts:231` / `ViewerOptionsResolver.ts:64` |
| `postProcess.toneMappingExposure` | `10` | `5` | `scene.ts:542` / `ViewerOptionsResolver.ts:176` |

第一条影响最大：`mode` 会经 `resolveSurfaceMaterialMode` / `resolveSceneContentMaterialMode` / `resolveModelMaterialMode` 连带决定地表、场景 tileset 和模型的材质模式，用户照文档理解会得到完全不同的画面。

**处置**：以 resolver 的实际值为准修正 JSDoc。不要反过来改 resolver 默认值——那会静默改变所有现有场景的观感。

### A2 内部实现收口

以下成员命名或职责都表明是内部实现，但当前是公开可访问的。稳定版之后再收就是破坏式变更，必须现在处理：

- `Entity.pointGraphicImpl` / `symbolGraphicImpl` / `polylineGraphicImpl`（`src/entities/Entity.ts:249/269/277`）——名字带 `Impl` 的 public getter
- `EntityManager.syncResolution`（`src/entities/EntityManager.ts:114`）——渲染生命周期方法
- `HighlightManager.syncStyleFromSettings` / `update` / `outlineEffect`
- `Scene.syncRuntimeEffects` / `Scene.updateFallbackAmbientLight`
- 各 `src/scene/*Settings.ts` 上的 `apply()`

**处置前先纠正一个前提**：原方案写的是「不在 `.d.ts` 公开路径导出 + `@internal` 标记」，这个思路对这批成员**不成立**。`Entity` 类本身从 barrel 导出，它的 `pointGraphicImpl` 等是 public getter（`Entity.ts:249`、`:269`、`:277`），必然出现在 `dist/index.d.ts` 里——**「没从 barrel 单独导出」不等于成员不在公开契约中**，导出类的每个 public 成员都是契约的一部分。

更要命的是 `@internal` 当前**完全不生效**：`.d.ts` 由 `tsc -p tsconfig.types.json` 生成（`package.json:28`），而该配置只有 `declaration` / `declarationMap` / `emitDeclarationOnly` / `outDir` / `noEmit`，**没有开 `stripInternal`**。照原方案打完标记，`.d.ts` 一个字都不会少。

**处置：按可达性分三档，优先级从高到低。**

1. **真正私有** → `#private`。JS 硬私有，`.d.ts` 里只留占位符，运行时也访问不到。
2. **仅包内使用但必须跨类访问** → 改掉可达性本身，而不是给它贴标签。这批成员正属此类：JSDoc 已写明 `pointGraphicImpl` / `polylineGraphicImpl` 供 `EntityPicker` 拾取、`symbolGraphicImpl` 供 `EntityManager` 同步 resolution。可选手法两种——构造期注入回调（原方案方向，适合 Viewer 侧的 `syncRuntimeEffects` 等），或 **WeakMap 侧表**：`LayerManager` 已有现成先例，`imageryLayerOwners` 把 owner 引用移出类体（`LayerManager.ts:58`、`:86`、`:101`、`:114`），跨类可访问而公开面上不存在。
3. **确实只能靠标记** → 才用 `@internal`，且**必须同时在 `tsconfig.types.json` 开启 `stripInternal`，并对产物 `.d.ts` 做断言**（见验收标准）。注意 `stripInternal` 只移除类型声明，运行时成员仍在——它给的是类型层面的收口，不是真正的封装，因此排在第三档。

优先走前两档的理由：它们让成员在**产物中确实不存在**，不依赖任何编译选项是否配对；第三档一旦有人改动构建配置就会静默失效，而这类失效不会有任何报错。

**注意本条本身是破坏式的**，与批次 A 其余三条性质不同：移除一个当前可访问的成员，无论它的命名多像内部实现，对已经用上它的用户都是编译期报错。因此 A2 不能随 0.2.x 发布，必须落在 1.0.0（执行顺序一节已按此拆分）。若希望给早期用户预留缓冲，可在 0.2.x 先加 `@internal` + `@deprecated` 标记做预告，实际移除仍留到 1.0.0。

### A3 包入口导出清单对齐

`src/Viewer.ts` re-export 了但 `src/index.ts` 漏掉的公开类型：

- `ViewerPickOptions` / `ViewerPickResult` / `ViewerPickLayer`——`viewer.pick()` 是主力 API，用户无法为返回值写类型标注
- `ViewerEntityOptions`、`EntityTransparencyMode`、`HeightSamplingSource`、`CartographicHeightTuple`（最后一个在 D1 落地后由 `LonLatHeight` 取代，若 A、D 同版发布则无需补导出）

反向需要判定是否应当公开的：`EntityContext`、`EntityManagerOptions`、`resolveHighlightTarget`。

**处置**：确立单一原则——`src/index.ts` 是唯一公开面，`src/Viewer.ts` 的 re-export 与之逐条对齐；不打算公开的类型从 barrel 移除。补导出本身非破坏式，但清单必须在稳定版前定死。

### A4 原生 renderer 的托管属性契约

Viewer 在原生 renderer 上设置并持续维护若干状态，而这个对象是公开可达的（B5、B7 之后为 `viewer.renderer.raw`）。用户直接在原生对象上修改这些属性不会报错，但会让 Viewer 的下游状态失同步：

| 原生入口 | Viewer 托管入口 | 绕过后果 |
| --- | --- | --- |
| `setPixelRatio()` | `viewer.renderer.resolutionScale` | 符号文字 glyph 不重排、3D Tiles LOD 分辨率不更新 |
| `toneMappingExposure` | `viewer.postProcess.toneMappingExposure`（见 C1、B8） | 实体与高亮颜色的 AgX 反求补偿用旧曝光值计算 |
| `toneMapping` | 无，构造期固定为 AgX（`Viewer.ts:498`） | 同上，`ToneMappingColorResolver` 整体失准 |
| `setSize()` | `viewer.resize()`，另有 ResizeObserver 自动维护 | 相机 aspect 与 tileset 分辨率不同步 |
| `setAnimationLoop()` | `viewer.useDefaultRenderLoop` | 循环状态标记与实际不符，无法再正常开关 |

曝光那条的证据最完整：setter 除了写 three 那一份，还要同步 `colorResolver`、刷新实体颜色、刷新高亮样式（`Viewer.ts:829-838`），而 `colorResolver.resolveColor` 被注入了 `EntityManager` 与 `HighlightManager`（`Viewer.ts:613`、`:721`）。只写原生属性会命中其中一步，其余三步全丢，现象即 `notes/engineering/实体颜色被AgX色调映射压扁坑点.md` 记录的那类偏色。

像素比那条同样无法靠公开 API 绕正确：`ViewportResizeManager.resize()` 用 CSS 尺寸做提前返回判断（`ViewportResizeManager.ts:29-33`），改像素比时 CSS 尺寸未变，`tilesets.resize()` 不会执行；而 `Viewer.resize()` 传给 `syncResolution` 的像素比取自私有的 `currentResolutionScale`，用户无法写入。也就是说用户拼不出等价写法——这正是 `resolutionScale` 必须作为唯一托管入口存在的原因。

**处置**：在 `viewer.renderer.raw` 的 JSDoc 上列出托管清单与对应入口，并在每个托管入口反向标注「不要直接修改原生对象上的对应属性」。`viewer.globe.raw` 同样需要一份（B6 记录的可见性冲突属于同类）。不做运行时强制——Proxy 拦截会给所有正常访问加开销、破坏调试时的对象检视，且 WebGL / WebGPU 两套 renderer 都要各包一份；互操作是 tellux 的明确卖点，为防一类误用而给所有正常用法加负担不划算。

本条不改任何 API 形状，纯补公开契约，可与 A1、A3 一起先行落地；其中入口路径的写法依赖 B5 与 C1，落地时以最终路径为准。

---

## 批次 B：领域门面统一

本批次是本次变更的核心，也是新用户写下的第一行代码。

### B1 现状：五个领域五种入口模式

| 领域 | 入口 | 动词 | 管理器 |
| --- | --- | --- | --- |
| 影像 | `viewer.layers.add/get/remove/getAll` | add | 有 |
| HISM | `viewer.hism.add/get/remove/list` 且 `viewer.addHismLayer/getHismLayer/removeHismLayer/getHismRuntimeStats` | add | 有，顶层完整重复一套 |
| 3D Tiles | `viewer.load3DTileset/get3DTileset/remove3DTileset` | load | 无（`TilesetManager` 私有） |
| 模型 | `viewer.addModel` | add | 无，且缺 get/remove |
| 地形 | `viewer.setTerrain` | set | 无 |

三种动词、三种前缀风格、两种列表命名（`getAll` 与 `list`）。另有一处返回类型不对称：`load3DTileset` 返回 `TilesetLayer`（`src/tiles/TilesetManager.ts:209-236`），`get3DTileset` 返回底层 `TilesRenderer | null`（`:239-241`）——同一个 id 拿到两种不同的东西。

### B2 目标形状

集合型资源统一为 `viewer.<领域>.add / get / remove / list`：

```ts
viewer.overlays.add(options)    // 表面叠加图层，已有能力，仅更名（见 B3 末）
viewer.tilesets.add(options)    // 3D Tiles，新增门面
viewer.models.add(options)      // 模型，新增门面
viewer.hism.add(options)        // HISM，已有
```

单例型资源落在同一套 `viewer.<领域>` 路径下，但用 `set` / `clear` 而非集合动词：

```ts
viewer.terrain.set(terrainOptions)   // 切换地形
viewer.terrain.clear()               // 移除地形
viewer.terrain.current               // 读取当前地形配置
```

理由：地形在 Viewer 中本就是单例，套 `add/get/remove/list` 属于强行对齐；`set` / `clear` 与集合动词的差异本身就传达了「地形只有一份」这个事实，是有信息量的区别，不是不一致。

这里曾考虑过更激进的属性赋值形式（`viewer.terrain = options | null`），最终否掉，原因有三：

1. 副作用与语法分量不匹配。一条赋值语句会触发地形 tileset 重建、高度采样瓦片池作废和 `heightSampler` 重置（`Viewer.setTerrain` → `TilesetManager.setTerrain` → `invalidateHeightSamplingTilesetPool`），赋值语句看起来太轻。
2. 没有扩展位。未来若要支持「切换地形时保留高度采样缓存」之类的选项，属性赋值无处安放第二参数。
3. 读写类型对不齐。setter 需接受 `null`，而内部 `currentTerrain` 存的是 `TerrainOptions | undefined`。

属性形式唯一的优势是「初始化与运行时类型完全相同」，但项目已有 `viewer.layers` 的先例——`ViewerOptions.layers` 传 `ImageryLayerOptions[]`，运行时给的是 `LayerManager`。AGENTS.md 要求的是路径同构（`options.terrain` ↔ `viewer.terrain`），不是类型相同，门面形式并不违反原则。

读取入口可直接复用现有实现：`TilesetManager` 已保存配置并有 `get terrainOptions()`（`src/tiles/TilesetManager.ts:139-141`），当前只是没有暴露到公开面。

### B3 逐项迁移对照

| 旧写法 | 新写法 | 影响文件 |
| --- | --- | --- |
| `viewer.load3DTileset(o)` | `viewer.tilesets.add(o)` | 18 |
| `viewer.get3DTileset(id)` | `viewer.tilesets.get(id)`，返回 `TilesetLayer \| null` | 3 |
| `viewer.remove3DTileset(id)` | `viewer.tilesets.remove(id)` | 4 |
| `viewer.addModel(o)` | `viewer.models.add(o)` | 9 |
| （无） | `viewer.models.get(id)` / `remove(id)` / `list()` 新增 | — |
| `viewer.addHismLayer(o)` | `viewer.hism.add(o)` | 5 |
| `viewer.getHismLayer(id)` | `viewer.hism.get(id)` | 3 |
| `viewer.removeHismLayer(id)` | `viewer.hism.remove(id)` | 3 |
| `viewer.getHismRuntimeStats()` | `viewer.hism.getRuntimeStats()` | 5 |
| `viewer.layers.*` | `viewer.overlays.*`（含 `getAll()` → `list()`） | 12 |
| `viewer.setTerrain(o)` | `viewer.terrain.set(o)` | 11 |
| `viewer.setTerrain(null)` | `viewer.terrain.clear()` | 11 |
| （无） | `viewer.terrain.current` 新增 | — |
| `viewer.tileset` | `viewer.globe` 门面（见 B6） | 3 |
| `viewer.tileset.group.visible` | `viewer.globe.show` | 1 |
| `viewer.highlight` | `viewer.highlighter`（见 B9） | 16 |
| `viewer.scene.highlight.outline.*` | `viewer.highlighter.outline.*` | 16 |

**`viewer.layers` 更名为 `viewer.overlays` 的理由**：`layers` 在 GIS 语境里默认指「全部图层」，而它实际只管贴到球面的叠加图层——B2 之后旁边就是 `viewer.tilesets`，用户看到 `viewer.layers.list()` 会合理地以为返回所有图层。这与 `viewer.tileset` → `viewer.globe` 是同一类问题：名字覆盖面大于实际职责。

**不改叫 `imagery`**：source 类型有 6 种——`cesium-ion` / `xyz` / `wms` / `wmts` / `geojson` / `mvt`（`types/imagery.ts:103-547`），后两个是矢量数据，栅格化后才贴到表面。`imagery` 装不下它们。`overlays` 覆盖栅格与矢量两类，且与内部 `ImageOverlayPlugin` / `Overlay` 概念同名（`notes/research/3d-tiles-renderer接入边界.md:9`）。

**只改路径名，不改类型名**：`ImageryLayerOptions` / `ImageryLayer` 等保持不变。类型改名会波及 `types/imagery.ts` 整个文件与全部消费点，而收益仅是命名统一——路径是用户每天写的，类型名多数用户只在写标注时接触一次。

**为什么不收进 `viewer.globe`**（曾认真考虑，结论是不收，记录以免重复讨论）：

1. **会把能力边界锁死在路径里。** `ImageOverlayPlugin` 挂在任意 `TilesRenderer` 上，overlay 可贴到「已有 3D tile 几何、地形表面或生成表面」（同上备忘 `:9`）。tellux 目前只贴 terrain / surface 是**当前实现范围，不是能力上限**——给某个场景 3D Tiles 加叠加是插件本就支持的。一旦发布 `viewer.globe.overlays`，这条路会被路径本身否定，将来放开即破坏式变更。
2. **宿主本身就不唯一。** `viewer.tileset` 的 JSDoc 写明「启用地形时返回地形渲染器，否则返回基础裸球渲染器」（`Viewer.ts:363-370`），overlay 的实际宿主随地形开关在两个不同的 `TilesRenderer` 之间切换（备忘 `:196-197`）。挂到一个本身会换底的门面下，是把实现的不确定性搬进 API 路径。
3. **破坏 B2 刚建立的平行结构。** 四个数据领域集合都在顶层，单独降一层要用户记住例外。
4. overlay 物理上确实注册在 globe 的 tileset 上——这是「**物理实现位置不决定 API 归属**」的第四次应用（前三次见 C1、B8、B9）。用户心智里叠加图层是**内容**，globe 是**承载表面**。

`viewer.tileset` 要动的理由：它返回的是地形/裸球 renderer（`src/Viewer.ts:370-371`），与 `load3DTileset` 加载的场景 tileset 完全不是一回事，而新增 `viewer.tilesets` 后两者只差一个复数 s，是明确的误读陷阱。`globe` 准确表达「地球表面」这个领域概念——但仅当它是门面时才名副其实，直接返回原生 `TilesRenderer` 属于名实不符，详见 B6。

### B4 实现要点

- `TilesetManager` 同时管理地形、裸球、场景 tileset 和影像 overlay，不能整体暴露。需新建窄门面（如 `SceneTilesetCollection`）只转发场景 3D Tiles 的 CRUD，`viewer.tilesets` 返回它。
- `Viewer.wrapTilesetLayer`（`src/Viewer.ts:1352`）里对 `show` setter 和 `remove` 的采样取消包装逻辑，随门面一起下沉。
- `ModelManager` 需补 `get(id)` / `remove(id)` / `list()`，并为 `ModelLayer` 补 `id` 注册表。
- `viewer.terrain` 门面同样是窄转发层：`set` 保留 `Viewer.setTerrain` 现有的 `heightSampler.resetForTerrainChange()` 副作用，`current` 转发 `TilesetManager.terrainOptions`。`setTerrain` 当前返回 `this` 用于链式，改为门面后 `set` 返回 `void`——已核实 `examples/` 与 `docs/` 中 6 处调用全部是独立语句，无链式依赖。
- 顶层拍平方法全部删除，不保留别名。稳定版是唯一能干净删除的窗口，留别名等于把两套 API 一起带进 1.0。

### B5 `viewer.renderer` 门面化

三个最核心的对象里，只有 renderer 是把原生 Three.js 对象直接挂在公开面上的：

| 公开路径 | 是什么 | 原生对象位置 |
| --- | --- | --- |
| `viewer.scene` | tellux `Scene` 门面 | `viewer.scene.threeScene` |
| `viewer.camera` | tellux `Camera` 门面 | `viewer.camera.threeCamera` |
| `viewer.renderer` | 原生 renderer 本身（`Viewer.ts:325`） | 就是它 |

这个不一致直接暴露给用户，`examples/gaussian-splat-3d-tiles.ts:130` 一行里同时出现两种风格：`setResolutionFromRenderer(viewer.camera.threeCamera, viewer.renderer)`——左边要走 `.threeCamera`，右边直接就是原生对象。

三条改动理由：

1. **把 Three.js 最不稳定的部分放在了公开面最显眼处。** `viewer.renderer` 的类型是 `TelluxRenderer = ThreeRendererWithEffects | WebGPURenderer`（`RendererAdapter.ts:6-8`），three 升级时这两侧的 API 变化直接成为 tellux 的破坏式变更，中间没有可做兼容的位置。`PerspectiveCamera` 与 `Scene` 多年稳定，`WebGPURenderer` 与 TSL 体系仍在快速演进。
2. **裸暴露并没有换来便利。** `TelluxRenderer` 是联合类型，用户只能用两侧的交集，要用某一后端的特有能力必须先判别后端——`examples/water-area/createWaterAreaDemo.ts:77` 就是先检查 `viewer.rendererType` 再决定能否继续。既然本来就要分支，省掉的那层路径没有意义。从 examples 看，用户拿 `viewer.renderer` 全部是**传引用给第三方库**（`examples/gaussian-splat-3d-tiles.ts:130` 的 `setResolutionFromRenderer`、`:134` 的 `GaussianSplatPlugin({ renderer })`），不是调方法改状态，多一层路径成本接近零。
3. **顶层 `renderer` + `rendererType` 正是 AGENTS.md 点名的信号**——「同一前缀字段出现第二个时，优先抽出分组对象，而不是继续命名补丁」。

**目标形状**：

```ts
viewer.renderer.type              // 'webgl' | 'webgpu'，取代顶层 viewer.rendererType
viewer.renderer.resolutionScale   // 取代顶层 viewer.resolutionScale
viewer.renderer.raw               // 原生 renderer，明确的逃生舱（命名规则见 B7）
```

初始化侧同步收进同一分组，达成完全同构：

```ts
renderer: {
  type?, transparent?, antialias?, samples?, forceWebGL?,
  resolutionScale?                // 从 ViewerOptions 顶层移入
}
```

`forceWebGL` 保持原样透传，不改名也不做类型收窄：渲染器类型由 `type` 区分，它只是 `WebGPURenderer` 构造参数的直通（`RendererAdapter.ts:109`），不构成第二套后端选择机制。

**但 JSDoc 需要补一句能力集说明**：`type:'webgpu' + forceWebGL:true` 与 `type:'webgl'` 虽然都跑在 WebGL2 上，前者仍是 TSL 管线，`types/viewer.ts:23` 所述 WebGL-only 的大气、云、后处理**依然不可用**——限制来自管线而非底层 API。现有文档（`limitations.md:23`、`docs/api/types.md:385`）只说「走 WebGL2 fallback backend」，容易被理解成能拿回 WebGL 模式的全部功能。这是文档缺口，不是形状问题。

保持在顶层不动的：

- `viewer.ready`：语义是「Viewer 可用」而非「renderer 初始化完成」。今天实现上只等 renderer（`Viewer.ts:494`），但未来若加入地形首次加载之类的异步初始化，顶层 `ready` 仍是正确位置，不必再破坏一次。不在 `viewer.renderer` 上重复暴露。
- `viewer.useDefaultRenderLoop`、`viewer.render()`、`viewer.resize()`：这三个是一组「谁来驱动帧循环」的 Viewer 级控制，JSDoc 本就互相引用，拆开会割裂。判断标准是——描述「渲染器怎么渲染」的进 `renderer` 分组，描述「Viewer 怎么驱动」的留顶层。

**实现要点**：内部 `TelluxRendererAdapter`（`RendererAdapter.ts:10-26`）已具备全部能力（`setPixelRatio` / `getSize` / `setSize` / `setRenderDelegate` / `render` / `setAnimationLoop`），门面主要是把它的一个窄子集提到公开面，改造成本在公开面而不在实现。`resolutionScale` 的 setter 逻辑（`Viewer.ts:814-818`）整体下沉到门面，`viewer.resize()` 的调用关系保持不变。

**破坏面**：`viewer.renderer` → `viewer.renderer.raw` 影响 `examples/gaussian-splat-3d-tiles.ts`（3 处）、`docs/guide/viewer.md`、`docs/api/types.md`、`.agents/skills/tellux/references/core-api.md`（`examples/water-area/createWaterAreaDemo.ts` 只用 `rendererType`，不访问 `viewer.renderer`）；`viewer.rendererType` → `viewer.renderer.type` 影响 1 处（即该文件的 `:77`）；`viewer.resolutionScale` 运行时在 `examples/` 中 0 处，仅 `src/widgets/DebugSettingsPanel/` 内部 3 处与 skill references 1 处。

**关于 Cesium 对齐**：Cesium 把 `resolutionScale` 和 `useDefaultRenderLoop` 都放在 `Viewer` 顶层。本项目此处不跟随——Cesium 的 Viewer 顶层堆积了大量本该分组的属性，跟随它会把同样的问题带进 1.0。领域边界清晰优先于逐字对齐。

### B6 `viewer.globe` 门面化

`viewer.tileset` 返回 `activeTerrainTileset ?? activeSurfaceTileset`（`TilesetManager.ts:127-129`），两者都由 `new TilesRenderer()` 直接创建（`SurfaceTilesetFactory.ts:55`、`TerrainTilesetFactory.ts:93-103`），tellux 只是在原生实例上注册插件（`TilesetManager.ts:420-426`）。也就是说它和 B5 处理的 `viewer.renderer` 性质完全相同——第三方库 `new` 出来的原生实例裸挂在公开面上，只不过来自 3d-tiles-renderer 而非 three。

B3 原本只打算把它改名为 `viewer.globe`。但**领域名字返回原生实现对象**是名实不符，与 D4 否决「`sampleHeightMostDetailed` 返回 `LonLatHeight`」用的是同一条判据。只有两种自洽写法：保持裸露就该叫 `globeTileset`，或者做成门面让 `globe` 名副其实。选后者。

除了名实一致，还有两点：

1. **消除穿透三层的写法。** `examples/google-photorealistic-3d-tiles.ts:64` 现在写的是 `viewer.tileset.group.visible = false`——先拿 TilesRenderer，再拿它的 three group，再改 visible。用户要写出这行得同时了解 tellux、3d-tiles-renderer 和 three 三层结构。
2. **修一个真实的状态缺陷。** 可见性设在当前活跃实例上，而切换地形会创建新的 `TilesRenderer`，用户设过的值随旧实例丢失；同时 tellux 自己也在写这个字段（`TilesetManager.syncSurfaceVisibility`，`:496-498`），两者会互相覆盖。门面把状态存在自己身上、切换地形时重新施加，可以跨实例保持。这与 A4 记录的托管属性冲突是同一类问题，只是承载对象换成了 `TilesRenderer`。

**目标形状**：

```ts
viewer.globe.show        // 取代 viewer.tileset.group.visible，跨地形切换保持
viewer.globe.ellipsoid   // 椭球，内部大量使用但目前无公开路径
viewer.globe.raw         // 原生 TilesRenderer，逃生舱
```

`ellipsoid` 值得单独补：内部到处在用 `tilesets.tileset.ellipsoid` 做坐标换算，用户要做同样的事目前只能绕实现路径拿。

**实现要点**：门面是窄转发层，读取侧直接复用 `TilesetManager` 已有的 `tileset` / `surfaceTileset` / `terrainTileset` getter（`:127-137`）。`show` 需要在门面上持有用户意图，并在 `setTerrain` 重建 tileset 后重新施加；同时要与 `syncSurfaceVisibility`（`:496-498`）协调——后者表达的是「地形存在时隐藏裸球」这个内部规则，与用户的显隐意图是两个维度，最终可见性应由两者共同决定，而不是互相覆盖。

**破坏面**：`viewer.tileset` 在用户侧只有 2 处真实代码（`examples/google-photorealistic-3d-tiles.ts`、`examples/water-area/createWaterAreaDemo.ts`）加 2 处文档列举（`docs/guide/viewer.md`、`.agents/skills/tellux/references/core-api.md`）。改动收益主要不在省代码，而在于让 B5 确立的原则没有例外。

### B7 原生底层对象出口统一为 `.raw`

B5、B6 落地后，四个领域门面都需要一个通往原生对象的出口。现有两个叫 `threeScene` 和 `threeCamera`，如果跟随这个规则新增 `threeRenderer`，会保留一个真实问题：**`threeXxx` 不是一条规则，而是每次都要重新拼一个名字**。将来任何新领域开原生出口都得再造一个词。

同时 `viewer.scene.threeScene` 里 "scene" 出现了两次——后缀重复的是父路径已经给出的信息。

按库命名（`.three` / `.tiles`）曾是候选，但它犯的是同一个错，只是从「每个领域拼一个」变成「每个底层库拼一个」。`viewer.globe` 一出现就暴露了这点：tellux 的底层不止 three，还有 3d-tiles-renderer，将来可能更多。

**确立的规则**：出口名的职责只是标记「越过这条线是原生对象」，至于是哪个库的对象，由领域路径和类型系统回答。

```ts
viewer.scene.raw      // THREE.Scene
viewer.camera.raw     // THREE.PerspectiveCamera
viewer.renderer.raw   // WebGLRenderer | WebGPURenderer
viewer.globe.raw      // TilesRenderer
```

同一个词在不同领域给出不同库的对象是正确的分工——「哪个库」是领域自身的属性，不该由出口名重复表达。这是 B7 开头那条「后缀不该重复父路径信息」的延伸：`.three` 重复的是「底层是什么库」这个本可由领域推出的信息。用户也不缺类型信息，IDE 悬停会直接显示具体类型。

**候选对比**（记录以避免重复讨论）：

- `.three` / `.tiles`（按库命名）：把领域信息编进出口名，规则无法泛化，多一个底层库就多一个词。
- `.native`：Web 语境中通常指浏览器原生（DOM、Web API），有误导风险。
- `.source`：与 E2 确立的数据源判别字段冲突。
- `.impl`：与 A2 正在收口的「内部实现不该公开」标记语义相反，此处是有意公开的逃生舱。
- `.unwrap()`：表意准确，但互操作场景常在循环里连续取用，方法调用比属性访问重。
- 保留 `threeXxx`：唯一优势是零额外破坏，但该优势仅在放弃统一的前提下成立，而放弃即意味着带进 1.0 永久保留。

已确认 `raw` 在公开面未被占用，`src/` 中只出现在局部变量与 `HighlightManager` 的内部判别联合里。

**破坏面**：用户侧 11 个文件约 28 处——`examples/` 6 个（`gaussian-splat-3d-tiles.ts` 6 处、`vegetation.ts` 与 `hism-compare.ts` 各 3 处、`instanced-horses.ts` / `fly-to.ts` / `mixed-height-sampling-horses.ts` 各 2 处），`docs/` 3 个（`design/rendering-pipeline.md`、`guide/coordinate-system.md`、`guide/camera.md`），skill references 2 个。`src/` 内部约 60 处（`Viewer.ts` 36、`Camera.ts` 12 为主）属机械替换。

量级与批次 B 其他项相当，且 `examples/` 与 `docs/` 本就要整体扫一遍，不增加实质成本。

**附带收益**：`raw` 本身带着「未经处理、后果自负」的语气，与 A4 的托管属性契约一致。用户写下 `viewer.renderer.raw.setPixelRatio(2)` 时，那个 `raw` 就在提示他正在绕过托管层；`.three` 只是中性地说明类型，没有这层提示。

### B8 `postProcess` 从 `scene` 提升为顶层领域

当前后处理挂在 `scene.postProcess` 下（`scene.ts:104`），含 `bloom`、`lensFlare`、`smaa`、`taa`、`dithering`、`autoExposure`、`toneMappingExposure` 七项（`PostProcessSettings.ts:234-251`、`scene.ts:503-544`）。

**问题是它既不属于 `scene`，也不属于 `renderer`。** 现有顶层领域各自回答一个问题：`scene` 是「世界本身是什么样」，`camera` 是「从哪看」，`renderer` 是「用什么后端、画多大」，`globe` 是「地球本体」，`clock` 是「什么时刻」。而后处理回答的是「画完之后对这张图做什么加工」——bloom 不是世界的组成部分，也不是后端能力。它是渲染流程里的独立阶段，独立成顶层领域是正名，不是新增概念。

**曾用于支持「放 scene」的论据不成立**：早期理由是 `autoExposure` 由太阳高度和夜因子驱动（`scene.ts:536-541`），所以属于场景领域。但 bloom 阈值同样依赖场景亮度，所有后处理的输入都是场景渲染出的图像——这条论据证明太多，等于没有证明。它与 C1 已确立的「物理写入位置不决定 API 归属」是同一类错误：**实现依赖场景状态，不等于领域归属于场景**。

**也不能按「画质 vs 观感」拆开。** 曾考虑把 `smaa` / `taa` / `dithering` 划为画质项移入 `renderer`，只留观感项在 scene。该方案否决：它切开了「后处理」这个用户心智中完整的概念，制造出的割裂不比现状小。

**目标形状**：

```ts
viewer.postProcess.bloom / .lensFlare
viewer.postProcess.smaa / .taa / .dithering
viewer.postProcess.autoExposure
viewer.postProcess.toneMappingExposure   // C1 的落点
```

初始化侧同步提升到 `ViewerOptions.postProcess`，与运行时同构。`scene` 由此只保留描述世界本身的项——`atmosphere` / `clouds` / `surface`（`scene.highlight` 另行迁出，见 B9）。

`scene.highlight` **不并入本领域**。它虽由描边后处理实现，但语义是「高亮某个对象」，属于内容交互而非图像加工——这条正好是判据边界：**只对成像结果做加工的进 `postProcess`，改变「画面里有什么」的不进**。它会独立迁往 `viewer.highlighter`（B9），而不是留在 `scene`。

**抗锯齿的割裂是本质的，不做统一。** `renderer.antialias` / `samples` 是硬件 MSAA，在 GPU 光栅化阶段多重采样，且必须在创建 renderer 时决定（`RendererAdapter.ts:45`、`:107-108` 均在构造函数内）；`smaa` / `taa` 是图像空间的后处理 pass，运行时可切。曾考虑合并为 `renderer.antialiasing: { mode }`，否决原因是：用户运行时把 mode 从 `'smaa'` 改成 `'msaa'` 实际需要重建整个 renderer，而 API 表面只是改一个字段——做成对称的样子、底下却不对称，比承认它们是两种机制更糟。**处置改为文档交叉引用**：两边 JSDoc 互相指向，说明一个是硬件层且 init-only、一个是后处理且运行时可切，并写明各自代价（MSAA 吃显存，TAA 有拖影，SMAA 便宜但偏糊）。

**与「暴露完整渲染管线」的区别**：本节只提升 `postProcess` 一个领域，**不**把 `ShadowPass` / `DepthPass` / `OutputPass` 这类执行阶段搬到公开面。那些是 three 与 takram 的内部管线结构，做成公开 API 等于把第三方管线阶段变成 tellux 的稳定契约，与 B5、B6 的取向相反。同理，通用 3D 引擎常把 `Fog` 归入后处理，但 tellux 对应的能力是 `scene.atmosphere` 的空气透视（`scene.ts:151`），属于大气物理而非图像滤镜，不并入本领域。

**破坏面**：用户侧 11 个文件——`examples/` 4 处（`hism/shared.ts:72`、`water-area.ts:50`、`webgpu-basic.ts:39`、`threejs-interop.ts:84`），`docs/` 5 页（`guide/atmosphere-and-effects.md`、`guide/viewer.md`、`guide/lighting.md`、`guide/limitations.md`、`api/types.md`），skill references 2 份（`scene-effects.md`、`core-api.md`）。`src/` 侧约 9 个文件：`types/scene.ts`、`types/viewer.ts`、`scene/SceneOptions.ts`、`Scene.ts`、`Viewer.ts`、`ViewerOptionsResolver.ts`、`widgets/DebugSettingsPanel/` 三个文件与 `test/sceneSettingsNormalization.test.ts`。`src/rendering/` 下的实现类（`PostProcessingManager` 等）不受影响，它们不经公开路径。另需复查 `docs/design/rendering-pipeline.md` 是否描述了公开路径。

#### 自定义后处理效果的演进路径

**1.0 不实现可插拔，但按可插拔来设计形状。**

前提条件已具备：`postprocessing` 是 peerDependency（锁定 `6.39.1`）且构建时保持 external，有 `peerDependencyExternal.test.ts:23` 守护，因此用户 `import { Effect } from 'postprocessing'` 拿到的与 tellux 内部是同一个类实例，不存在双实例导致 `instanceof` 失效的陷阱。WebGL 侧也已有 `EffectPassAdapter` / `ThreeEffectPass` 抽象与动态效果链（`PostProcessingManager.ts:63`、`:176`）。

暂不实现的原因有两条：

1. **两套后端的自定义效果不通用。** WebGL 侧走 pmndrs `postprocessing`，用户写 `Effect` 子类与 GLSL（`PostProcessingManager.ts:2`）；WebGPU 侧走 three 的 TSL node graph，用户写 node 表达式编译成 WGSL（`WebGPUPostProcessingManager.ts:3-4`、`:173`）。两种语言、两套类型。自建抽象层内部翻译成 GLSL 与 TSL 的成本完全不成比例。（Cesium 的 `PostProcessStage` 允许传 GLSL 字符串，那是单后端时代的设计，双后端走不通。）
2. **插入位置会固化为契约。** 链上已有大气、云、点云 EDL、lightingMask、outline、groundClamp、symbolOcclusion 等内置 pass 且顺序严格。一旦这些 pass 名成为用户定位锚点，tellux 将无法再自由重排内部管线——这比 API 形状更难撤销。

**方向上倾向分后端注入口**，而非强行统一成一套跨后端抽象；后者会掩盖上面那条真实的能力差异。但仅止于方向——具体形状留到真要做的时候再定。

**现在要守住的两件事**（都是将来能否顺利扩展的前提）：

1. `postprocessing` 与 takram effects 保持 peer + external，不可回退（已有测试守护）。
2. 内置 pass 的名字与顺序暂不写入面向用户的文档，避免成为隐性契约。

**不预留 `add` / `remove` 这类方法名。** 这两条守的是「不提前固化」——peer 依赖保证用户与 tellux 拿到同一份类，pass 名不入文档保证内部管线仍可自由重排。预留方法名反而是提前固化：分后端的具体形状可能是 `postProcess.webgl.add(effect)`，也可能是 `postProcess.add({ backend, effect })`，今天没有任何信息能判断哪个对，先占住 `add` 等于先押了一次注。

而且预留本身就不必要。D4 已确立「先少后多安全，先多后少破坏」——1.0 没有 `add`，将来加上去是纯新增，不构成破坏式变更。**既然什么都不做也不会破坏，就没有理由现在做。**

### B9 `viewer.highlight` 更名为 `viewer.highlighter`，并收编 `scene.highlight`

当前高亮能力被切在两个对象上：操作入口是 `viewer.highlight`（HighlightManager，`Viewer.ts:404`），样式配置是 `scene.highlight`（HighlightSettings，`Scene.ts:58`）。用户要高亮一个对象用前者，要改描边颜色得去后者——与 C1 的 `toneMappingExposure` 属于同一类跨对象分裂。

**为什么会分成两处**（查证结论，记录以免重复踩坑）：`notes/archive/highlight统一高亮方案.md:7` 明确写着「样式挂在 `scene.highlight`，与现有 Scene 设置同构」，`:44` 进一步说「模式对齐 `PostProcessSettings` / nested Scene settings」。时间线也吻合——`37e5274`（2026-06-23，Scene、大气模块化拆分）先建立了 `src/scene/*Settings.ts` 挂到 Scene 的模式，`3884745`（2026-07-21，新增统一高亮）沿用了它。

所以这不是随手写的，而是**一致性驱动的决策：新能力对齐了当时的既有模式**。问题出在被对齐的基准本身——`PostProcessSettings` 挂在 Scene 上正是 B8 推翻的那个归属。**单点决策没错，是基准错了导致偏差沿着模式复制**。这也正是稳定版窗口必须修基准的理由：不修，之后每新增一个能力都会再复制一遍同样的偏差。

**为什么不并入 `postProcess`**（B8 已给结论，此处补完整依据）：高亮有两条实现路径，**只有一条是后处理**——整对象与 HISM 实例走 `OutlineEffect`（后处理描边），而 3D Tiles feature 走叠加几何，实际是 `this.scene.add(object)` 往场景里加真实 Mesh（`OverlayHighlighter.ts:73`）。并入后 overlay 一侧名不副实。

更关键的是**按实现归类会把这个能力从中间撕开**：用 B8 的判据检验，outline 只加工成像结果应当进入，overlay 改变了「画面里有什么」不应进入——同一个用户能力被判到两个领域，而按能力归类它是完整的。

归谬同样成立：composer 链上还有点云 EDL、lightingMask、groundClamp、symbolOcclusion，若「用后处理实现就归 `postProcess`」成立，这些都要并入，`postProcess` 会退化成按实现手段划分的杂物间。另有目标性差异——`postProcess` 的效果全局且无目标（bloom 作用于整幅图像），高亮永远关联具体目标（`set(target)`）。这是「物理实现位置不决定 API 归属」的第三次应用（前两次见 C1 与 B8）。

**改名理由**：`highlight` 既是名词又是动词，`viewer.highlight(obj)` 看起来完全像合法调用，实际它是对象不是方法，属于真实的误读陷阱。`highlighter` 明确表达「执行高亮的器件」，且与内部已有的 `OutlineHighlighter` / `OverlayHighlighter` / `HismInstanceHighlighter` 命名同族——`viewer.highlighter` 正是这三者的统一门面。顶层已有 `renderer`、`controls` 等执行者名词，不违和。

**目标形状**：

```ts
// 操作（沿用 HighlightManager 现有公开方法）
viewer.highlighter.set(target)
viewer.highlighter.clear()
viewer.highlighter.setHover(target | null)
viewer.highlighter.get() / .getHover()

// 样式（从 scene.highlight 平移，保留 outline / overlay 两组）
viewer.highlighter.outline.enabled / .color / .hiddenColor / .edgeStrength / .xray
viewer.highlighter.overlay.enabled / .color / .opacity / .hoverColor / .hoverOpacity
```

初始化侧对应 `ViewerOptions.highlighter`，从 `scene.highlight` 提升到顶层，路径同构。`set` / `clear` 与 B2 给 `viewer.terrain` 定的动词一致——高亮目标同样是单例，用同一套动词表达同一种「只有一份」的语义。

**不引入 `.config` 中间层**。曾考虑 `viewer.highlighter.config.*` 收纳样式，否决原因有三：`config` 不表达任何领域概念，是信息量最低的容器名，与 AGENTS.md「API 应表达用户理解的领域概念」相悖；方案已确立的风格里没有这层（`postProcess.bloom.intensity`、`renderer.resolutionScale`、`globe.show` 均直接挂）；而现成的 `outline` / `overlay` 分组（`HighlightSettings.ts:140-141`）本身就是领域概念，能传达「描边式与叠加式是两种不同机制」，`config` 会把这个信息抹平。

**破坏面**约 16 个文件：`examples/` 3 个（`3d-tiles-picking.ts`、`threejs-interop.ts`、`hism/hism-forest.ts`），`docs/` 3 页（`guide/highlight.md`、`guide/interaction.md`、`guide/hism.md`），skill references 2 份（`interaction.md`、`core-api.md`），`src/` 侧公开路径 5 个（`Viewer.ts`、`Scene.ts`、`scene/SceneOptions.ts`、`ViewerOptionsResolver.ts`、`types/highlight.ts`）加内部实现 3 个。另需同步 `AGENTS.md` 与 `notes/archive/highlight统一高亮方案.md`——后者是本条的设计来源文档，不同步会继续误导。

`HighlightManager.syncStyleFromSettings` / `update` / `outlineEffect` 按 A2 收口为内部成员，不进入 `viewer.highlighter` 的公开面。

### B10 `viewer.controls` 收窄公开类型

`viewer.controls` 的类型现在是 `TelluxGlobeControls`（`Viewer.ts:378`），而它 `extends BaseGlobeControls`——即上游 `3d-tiles-renderer` 导出的 `GlobeControls`（`TelluxGlobeControls.ts:1`、`:65`）。tellux 只增补了少量行为（如放宽 `maxAltitude`、`useWebGPUCompatiblePivotMaterial`），**绝大多数公开成员来自上游基类**。

**问题不在运行时，在类型层。** 「它是 tellux 自己的子类」不足以构成安全边界：用户写 `viewer.controls.someInheritedMethod()` 能通过编译，说明该成员已经事实上进入了 tellux 的公开契约。上游升级删掉它，用户升级 tellux 后拿到的就是编译错误——对用户而言这就是 tellux 的破坏式变更，与责任归属无关。**在 TypeScript 库里，「公开可访问但不算公共 API」这种约定不成立**，因为编译器不认约定。靠 JSDoc 声明「仅部分继承成员纳入版本承诺」解决不了这个问题。

**处置：收窄公开类型，不做运行时门面。**

```ts
export interface ViewerControls {
  enabled: boolean
  addEventListener(...): void
  removeEventListener(...): void
  // ……其余 tellux 承诺稳定的成员
  readonly raw: TelluxGlobeControls
}

class Viewer {
  readonly controls: ViewerControls   // 实际赋值仍是 new TelluxGlobeControls(...)
}
```

实现继续继承上游，但**公开类型不继承整个上游 API**。TypeScript 的结构类型使 `TelluxGlobeControls` 可直接赋给 `ViewerControls`，**零运行时成本**——不需要 B5、B6 那样的转发层。

**与 B5、B6 的区分**（这条决定了何时该用哪种手法）：`renderer` 与 `globe` 门面要**新增**成员——`resolutionScale`、`type`、`show` 在原生对象上并不存在，必须有真实的运行时对象承载；而 `controls` 只需要**减少**可见成员，类型收窄即可。**需要增就得建对象，只需要减就只改类型。**

**命名不用 `GlobeControls`。** 上游导出的类正是这个名字，tellux 内部才 alias 为 `BaseGlobeControls`。若 tellux 再导出同名接口，用户同时引入两者会直接冲突，且一个是完整类、一个是收窄视图，同名极易误认。`ViewerControls` 与 `ViewerPickOptions` / `ViewerPickResult` 同族，对应 `viewer.controls` 路径。

**`raw` 在这里的语义与 B5、B6 不同，需在 JSDoc 写明**：`renderer.raw` / `globe.raw` 指向被门面包装的另一个对象，而 `controls.raw` 与 `viewer.controls` 是**同一个对象**，只是换成完整类型视图，运行时 `viewer.controls.raw === viewer.controls` 成立。仍然提供它，一是与 B7 的 `.raw` 契约一致，二是给需要上游高级能力的用户留出路——代价照旧由 `.raw` 这个名字明示。

**成员清单的判定原则**：只纳入 tellux 愿意跨大版本维持的成员，其余一律走 `.raw`。用户侧当前实际用量只有 `examples/index.ts:194`、`:200` 两处 `addEventListener`；候选清单还需覆盖 Viewer 自身依赖的交互开关（如 `enabled`、`enableDamping`、`adjustHeight`）与生命周期方法，具体清单在实现时对照 `TelluxGlobeControls` 与上游基类逐条确定，并纳入 A3 的公开导出清单与验收基线。

**破坏面**：用户侧仅 2 处（均为 `addEventListener`，在收窄清单内，不受影响）。真实成本在确定清单本身——一旦发布，清单外的成员就永久落到 `.raw` 后面。

---

## 批次 C：初始化与运行时同构

AGENTS.md 要求「初始化配置和运行时控制入口应尽量保持同构」，当前有四处违反。

### C1 `toneMappingExposure` 跨对象

初始化在 `scene.postProcess.toneMappingExposure`，运行时却是 `viewer.toneMappingExposure`（`src/Viewer.ts:825-838`）。

**处置**：运行时改为 `viewer.postProcess.toneMappingExposure`，删除 `viewer.toneMappingExposure`。落点随 B8 走——后处理已提升为顶层领域，`autoExposure` 直接驱动这个值（`Viewer.updateAutoExposure`），配置与被控对象应在同一领域。

影响 19 个文件，其中 `src/` 侧多为内部读写 `renderer.toneMappingExposure`，需与公开路径区分开，不要一并改名。

**为什么不进 B5 的 `viewer.renderer` 门面**：这个值最终确实写在原生 renderer 上（A4 把它列为托管属性），但**物理写入位置不决定 API 归属**。判断依据是它和谁一起变化——`autoExposure` 与它同属后处理领域并直接驱动它，曝光变化又要连带刷新实体与高亮的 AgX 反求补偿，整条链路都在后处理内部。B5「保持在顶层不动的」一节给出的那条判据（描述「渲染器怎么渲染」的进 `renderer` 分组），是用来在**顶层与 `renderer` 分组之间**二选一的，不覆盖已经明确归属其他领域对象的项；否则凡是最终落到原生 renderer 上的状态都要往 `renderer` 里塞，`scene` 与 `postProcess` 都会被掏空。

### C2 `scene.entities` 只进不出

`scene.entities.transparency.mode` 可初始化，但运行时完全没有 `viewer.scene.entities`——`EntityRenderManager` 只在构造期接收一次（`src/Viewer.ts:619`）。

**处置**：`Scene` 增加 `entities` 运行时设置对象。若透明模式确实无法热切换，则改为在 JSDoc 明确标注 init-only 并说明原因，不要留一个看起来该有却不存在的路径。

### C3 `hism.showPickMarker` 只进不出

**处置**：`HismManager` 暴露 `showPickMarker` 读写属性，与 `ViewerOptions.hism.showPickMarker` 同构。

### C4 `ViewerOptions.transparent` 与 `renderer.transparent` 重复

顶层 `transparent` 的 JSDoc 已建议改用 `renderer.transparent`（`src/types/viewer.ts:184`），`RendererAdapter` 里做的是二者合并。

**处置**：删除顶层 `transparent`，只保留 `renderer.transparent`。

`transparent` 没有运行时路径是正确的——canvas 的 alpha 在 renderer 构造时确定，`viewer.transparent` 当前也不存在。但 B5 之后 `renderer` 成了完整领域，需要在 JSDoc 明确标注它是 init-only 并说明原因，避免用户按同构直觉去找 `viewer.renderer.transparent`（处置方式与 C2 一致）。

---

## 批次 D：坐标与飞行

### D1 点位类型收敛

当前有五套表达同一件事的类型：

| 类型 | 形状 | 位置 |
| --- | --- | --- |
| `CartographicCoordinates` | `{ latitude, longitude, height }`，高度**必填**，纬度在前 | `spatial.ts:51-58` |
| `CartographicCoordinateTuple` | `[longitude, latitude, height?]`，高度**可选** | `spatial.ts:98` |
| `CartographicHeightTuple` | `[longitude, latitude, height]` | `spatial.ts:105` |
| `CartographicInput` | 上面前两者的联合 | `spatial.ts:119` |
| `CameraFlyToDestination` | `{ latitude, longitude, height? }`，与第一个几乎重复 | `Camera.ts:16-23` |

**真正的问题不是数量，是高度语义在类型层就不自洽。** `CartographicInput` 把「高度必填的对象」和「高度可选的元组」合成同一个联合，用户无法从签名判断高度是否必须给。更严重的是省略高度之后的行为在各 API 完全不同，且都不报错：

| 写法 | API | 实际语义 | 位置 |
| --- | --- | --- | --- |
| `[lon, lat]` | `sampleHeight` | 高度被完全丢弃，射线固定从椭球面起算 | `HeightSampler.ts:466-471` |
| `{ longitude, latitude }` | `camera.flyTo` | 保持起始高度 | `Camera.ts:411` |
| `[lon, lat]` | `models.add` / `hism.add` 的 `coordinates` | 按椭球高 0 处理 | `Viewer.ts:1318-1324` |

同一个 `[lon, lat]` 字面量在三处得到三种结果，其中第三种是静默错误的常见来源——用户以为是贴地，实际是椭球面高度 0。

**处置**：按「高度是否参与语义」拆成两个类型，让类型本身承载这个信息。

```ts
/** 地表平面位置，只有经纬度 */
export interface LonLat {
  readonly longitude: number
  readonly latitude: number
}

/** 完整三维位置，经纬度加椭球高 */
export interface LonLatHeight extends LonLat {
  readonly height: number
}

/** 入参宽化形式，仅用于输入 */
export type LonLatLike =
  | LonLat
  | readonly [longitude: number, latitude: number]

export type LonLatHeightLike =
  | LonLatHeight
  | readonly [longitude: number, latitude: number, height: number]
```

四条规则：

1. **规范形式是对象，元组只作输入宽化。** 所有返回值一律返回对象形式，不返回元组。
2. **不存在「高度可选」的类型。** 元组只有 2 元和 3 元两种形态，`[lon, lat, height?]` 与 `height?: number` 一并取消。
3. **API 选 `LonLatLike` 还是 `LonLatHeightLike`，等于在签名上声明它是否使用高度**，实现层不得再对缺失高度偷偷补 0。
4. **坐标集合入参一律用 `readonly` 数组**（`readonly LonLatLike[]` / `readonly LonLatHeightLike[]`）。单个元组已定义为 `readonly`，集合层再要求可变数组是同一处不一致；且这类 API 都不修改用户传入的数组。可变数组签名会让 `as const` 定义的常量点位数据无法直接传入，逼用户写 `[...points]` 复制一份，纯属无谓开销。**返回值不加 `readonly`**——返回给用户的数据应当可以自由使用，内部若需保留引用应自行复制。

TypeScript 的结构类型保证用户持有的 `LonLatHeight` 或 `LonLatHeight[]` 可直接传给收 `LonLatLike` 的参数，无需转换（D4 的 `treePlacements` 例子即依赖此）。

各 API 的归位：

| API | 新入参 | 依据 |
| --- | --- | --- |
| `sampleHeight` / `sampleHeightMostDetailed` | `LonLatLike` | 高度在实现里被写死 0（`HeightSampler.ts:469`），当前签名接受高度是谎言 |
| `models.add` / `hism.add` 的 `coordinates` | `LonLatHeightLike` | 放置必须有高度；省略后静默变成椭球高 0 是错误来源 |
| `cartographicToVector3` / `cartographicToMatrix4` | `LonLatHeightLike` | 高度直接参与椭球换算（`Viewer.ts:886-893`、`:910-919`） |
| `camera.flyTo` / `setView` 的 `destination` | `CameraDestination = LonLatLike \| LonLatHeightLike` | 省略高度保持当前相机高度，是有意设计的明确语义 |

`CameraDestination` 保留两种形态不违反上面第 2 条：这里是同一个 API 下两种类型对应两种明确行为，而不是同一个类型在不同 API 下语义漂移。JSDoc 需写明「传 `LonLatLike` 形式时保持当前相机高度」。

**实体图形的 `positions` 统一收 `readonly LonLatHeightLike[]`，不按贴地与否区分。** 本方案早期版本曾写「贴地图形收 `LonLatLike`、非贴地收带高度的类型」，该指引不可实施：贴地是同一个类型上的布尔开关 `clamp?: boolean`（`entities.ts:75`、`:135`），`GroundPolylineGraphic` / `GroundPolygonGraphic` 只是内部实现类，公开面上只有一个 `PolylineOptions` / `PolygonOptions`，其 `positions` 类型不可能随 `clamp` 的取值变化。

这不违反上面第 3 条。区别在于忽略高度是**无条件**还是**有条件**的：`sampleHeight` 永远忽略高度，所以签名就不该要求它；而 `clamp: true` 的折线只在开启贴地时忽略，类型层无法表达条件行为（用泛型或重载表达的成本远超收益），只能靠 JSDoc 说明——现有 `clamp` 注释已写明「height is ignored while clamped」，保留并强化即可。

**破坏面**：已核实 `examples/` 与 `docs/` 中没有 `coordinates: [lon, lat]` 这种省略高度的写法（正则检索无命中），现有三元组写法在 `LonLatHeightLike` 下继续有效。真实破坏集中在类型名引用（21 个文件）和采样调用点，不在坐标字面量本身。

**否决的备选**：

- *以元组作规范形式*。把采样高度拼回位置时，元组要处理 `as const`、可变元组推导和 `filter` 的类型守卫；对象字面量没有这些摩擦，且字段名自带经纬顺序说明。
- *保留单一 `CartographicInput` 并让高度可选*。这正是当前三种语义漂移的根源。
- *只把 `CartographicCoordinates` 字段顺序改成经度在前*（本方案上一版的处置）。字段顺序不影响类型行为，解决不了高度语义问题。
**命名理由**：不沿用 `Cartographic*` 前缀。Cesium 的 `Cartographic` 含高度且用弧度，同名不同义比换名更容易误导。`LonLat` 与 `LonLatHeight` 直接把内容写在名字里——前者只有经纬，后者多一个高度，两者的关系从名字就能读出，不需要测绘术语背景；`*Like` 后缀统一表示「入参宽化形式」。本库统一用度而非弧度——Cesium 内部存弧度、`fromDegrees` 收角度，是其新手最高频的错误来源之一，不跟随。

### D2 飞行 options 形状统一

同一个「飞行/定位」领域现有三种 options 形状：

- `camera.flyTo`：`{ destination, orientation, duration, ... }` 嵌套
- `camera.setView`：位置与姿态全部拍平（`src/Camera.ts:66-79`）
- `viewer.flyToTarget`：`FlyToTargetOptions extends FlyToTargetOffset`，把相机相对目标的偏移和动画参数拍在同一层（`src/types/flights.ts:49`）

**处置**：

```ts
camera.setView({ destination, orientation })                 // 与 flyTo 同构
camera.flyTo({ destination, orientation, ...animation })     // 不变
viewer.flyToTarget(target, {
  offset: { heading, pitch, roll, distance },                // 收进 offset
  ...animation
})
```

### D3 `ViewerOptions.camera` 拆分视角与投影

当前把 `latitude/longitude/height/heading/pitch/roll` 与 `fov/near/far` 拍平在同一对象（`src/types/viewer.ts:102-121`），前者是视角状态、后者是投影参数，属于两个领域。

**处置**：

```ts
camera?: {
  destination?: LonLatHeightLike
  orientation?: CameraOrientation
  projection?: CameraProjectionOptions   // { fov?, near?, far? }
}
```

改完后初始化配置与 `camera.setView` 同构。

**`destination` 用 `LonLatHeightLike` 而非 `CameraDestination`。** 后者是 `LonLatLike | LonLatHeightLike` 的联合，其 `LonLatLike` 分支的语义是「保持当前相机高度」——初始化时不存在「当前高度」，该分支在这里无意义，复用会把一个运行时专有的语义带进初始化配置。

**也不为缺失高度补默认值。** 补 0 会把相机放在椭球面上，第一屏基本贴地或入地，是最差的可选值；补一个隐式常量则等于把「用户看到的第一屏」交给一个藏在代码里的数字决定。更重要的是，这会直接违反 D1 规则 3「实现层不得再对缺失高度偷偷补 0」——初始化不该成为该规则的例外。让类型强制给出高度更诚实。

**`destination` 与 `camera` 都是可选的。** 用户只想调投影时应当能写 `camera: { projection: { far: 50_000_000 } }`，不必被迫指定初始位置；`camera` 整体省略时走 Viewer 默认初始视角。约束只有一条：一旦显式提供 `destination`，高度必填。

**实现要点**：`DEFAULT_CAMERA` 当前是扁平结构 `{ latitude, longitude, height: 500, heading, pitch, roll }`（`constants.ts:5-9`），`resolveViewerCameraOptions` 用 `{ ...DEFAULT_CAMERA, ...options }` 浅合并（`ViewerOptionsResolver.ts:31-36`）。拆成嵌套后浅合并会失效——用户只传 `projection` 时会整个覆盖掉默认视角字段。默认值需同步改成嵌套形状，并按 `destination` / `orientation` / `projection` 三组分别合并。

### D4 高度采样 API 形状

当前签名：

```ts
sampleHeight(position: CartographicInput, options?): number | undefined
sampleHeightMostDetailed(
  positions: CartographicCoordinateTuple[],
  options?
): Promise<(CartographicHeightTuple | undefined)[]>
```

三处不一致：入参类型不同（单点收对象或元组，批量只收元组）、返回类型不同（单点给标量，批量给回带坐标的元组）、同步版没有批量形态。

回带坐标是纯冗余：结果元组前两位直接从入参复制（`HeightSampler.ts:757` 与 `:183`），`examples/` 中 5 处调用全部只取 `[2]`，经纬度用回原数组。

**处置**：收成 2×2 的正交形状。

```ts
viewer.sampleHeight(point: LonLatLike, options?): number | undefined
viewer.sampleHeight(points: readonly LonLatLike[], options?): (number | undefined)[]

viewer.sampleHeightMostDetailed(point: LonLatLike, options?): Promise<number | undefined>
viewer.sampleHeightMostDetailed(points: readonly LonLatLike[], options?): Promise<(number | undefined)[]>
```

两个维度各自独立：单点还是批量决定返回标量还是数组，Loaded 还是 MostDetailed 决定是否等待瓦片加载。`undefined` 表示该点未命中，不使用 `NaN` 或哨兵值。

**同步版补批量重载不是语法糖**，它省掉的是真实的每次调用固定开销：`sampleHeightFromLoadedTiles` 每次都重建 tileset 列表（`getHeightSamplingTilesets` 在 `source: 'all'` 下 filter 后展开成新数组，`HeightSampler.ts:545-558`），而 `sampleHeightFromTileset`（`:560-566`）对每个 tileset 都执行一次 `group.updateMatrixWorld(true)` 全树递归加一次矩阵求逆。一批点共享同一组 tileset，这些工作只需做一次；用户手写 `points.map(p => viewer.sampleHeight(p))` 会付 N 倍代价。

实现要点：把 tileset 列表和逆矩阵的准备提到循环外，循环内只更新射线。

**两种批量的收益量级完全不同，必须在 JSDoc 里区分**，否则用户会以为同步批量也会加载数据：

- 同步批量省的是每次调用的固定开销，采样精度完全取决于当前已加载的瓦片，不会为这批点请求任何数据。
- 异步批量省的是**瓦片加载轮次**：整批建立 LoadRegion、配置离屏相机、跨帧等待加载稳定。逐点 `await` 会退化成 N 轮串行加载，慢一到两个数量级。
- 一句话概括：同步批量是「可以不用但用了更好」，异步批量是「不用就是错的」。

**消费侧对照**（以 `examples/hism/hism-forest.ts` 为例）：

```ts
// 现状：入参要先降成二元组，结果要用魔法索引取回，再手写断言
const treeHeights = await viewer.sampleHeightMostDetailed(
  treePlacements.map((p) => [p.longitude, p.latitude]),
  { source: 'all', resolution: 160 }
)
const treeInstances = treePlacements
  .map((placement, index) => {
    const sampled = treeHeights[index]
    if (!sampled) return null
    return {
      coordinates: [placement.longitude, placement.latitude, sampled[2]] as [number, number, number],
      heading: placement.heading
    }
  })
  .filter((item): item is NonNullable<typeof item> => item !== null)

// 目标：原始数据直接作入参（结构上已满足 LonLatLike），高度按标量取回
const treeHeights = await viewer.sampleHeightMostDetailed(treePlacements, {
  source: 'all',
  resolution: 160
})
const treeInstances = treePlacements
  .map((placement, index) => {
    const height = treeHeights[index]
    if (height === undefined) return null
    return {
      coordinates: { longitude: placement.longitude, latitude: placement.latitude, height },
      heading: placement.heading
    }
  })
  .filter((item) => item !== null)
```

早返回已把 `height` 窄化为 `number`，对象字面量类型精确，不需要断言。

影响 17 个文件，调用点需要改的是返回值消费方式（`sampled[2]` → 标量），入参侧多数是放宽。

**否决的备选**：

- *返回 `LonLatHeight` 而非高度标量*（曾设计为 `clampToGround` / `clampToGroundMostDetailed` 一族）。方法名与返回值不符是稳定版最该锁死的一类问题，因为修复手段只有改名，而改名是破坏式的；「返回完整位置」的便利方法则可以在 1.x 增量补充，加方法不破坏任何现有调用。先少后多安全，先多后少破坏。触发补充的条件：重建样板出现在三个以上真实用户场景时，再加语义各自诚实的 `samplePosition` 族。
- *`Float64Array` 高性能通道*。当前示例最大批量在万级，`(number | undefined)[]` 没有实测瓶颈；typed array 也无法表达「未命中」，NaN 哨兵会渗进用户代码。留到有实测需求时再补。
- *保持返回元组回带坐标*（本方案上一版的处置）。坐标是入参的复制，零信息量，还强迫消费侧使用 `[2]` 魔法索引。

---

## 批次 E：命名一致性

### E1 `show` / `visible` / `enabled` 三词统一

确立约定并全面对齐：

- **`show`**：可见性，指「这个东西画不画出来」
- **`enabled`**：功能开关，指「这个能力启不启用」

需要改的：

| 位置 | 现状 | 目标 |
| --- | --- | --- |
| `ImageryLayerOptions.visible`（`imagery.ts:31`） | `visible` | `show`，对齐句柄 `layer.show` |
| `GltfModelOptions.visible`（`models.ts:87`） | `visible` | `show` |
| `atmosphere.fallbackAmbientLight.show`（`scene.ts:349`） | `show` | `enabled`，光源是启用而非可见 |

保持不变的：`atmosphere.show`、`clouds.show`、`sky.stars.show`（可见性）；`night.enabled`、`photometric.enabled`、`bloom.enabled`、`highlighter.outline.enabled`（功能开关，路径按 B9 更新）。

### E2 数据源判别规则统一

确立规则：**带图层级属性（id / show / style）的资源用 `{ source: { type, ... } }` 两层结构；单例资源用顶层 `type`**。

- 影像：已符合。
- 3D Tiles：`Load3DTilesetOptions` 当前把 `id`、数据源字段和 `ThreeDTilesRenderOptions` 全拍平。改为 `{ id?, show?, source: { type, url | assetId | apiToken }, ...renderOptions }`，与影像对齐。
- 地形：单例，保持顶层 `type`，但 **`type` 改为必填**——当前 `UrlTerrainOptions.type?` 可省略，注释明写「兼容旧配置」（`src/types/terrain.ts:104-109`），这个历史包袱应在稳定版清掉。注意文档里已有依赖这个省略行为的写法（`docs/guide/terrain-and-imagery.md:61` 的 `viewer.setTerrain({ url: ... })` 未传 `type`），改动时需一并补齐。
- 令牌命名：天地图用 `token`（`terrain.ts:158`），Cesium Ion 用 `apiToken`。统一为 `apiToken`。

模型的 `AddModelOptions` 目前只有 `type: 'gltf'` 一种来源，是否也包一层 `source` 取决于是否计划扩展模型来源（3DGS、点云模型等）。若近期无扩展计划，保持现状即可，此项标记为可选。

### E3 实体图形字段对齐

| 问题 | 现状 | 目标 |
| --- | --- | --- |
| 主色命名 | `TextOptions.fillColor`，其他图形均为 `color` | 统一为 `color`（影响 6 个文件） |
| 描边模型 | Point/Text 用扁平 `outlineColor` + `outlineWidth`；Polygon 用 `outline: boolean` + 平级 `outlineColor`（`entities.ts:114-126`） | 统一为可选子对象、**存在即开启**：Point/Text `outline?: { color?, width? }`，Polygon `outline?: { color? }`（影响 12 个文件） |
| 透明度 | 只有 Icon / Text 有 `opacity` | 补给 Point / Polyline / Polygon |
| 运行时可写字段 | Graphics 句柄能改的字段远少于 options（如 `PolygonGraphics` 改不了 `outline`/`fill`/`height`） | 补齐高频字段；确实不可变的在 JSDoc 标明 |

**描边不用 `boolean | object` 联合，也不加 `enabled`。** 曾考虑给 Polygon 保留 `outline?: boolean | { color? }` 以兼容旧 shorthand，但 E3 的目标本就是**对齐实体图形字段**，为省一次迁移而留下一个只有 Polygon 有的联合类型，等于把要消除的分裂换了个形式留在原地——union 分支越多，用户越要先判断自己在哪个分支上。破坏式窗口正是清掉它的时机。

`enabled` 同样不加：`outline` 本身可选，缺省即无描边，`enabled` 是重复表达，还会引入 `outline: { enabled: false, color: 'red' }` 这种自相矛盾的合法状态。

**「存在即开启」有一个必须同时满足的前提：所有子字段都要有可见的非零默认值。** 这条对 Polygon 天然成立（只有 `color`），但对 Point/Text 是**行为变更**——现在 `outlineWidth` 默认 `0` 表示不描边（`entities.ts:37-41`），若照搬到 `outline.width`，那么 `outline: { color: 'red' }` 会开启一条零宽的描边，「存在即开启」当场失效，用户拿到的是静默无效果。因此 `outline.width` 必须改为非零默认（建议 `1`），把「开不开」的判断完全交给 `outline` 是否存在，宽度只管粗细。这一条不落实，整个改动就只是换了层嵌套。

**两个类型字段不同不算不齐**：Polygon 描边走 `EdgesGeometry`，WebGL 下线宽恒为 1，给不出 `width` 是能力边界而非疏漏。此处对齐的是**描边的表达形式**（可选对象、存在即开启、颜色同名），不是强求字段集合相同。

代价要如实记：关闭描边只能整体置 `undefined`，「临时关掉再按原样恢复」需用户自存配置。这是放弃 `enabled` 换来的简洁的对价，考虑到实体已有 `show` 承担整体开关、单独临时切描边属低频操作，接受。

尺寸命名的四套词（`pixelSize` / `width` / `scale` / `fontSize`）不强行统一——它们分别是「点直径」「线宽」「图标缩放」「字号」，各自是所在图形的行业标准叫法，统一反而降低可读性。

### E4 `DebugSettingsPanelOptions` 去扁平

`src/types/widgets.ts:9-57` 有 40 余个 `atmosphereInscatterIntensity`、`cloudCoverage` 式的扁平前缀字段，是 AGENTS.md 点名的反模式，且通过 `widgets.settingPanel` 暴露给用户。

**处置**：改为复用 `ViewerSceneOptions` 的嵌套形状。同时字段名 `settingPanel`（单数）与类名 `DebugSettingsPanel`（复数）对齐为 `settingsPanel`。影响 3 个文件。

---

## 明确不改

以下项在评审中被提出，但经判断保持现状，理由记录在此避免反复讨论：

**`useDefaultRenderLoop` 保持在顶层。** 它与 `viewer.render()`、`viewer.resize()` 同属「谁来驱动帧循环」这一组 Viewer 级控制，JSDoc 本就互相引用，收进 `renderer` 分组会把它和配套的两个方法割裂开。判断标准见 B5：描述「渲染器怎么渲染」的进分组，描述「Viewer 怎么驱动」的留顶层。

> 本方案早期版本曾把 `resolutionScale` 一并列为「保持顶层」，理由是「`viewer.renderer` 已是底层 Three.js 对象，运行时无法做成 `viewer.renderer.resolutionScale`」。该理由不成立：门面手法做得到（B2 与 B5 都在用），且 three 原生的 `setPixelRatio` 本就挂在 `viewer.renderer` 上、用户随时能调。结论已翻转，`resolutionScale` 按 B5 收进 `renderer` 分组。

> `viewer.controls` 曾列于此（理由是它是 tellux 自有子类、包门面成本过高）。该处置不成立：靠 JSDoc 声明「部分继承成员不纳入版本承诺」解决不了类型层面的问题——用户能点出来的成员，上游删掉后就是编译错误，对用户而言就是 tellux 的破坏式变更。已改为类型收窄，见 B10。

**`dracoDecoderPath` 保持顶层。** 它同时服务于模型加载和 3D Tiles（`Viewer.ts:575-584` 里 `dracoLoader` 同时传给 `gltfLoader` 和 `TilesetManager`），不归属任何单一领域，是 Viewer 级的解码器配置。

**坐标类型保持 interface，不做成类。** Cesium 的 `Cartographic`、three 的 `Vector3` 都是类，本项目不跟随。

三条依据。其一，**定位不同**：Cesium 是完整 GIS 引擎，用户在其坐标类型上做大量数学运算（`Cartesian3` ↔ `Cartographic` 互转、插值、距离），才需要 `result` 参数复用对象、需要静态方法库；tellux 按 AGENTS.md 是「API 使用侧的易用性封装」，坐标运算发生在内部且用 three 的 `Vector3` / `Matrix4`，`cartographicToVector3` 就是「要算就转成 three 类型」的桥，用户侧主要是传入与读取位置。

其二，**与现有设计一致**：`index.ts` 已导出大量类（`Viewer` / `Scene` / `Camera` / `Clock` / `Entity` / `LayerManager` 等，`index.ts:44-82`），但它们全是门面、管理器与句柄——有身份、有生命周期、有方法；坐标是纯数据。「门面用类、数据用接口」本身是自洽的划分。

其三也是决定性的，**类的核心价值与 D1 的不可变设计冲突**：类真正的收益是「可变 + `result` 复用」，而 `LonLat` / `LonLatHeight` 的字段已定为 `readonly`。不可变的类等于只多挂了几个方法的接口，放弃主要收益却要付全部成本；若为拿回收益改成可变，又会引入别名 bug——用户拿到返回的坐标顺手修改，影响引擎内部状态。

**要付的成本**（若改成类）：`{ longitude: 116, latitude: 39, height: 0 }` 与 `[116, 39, 0]` 是 GIS 用户最自然的写法，`new LonLatHeight(...)` 会让全部示例与文档变长；GeoJSON、后端接口、CSV 解析出的都是 plain object 与数组，需多一道 hydrate；D1 依赖的结构类型零摩擦（`LonLatHeight` 直接传给收 `LonLatLike` 的参数）会消失；`JSON.stringify` 后 parse 回来拿不到实例。

**接受的代价**：没有构造期校验，经度传 200 不报错（改为在 API 入口校验）；高频批量场景无法复用对象（D4 的批量重载已解决主要性能瓶颈，剩余仅对象分配，量级小得多）。

**将来的增量路径**：需要工具方法时，用 TypeScript declaration merging 让 `LonLatHeight` 同时是接口与同名常量（`LonLatHeight.equals(a, b)` / `.fromArray()` / `.normalize()`），数据仍是 plain object，字面量与 JSON 互操作全部保留。这属于非破坏式新增，符合 D4 已确立的「先少后多安全，先多后少破坏」，1.0 不做。

**`Clock` 不补 `startTime` / `stopTime` / `clockRange`。** 当前 Clock 是驱动太阳、月亮和大气方向的精简模拟时钟，时间范围属于 Timeline 控件的关注点，放在 `TimelineOptions` 是正确的分层。为对齐 Cesium 而硬补会把控件概念挤进核心时钟。

**事件面暂不扩充。** 只有 `click` / `mousemove` 覆盖偏窄，但形状没有问题，后续增加事件类型是非破坏式变更，不占用本次窗口。

**`ViewerMouseEvent` 的 `pick` 与 `picks` 并存保留。** `pick` 是 `picks[0] ?? null` 的便利字段，重复但有实际价值。

**实体尺寸字段不统一命名。** 见 E3 末段。

---

## 执行顺序

1. **批次 A**：契约修正与内部收口。其中 A1（改 JSDoc）、A3（补导出）、A4（补契约文档）不破坏任何调用点，可独立发一个 0.2.x 先行落地；**A2 是破坏式的**（移除公开可访问成员），必须留到 1.0.0 一起发。
2. **批次 B**：领域门面统一。改动最集中，先做完 `src/` 侧全部门面（含 B5 的 `viewer.renderer` 与 B8 的 `viewer.postProcess` 提升），再一次性扫 `examples/` 与 `docs/`。B8 与 C1 落在同一批文件上，实现时应合并处理。
3. **批次 C**：同构补齐。依赖 B 完成后的领域对象边界。
4. **批次 D**：坐标与飞行。与 C 无耦合，但 D1 会改 `models.add` / `hism.add` 的 `coordinates` 类型，与 B 落在同一批文件上，排在 B 之后做可以少扫一遍 `examples/`。
5. **批次 E**：命名一致性。放最后，避免与前面批次在同一批文件上反复冲突。

每批次完成后运行 `pnpm type-check`；B 与 E 涉及导出面变化，额外运行 `pnpm build` 确认 `.d.ts` 产物正确。

## 验收标准

本次窗口关闭后就不再破坏式变更，因此需要一个明确的「改完了」判据，而不是逐条打勾了事。

### 冻结最终公开 API 清单

全部批次落地后，从 `src/index.ts` 生成一份完整的公开导出清单（类型 + 值），作为 1.0.0 的契约基线存档。这份清单是验收依据：任何不在清单上的导出都不该存在，任何该在清单上却缺失的都是 A3 没做干净。

清单需要有测试守护，否则会在后续迭代里悄悄漂移。项目已有现成手法——`src/test/entityPublicContract.test.ts` 用 `Assert<Equal<...>>` 在编译期锁定实体 options 的形状，`bundleSizeBudget.test.ts`、`peerDependencyExternal.test.ts` 也是同类守护测试。按同样方式补一个公开面契约测试即可，重点锁定本次收敛的成果：`LonLat` / `LonLatHeight` 的字段与只读性、`LonLatLike` 不含 `height`、四个门面的路径与 `.raw` 出口、顶层 `postProcess` 领域的字段清单、采样四个重载的返回类型。

### 产物层 API 面检查

上一节的清单与契约测试都建立在 `src/index.ts` 上，而**消费者实际看到的是 `dist/*.d.ts` 加 `package.json` 的 `exports`**，两者不等价，缺口有三处：

1. **导出类的 public 成员会全量进入 `.d.ts`**，不受 barrel 导出清单约束——A2 那批 `Impl` getter 就是例子。只核对 barrel 清单，这类成员一个也查不出来。
2. **`@internal` 是否真被 strip 取决于构建配置**，而 `tsconfig.types.json` 当前没开 `stripInternal`（见 A2）。标记与配置分处两个文件，天然容易脱钩。
3. **`exports` 映射本身也是契约**：`.` 与 `./assets` 两个入口及其 `types` 指向（`package.json:17-26`）若变动，对消费者同样是破坏式的。

现有测试都够不到这一层——`entityPublicContract.test.ts` 等是**源码层**类型断言，跑在 `src/` 上，构建产物长什么样它们看不见。

**处置**：在 `pnpm build` 之后增加一道产物层检查，对 `dist/index.d.ts`、`dist/assets.d.ts` 与 `package.json` 的 `exports`、`types` 做 API surface 快照。至少要能拦住：内部成员名（`*Impl`、`syncResolution`、`syncStyleFromSettings`、各 `Settings.apply` 等）出现在产物声明中；入口映射或类型入口被意外改动。手法上可以是快照文件比对，也可以引入 API Extractor 一类工具，1.0 阶段用快照即可，重点是**这道检查必须跑在 build 之后**，否则测的还是源码。

同时它是 A2 第三档的**配套前提**：只要有任何成员依赖 `@internal` + `stripInternal` 收口，就必须有这道断言守着，否则构建配置一改就静默回退成公开契约。

### 行为回归

改形状的项靠 `type-check` 就能兜住，但以下几条改的是**运行时行为**，类型检查完全看不见，必须补测试：

| 项 | 需要验证的行为 | 可挂靠的现有测试 |
| --- | --- | --- |
| B6 `viewer.globe.show` | 门面维护的可见性与底层 `group.visible` 保持一致，且切换地形 / surface tileset 后状态不丢失 | `src/test/terrainOverlay.test.ts` |
| D4 同步批量 | 批量结果与逐点调用**逐元素相等**（这是重构 tileset 列表与逆矩阵外提的正确性前提），未命中仍为 `undefined` | `src/test/heightSamplerLifecycle.test.ts` |
| C1 曝光链路 | 走新路径设置曝光后，`colorResolver`、实体颜色、高亮样式三处都被刷新（A4 记录的四步同步） | `src/test/toneMappingColorResolver.test.ts` |
| B5 `resolutionScale` | 经门面设置后像素比与 `syncResolution` 的下游都更新 | `src/test/rendererAdapter.test.ts` |
| B 门面整体 | 增删查改在新路径下与旧路径行为一致 | `src/test/layerManager.test.ts` |

其中 D4 那条优先级最高：它是本方案里唯一**重写了实现逻辑**的项（把每次调用的准备工作提到循环外），其余多为路径搬迁。

### 发版节奏

1.0.0 一次性发布，不走 beta。理由是破坏面高度集中在 `docs/` 与 `examples/`（影响面基线一节），这些都在本仓库内、随改随验；当前也没有规模化的外部用户群能在 beta 期提供有效反馈，beta 只会拉长窗口期、增加两套 API 并存的维护成本。前置条件是 `docs/guide/migration-1.0.md` 与本仓库全部示例在发布同时完成迁移——迁移指南本身就是这次发布的主要交付物之一。

## 同步清单

改动落地后需要一并更新：

- `docs/` 下全部受影响页面（`guide/`、`api/`、`design/`）
- `examples/` 各示例与 `examples/i18n/messages/*.ts`
- `examples/sandcastle/registry.ts` 中内嵌的代码片段
- `.agents/skills/tellux/` 下的 references
- `AGENTS.md` 与 `notes/archive/highlight统一高亮方案.md`（后者是 B9 的设计来源文档，不同步会继续误导）
- `README.md` / `README.en.md`
- 迁移指南：新增 `docs/guide/migration-1.0.md`，逐条给出旧写法到新写法的对照

## 待办

1. 批次 A1 修正三处默认值 JSDoc
2. 批次 A2 内部成员收口，按「`#private` → 改可达性（回调注入 / WeakMap 侧表）→ `@internal` + `stripInternal`」三档处理；若用到第三档，须同时在 `tsconfig.types.json` 开启 `stripInternal`（破坏式，随 1.0.0 发；如需预告可在 0.2.x 先标 `@deprecated`）
3. 批次 A3 对齐 `src/index.ts` 与 `src/Viewer.ts` 导出清单
4. 批次 A4 补原生 renderer 托管属性契约（路径待 B5、C1 定稿后写入）
5. 批次 B 新建 `viewer.tilesets` / `viewer.models` / `viewer.terrain` 门面，删除顶层拍平方法；`viewer.layers` 更名 `viewer.overlays`（保持顶层，类型名不动）；`viewer.renderer` 门面化收入 `type` / `resolutionScale`，`forceWebGL` 原样保留并补 JSDoc 说明它不恢复 WebGL 能力集；`viewer.tileset` 改为 `viewer.globe` 门面收入 `show` / `ellipsoid`；四个门面的原生对象出口统一为 `.raw`，`threeScene` / `threeCamera` 一并迁移
6. 批次 B8 把 `scene.postProcess` 提升为顶层 `viewer.postProcess`（初始化侧同步提升），`scene.highlight` 不动；补 `renderer.antialias`/`samples` 与 `postProcess.smaa`/`taa` 的 JSDoc 交叉引用
7. 守住可插拔前提：`postprocessing` 与 takram effects 保持 peer + external；内置 pass 名与顺序不写入用户文档。不预留 `add` / `remove` 等方法名，1.0 不公开自定义 pass 插入点
8. 批次 B9 `viewer.highlight` 更名 `viewer.highlighter` 并收编 `scene.highlight` 样式（`outline` / `overlay` 两组直接挂，不加 `config` 层），同步 `AGENTS.md` 与 `notes/archive/highlight统一高亮方案.md`
9. 批次 C 补齐 `postProcess.toneMappingExposure`、`scene.entities`、`hism.showPickMarker` 运行时路径，删除顶层 `transparent`
10. 批次 D 引入 `LonLat` / `LonLatHeight` / `LonLatLike` / `LonLatHeightLike` 并按「是否使用高度」给各 API 归位，删除 `CartographicInput` 系列；采样收成 2×2 形状并给同步版补批量重载；统一 `setView` / `flyTo` / `flyToTarget` options，拆分 `ViewerOptions.camera`
11. 批次 E 统一 `show`/`enabled`、数据源判别规则、实体图形字段、调试面板 options；描边收成「存在即开启」的可选子对象（无 `boolean` 联合、无 `enabled`），**同时把 `outline.width` 默认值从 `0` 改为非零**，否则语义不成立
12. 批次 B10 定义 `ViewerControls` 接口收窄 `viewer.controls` 公开类型，逐条确定承诺成员清单，其余走 `.raw`
13. 编写 `docs/guide/migration-1.0.md`，同步 examples / Sandcastle / skill / README
14. 冻结 `src/index.ts` 公开导出清单作为 1.0.0 契约基线，并补公开面契约测试（参照 `entityPublicContract.test.ts` 手法）；另加一道 **build 之后**的产物层检查，对 `dist/*.d.ts` 与 `package.json` 的 `exports` / `types` 做 API surface 快照
15. 补 B6 可见性、D4 批量等价性、C1 曝光链路、B5 像素比的行为回归测试
