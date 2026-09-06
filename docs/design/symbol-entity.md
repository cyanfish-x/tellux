# Symbol 实体（Icon + 文字标签）技术方案

> 状态：**v1 已实现（per-symbol SDF，2026-07-04）**。文字渲染直接采用 SDF 方案（每符号一张 SDF 纹理），跳过原计划的 canvas 覆盖 v1；glyph 图集 / troika 路线作为量级驱动的后续。
> 范围：点锚定的屏幕空间图标（billboard）+ 文字标签，对标 Mapbox GL `symbol` layer 与 Cesium `BillboardGraphics` / `LabelGraphics`。
> 渲染器：WebGL 优先；与现有实体拾取体系对齐，并通过后合成显示色路径保持 WYSIWYG。

---

## 0. 背景与决策

### 0.1 现状

实体目前支持点 / 线 / 面（[Entity.ts](../../src/entities/Entity.ts)），无图标与文字标注。点图形（[PointGraphic](../../src/entities/PointGraphic.ts)）已是「点锚定 + 屏幕空间恒定像素大小」的范式，但用 `THREE.Points` 圆形纹理，无法承载任意图片或文字。

### 0.2 采用的方案：Symbol Entity（icon + text 统一）

参照 Mapbox GL 的 `symbol` layer——**一个 symbol = 一个图标 + 一段文字，共享同一锚点与排布**，二者同一套 quad 管线、同一个着色器。不拆成 `billboard` / `label` 两个独立字段，因为：

- 图标 + 文字成对出现（带名字的兴趣点）是最常见用法，分开会迫使大多数实体写两个字段、且无法表达二者相对排布。
- 共享锚点 / 偏移 / 旋转 / 透明度等放置属性天然属于「这一组标注」而非单个图元。
- 内部共用一个屏幕空间四边形原语（`AnchorQuadGraphic`），icon 与 text 是两个 quad 实例，渲染管线、拾取、遮挡和显示色解析完全复用。

### 0.3 文字渲染：per-symbol SDF（v1 实现）

v1 直接采用 **SDF 方案**：每段文字先用 canvas 光栅化（仅 alpha 覆盖，白色字形透明底），再用两遍可分离 EDT（Felzenszwalb-Huttenlocher）生成单通道有符号距离场纹理；icon 同理从图片 alpha 生成 SDF。二者各一个屏幕空间 billboard quad，共用一套 SDF shader（`smoothstep` 抗锯齿填充 + 距离阈值描边 / halo）。Symbol 位于主色调映射之后的独立合成 pass，颜色 uniform 经 [resolveDisplayColor](../../src/entities/invertToneMapping.ts) 转成目标显示色，不做 AgX 反求；改色不需重建纹理，改文字 / 字号才重建。

- 契合设计文档的 `AnchorQuadGraphic` 原语（icon / text 各一个 quad），与 Point / Polyline / Polygon graphic 同构，OIT / 拾取 / 颜色管线全复用。
- 零新依赖；距离变换为自研约 60 行。复用浏览器系统字体，**中文标注零字体成本**。
- 拾取 override `Mesh.raycast`，按命中 UV 采样 SDF alpha 剔除透明像素 → 像素级精确，不改 EntityPicker。

完整 SDF 字形图集（Mapbox 路线 / troika-three-text）是「上千标签 + 沿线排版」的答案，但构建成本高、需引入字体文件（CJK 多 MB），本期 label 量级用不上。**接口设计成不暴露内部纹理来源**，将来量级上来可整体换字形图集，上层不动（§5）。

### 0.4 关键约束

- **WYSIWYG**：所有用户色（icon tint / text fill / outline / background）统一走 `resolveDisplayColor`。Symbol 在 AgX 之后合成，因此直接使用目标显示色，不能复用主场景实体的反求路径（详见 [invertToneMapping.ts](../../src/entities/invertToneMapping.ts)）。
- **锚点遮挡**：symbol 不走实体 OIT；WebGL 下由 [SymbolOcclusionPass](../../src/entities/SymbolOcclusionPass.ts) 在主场景之后单独绘制，并读取场景深度纹理按锚点做全有 / 全无遮挡。
- **WebGPU**：`onBeforeCompile` 在 WebGPU 失效；自写 ShaderMaterial 不依赖该机制（直接写完整 GLSL），但当前锚点遮挡 pass 依赖 WebGL `setEffects` 深度纹理链。WebGPU 支持需后续单独立项。
- **不依赖 sandcastle import 白名单**：canvas 纹理在 graphic 内部 `document.createElement('canvas')` 生成，案例侧无新依赖。

---

## 1. Mapbox / Cesium 实现回顾（决策依据）

### 1.1 Mapbox symbol layer

- icon 与 text 共用同一 quad 管线、同一 `symbol` 着色器；`icon-image` / `text-field` 是同一图层的两组属性。
- 文字用 **SDF 字形图集**：fontstack + 256 码点 range 向 glyph 服务请求 SDF PBF，客户端 pack 进 atlas，harfbuzz (WASM) 整形 → 每字一个 quad（UV 进 atlas）。halo = 同一 SDF 换更低阈值再画一遍。
- 布局：点标签 / 面标签 / 沿线标签（每字按线段角度旋转，受 `text-max-angle` 约束）。
- 碰撞：优先级 + 网格，新版部分挪到 GPU（placement texture）。
- shader：halo + fill 两遍，SDF smoothstep 抗锯齿，屏幕大小恒定靠 `gl_Position` 乘随距离 / pitch 的 scale。

### 1.2 Cesium Billboard / Label

- `BillboardGraphics` / `LabelGraphics` 各自独立 collection（`BillboardCollection` / `LabelCollection`），collection 内 instanced。
- Label 用 canvas 纹理（每 label 一张），支持 `fillColor` / `outlineColor` / `outlineWidth` / `backgroundColor` / `style`（FILL / OUTLINE / FILL_AND_OUTLINE）。
- `heightReference`（CLAMP / RELATIVE）走 CPU 采样改 modelMatrix（[ground-clamp.md](./ground-clamp.md) §1.4）。

### 1.3 取舍

| 需求 | 本期 | 来源 |
|---|---|---|
| icon + text 同锚点 | ✅ | Mapbox symbol |
| canvas 文字纹理 + 颜色 uniform | ✅ | Cesium Label（简化：coverage-only + shader tint） |
| 单实体单 quad（非 collection） | ✅ v1 | Tellux 现有 per-entity 范式（同 PointGraphic） |
| SDF / harfbuzz / atlas | ❌ 后续 | Mapbox（量级上来再上 troika） |
| 沿线标签 / 碰撞 | ❌ 非目标 | 地球引擎少量标注用不上 |
| instanced collection | ❌ 后续 | 量级上来再上（接口预留） |

---

## 2. 总体架构

```
Entity
  └─ symbol?: SymbolOptions
       └─ SymbolGraphic（持有 1~2 个 AnchorQuadGraphic + 文字 canvas 纹理构建器）
            ├─ icon quad   ← AnchorQuadGraphic（image 纹理 + tint uniform）
            └─ text quad   ← AnchorQuadGraphic（canvas coverage 纹理 + fill/outline/bg uniform）
```

渲染链路：

- symbol quad 挂在 `entity.root` 下（普通绝对高，非 groundClampRoot）。
- WebGL 后处理链中，[SymbolOcclusionPass](../../src/entities/SymbolOcclusionPass.ts) 在主场景渲染前临时隐藏 symbol，主场景完成后读取 depth texture 并只重绘 symbol。
- 每个 quad 的 shader 用锚点投影坐标采样场景深度；锚点被遮挡时整个 icon / text / background 隐藏，锚点可见时整体显示。
- 拾取：quad 为 `THREE.Mesh` + `PlaneGeometry`，[EntityPicker](../../src/sampling/EntityPicker.ts) 现有 `raycaster.intersectObject(root, true)` 已覆盖（仅跳过 `Points`/`Line2`，见 [isScreenSpacePickedObject](../../src/sampling/EntityPicker.ts#L206)），**零拾取改动**。

新增组件：

| 组件 | 职责 | 对标 |
|---|---|---|
| `AnchorQuadGraphic` | 屏幕空间四边形原语：camera-facing、像素 / 世界大小、anchor、pixelOffset、rotation、tint、opacity；OIT-patch 友好的自写 ShaderMaterial | Mapbox symbol quad / Cesium billboard quad |
| `SymbolGraphic` | 组合 icon + text quad，算组合体布局（textRelative / anchor / spacing），持有 canvas 纹理构建器 | Mapbox symbol layer |
| `SymbolOptions` / `IconOptions` / `TextOptions` | API 类型 | Mapbox `icon-*`/`text-*` + Cesium Label 字段 |
| `SymbolGraphics` / `IconGraphics` / `TextGraphics` | 运行时句柄 | 现有 `*Graphics` 句柄范式 |

---

## 3. 组件设计

### 3.1 AnchorQuadGraphic（共享原语）

- 几何：`PlaneGeometry(1, 1)`，单 quad。
- 材质：自写 `ShaderMaterial`，uniform：`uMap`、`uTint`（`resolveDisplayColor` 输出的显示色）、`uOpacity`、`uRotation`、`uPixelOffset`、`uAnchor`（归一化偏移）、`uPixelSize`、`uCameraRight` / `uCameraUp`（或 VS 取 view 矩阵列）。
- VS：顶点单位四边形按 sizeMode 缩放（pixel = 除以 drawing buffer 尺寸转 NDC；world = 世界单位），按 rotation 旋转，按 anchor / pixelOffset 平移，再用 camera right / up 基向量从锚点 world position 摆到屏幕空间 → `gl_Position`。**像素大小在 VS 里做，不需每帧按距离 rescale。**
- FS：`gl_FragColor = texture2D(uMap, vUv) * vec4(uTint, uOpacity);`（main 末尾显式写 `gl_FragColor`，命中 OIT fallback 分支）。
- `alphaTest` / `depthTest` / `depthWrite` 通过 material 属性控制；半透明时 `transparent: true` 触发 OIT。
- 接口：`setPosition(v3)`、`setTint(color)`、`setOpacity(o)`、`setRotation(r)`、`setPixelOffset([dx,dy])`、`setMap(texture)`、`dispose()`。

### 3.2 SymbolGraphic（组合 + 布局）

- 持 `iconQuad?: AnchorQuadGraphic`、`textQuad?: AnchorQuadGraphic`。
- 布局（CPU，建图 / 改放置属性时算）：
  - 算 icon box（像素 w×h = 纹理尺寸 × scale）与 text box（canvas 尺寸）。
  - 按 `textRelative` 拼成组合 box，间距 `textIconSpacing`。
  - 按 `anchor` 决定组合 box 的哪个角 / 边对齐到锚点，得到两个 quad 各自相对锚点的像素偏移。
  - 加 `pixelOffset` 整体平移。
- 文字 canvas 纹理构建器：`buildTextTexture(text, font, fontSize, fontWeight, outlineWidth, padding, lineHeight, maxWidth)` → `THREE.CanvasTexture`，**仅 alpha 覆盖**（白色字形 + 白色描边外扩，背景透明）；fill / outline / bg 色不进 canvas，作 uniform。
- `setPosition` 透传给两个 quad；`dispose` 释放 quad + canvas 纹理 + 图标纹理（引用计数或简单 dispose）。
- 图标纹理：`image` 为 string → `TextureLoader` 异步加载 + 共享缓存（同 URL 复用）；为 Image / Canvas / Texture → 直接用。异步加载完成前 quad 不可见，加载后 `setMap`。

### 3.3 颜色 WYSIWYG

- icon tint、text fill、text outline、text background 各自经 `resolveDisplayColor(input)` 得到目标显示色，作为对应 quad 的 uniform。
- canvas 仅存覆盖：字形 / 描边为白 alpha，背景透明 → `texture2D(uMap).a` 是字形覆盖率，`rgb` 乘 tint。
- 描边：text quad 画两遍？不——canvas 一次烘焙出「描边 + 字形」覆盖（描边在字形外圈，字形在内圈），FS 里用覆盖率区分：`fillA = inner coverage`、`outlineA = total - inner`。或更简：两个 AnchorQuad 叠加（outline quad 在下，fill quad 在上），各自 tint。**实现时定**，倾向单 canvas 双通道覆盖率（少一个 quad）。
- 背景色：单独 uniform + 一个不透明 alpha 填充（在字形覆盖之前画），或作为 text quad 的背景层。**实现时定**。

### 3.4 锚点遮挡

- [SymbolOcclusionPass](../../src/entities/SymbolOcclusionPass.ts) 每帧 `beginFrame()` 隐藏带 symbol 标记的 quad，避免主场景普通 depthTest 逐片元裁切图标。
- pass 渲染时恢复 symbol、隐藏非 symbol renderable，并临时关闭 symbol 材质 `depthTest`；遮挡由 shader 统一读取锚点深度决定。
- 锚点深度比较不能用单 texel + 近零阈值：相机操作时锚点会跨 depth texel / 瓦片三角形边界，贴地或贴模型表面的标签会在等深度附近来回翻转。当前 shader 使用小邻域采样（取最远深度）加朝相机方向的容差来稳定判定。
- 容差必须是**米制（线性视空间）**，不能是固定 window-space bias：标准非线性深度下固定 Δd 等效的世界容差随距离平方增长（Δz ≈ Δd·z²/B，near=10 时 z=10km 处 Δd=5e-4 即等效 5km），会吞掉全部真实遮挡差，表现为"远处地形挡不住 symbol"。shader 从 projectionMatrix 提取 p22/p32 把场景深度线性化，与锚点线性视深比较，容差为 `max(uOcclusionBiasMeters, uOcclusionBiasRel · 锚点视距)`。
- 邻域 max 采样须剔除天空 texel（深度 1.0），否则锚点像素靠近山脊 / 地平线剪影时 max 变远平面、遮挡失效；锚点像素本身为天空按不遮挡处理。
- 深度纹理在链尾采样的前提是链中无人清掉 targetA 的深度：postprocessing 的 pass 需在 autoClear=false 下运行，且大气之前的 pass 不得 swap（详见 notes/engineering/Symbol锚点遮挡与大气失效的effects链深度坑点.md）。
- 验证：锚点被遮挡时 icon / text / background 全部隐藏；锚点可见时即使图标矩形覆盖前景深度，也不被局部切碎。

### 3.5 实体集成

- [Entity](../../src/entities/Entity.ts) 构造：`options.symbol` 存在 → 建 `SymbolGraphic`，挂 `this.root`（绝对高，不进 groundClampRoot）。
- `set position`：当前只驱动 `pointGraphic`，**新增**透传 `symbolGraphic.setPosition`。
- `set show`：已改 `root.visible`，天然覆盖。
- `dispose`：加 `symbolGraphic?.dispose()`。
- `get symbol`：返回 `SymbolGraphics` 句柄或 `null`。
- `symbolGraphicImpl`：供 EntityPicker 后续做屏幕空间容差（v1 不需要，raycast 已覆盖）。

### 3.6 拾取

- v1：quad 为 Mesh，现有 raycast 路径命中；`findEntity` 沿 parent 链回溯到根 group 上的 entity tag（[tagObject3DWithEntity](../../src/sampling/EntityPicker.ts#L232)）。
- `disableDepthTestDistance`（穿透地形显示，P5）不影响 raycast（射线只看几何）。
- 后续若需屏幕空间容差（小图标友好命中），加 `symbolGraphicImpl` 屏幕投影路径，复用现有 point / polyline 的 tolerance 范式。

---

## 4. API 设计

```ts
/** Symbol 锚点对齐：组合体（icon+text）的哪个位置对齐到实体 position。 */
export type SymbolAnchor =
  | 'center' | 'left' | 'right' | 'top' | 'bottom'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** text 相对 icon 的排布方向；仅二者同时存在时生效。 */
export type SymbolTextRelative = 'left' | 'right' | 'top' | 'bottom'

/** 图标（billboard）配置。 */
export interface IconOptions {
  /** 图标来源：URL / Image / Canvas / THREE.Texture。 */
  image: string | HTMLImageElement | HTMLCanvasElement | THREE.Texture
  /** 缩放，默认 1。 */
  scale?: number
  /** tint 颜色，默认白色（不染色）。按目标显示色解析。 */
  color?: ColorInput
  /** 透明度 [0,1]，默认 1。 */
  opacity?: number
}

/** 文字标签配置。 */
export interface TextOptions {
  /** 文本内容。 */
  text: string
  /** 字体族，默认 'sans-serif'。 */
  font?: string
  /** 字号（像素），默认 16。 */
  fontSize?: number
  /** 字重，默认 'normal'。 */
  fontWeight?: 'normal' | 'bold' | number
  /** 填充色，默认白色。按目标显示色解析。 */
  color?: ColorInput
  /** 描边。缺省则无描边；传入对象即开启。 */
  outline?: { color?: ColorInput; width?: number }
  /** 背景色；缺省透明。按目标显示色解析。 */
  backgroundColor?: ColorInput
  /** 内边距 [x, y]（像素），默认 [4, 2]。 */
  padding?: [number, number]
  /** 行高倍数，默认 1.2。 */
  lineHeight?: number
  /** 最大宽度（像素），超出自动换行；缺省不换行。 */
  maxWidth?: number
  /** 透明度 [0,1]，默认 1。 */
  opacity?: number
}

/** Symbol 图形配置：一个锚点上的 icon + text 组合，始终面向屏幕。 */
export interface SymbolOptions {
  /** 图标配置；与 text 可同时存在。 */
  icon?: IconOptions
  /** 文字配置；与 icon 可同时存在。 */
  text?: TextOptions
  /** 组合体锚点对齐，默认 'bottom'。 */
  anchor?: SymbolAnchor
  /** 相对锚点的像素偏移 [dx, dy]，默认 [0, 0]。 */
  pixelOffset?: [number, number]
  /** text 相对 icon 的排布方向，默认 'right'。 */
  textRelative?: SymbolTextRelative
  /** icon 与 text 间距（像素），默认 2。 */
  textIconSpacing?: number
  /** 旋转（弧度，屏幕空间顺时针），默认 0。 */
  rotation?: number
}
```

落到 `EntityOptions`：

```ts
export interface EntityOptions {
  id?: string
  position?: LonLatHeightLike
  point?: PointOptions
  polyline?: PolylineOptions
  polygon?: PolygonOptions
  /** Symbol 图形（icon + 文字标签），点锚定、屏幕空间。 */
  symbol?: SymbolOptions
  properties?: Record<string, unknown>
  show?: boolean
}
```

运行时句柄（[EntityGraphics.ts](../../src/entities/EntityGraphics.ts)）：

```ts
export class SymbolGraphics {
  constructor(private readonly graphic: SymbolGraphic) {}
  get icon(): IconGraphics | null
  get text(): TextGraphics | null
  get rotation(): number
  set rotation(v: number)
  get pixelOffset(): [number, number]
  set pixelOffset(v: [number, number])
}

export class IconGraphics {
  constructor(private readonly graphic: AnchorQuadGraphic) {}
  get color(): number            // hex，同 PointGraphics
  set color(v: ColorInput)
  get scale(): number
  set scale(v: number)
  get opacity(): number
  set opacity(v: number)
}

export class TextGraphics {
  constructor(private readonly graphic: SymbolGraphic) {}
  get text(): string
  set text(v: string)            // 触发 canvas 重建
  get color(): number
  set color(v: ColorInput)
  get outlineColor(): number
  set outlineColor(v: ColorInput)
  get backgroundColor(): number
  set backgroundColor(v: ColorInput)
  get fontSize(): number
  set fontSize(v: number)        // 触发 canvas 重建
  get opacity(): number
  set opacity(v: number)
}
```

使用示例：

```ts
viewer.entities.add({
  position: [121.4737, 31.2304, 50],
  symbol: {
    icon: { image: '/markers/poi.png', scale: 1 },
    text: { text: '陆家嘴', color: '#ffffff', outline: { color: '#0f172a', width: 2 } },
    anchor: 'bottom',
    textRelative: 'right',
  },
  properties: { kind: 'poi', label: '陆家嘴' },
})
```

### 4.1 与现有字段的共存

- `symbol` 与 `point` 可共存（同一实体既有圆点又有图标 + 文字），二者独立挂 root。
- `symbol` 跟随 `EntityOptions.position`（同 point）。
- Symbol 贴地和米制尺寸仍是路线图能力；在实现与验证完成前不进入稳定公开类型。

### 4.2 实现断崖（同 ground-clamp 思路）

| 能力 | v1 | 后续 |
|---|---|---|
| 绝对高 + pixelOffset / scale / anchor / rotation / color | ✅ | — |
| 半透明（OIT） | ✅ | — |
| 贴地 clamp（单点采样） | 🧭 未进入稳定 API | S4 |
| 距离缩放 / 透明度衰减 | ❌ | S5 |
| disableDepthTestDistance | ❌ | S5 |
| SDF 文字 / instanced collection | ❌ | 量级驱动 |

稳定类型只声明已兑现能力；路线图字段在实现、测试和文档同批完成后再进入公开 API。

---

## 5. 分阶段计划

> 实际实现把 S0–S3 一次到位且文字直接走 SDF（见 §0.3），下表为原始计划留档；S2 的 canvas 覆盖被 per-symbol SDF 取代，S6 的 SDF 字形图集仍为量级驱动后续。

| 阶段 | 交付 | 验收 |
|---|---|---|
| **S0** AnchorQuadGraphic 原语 | 自写 ShaderMaterial：camera-facing、像素 / 世界大小、anchor、pixelOffset、rotation、tint、opacity；OIT-patch 友好 | 单 quad 贴图渲染，缩放 / 旋转 / 偏移 / tint 正确；半透明经 OIT 无黑边 |
| **S1** SymbolGraphic + Icon | `IconOptions`、image 异步加载 + 缓存 + dispose、`SymbolGraphics` / `IconGraphics` 句柄、Entity 集成（position / show / dispose / get symbol）、拾取验证 | icon 跟随 position，raycast 命中，颜色 WYSIWYG |
| **S2** Text（canvas 纹理） | `TextOptions`、canvas coverage 构建、fill / outline / bg uniform、布局（textRelative / anchor / spacing）、`TextGraphics` 句柄 | 文字锐利、halo 正确、改色不重建 canvas、改文字重建、icon+text 组合排布正确 |
| **S3** 打磨 + 案例 | 多行 / maxWidth 换行、行高、背景框圆角、与 point 共存、sandcastle 案例 | 样式齐全，案例可交互 |
| **S4** 贴地 clamp（单点） | 接入 HeightSampler，同点 clamp 语义；LOD 重采样 | symbol snap 地表，LOD 收敛 |
| **S5** 距离衰减 | scaleByDistance / translucencyByDistance / disableDepthTestDistance | 远距自动淡化 / 穿透显示 |
| ~~S6 SDF / collection~~ | 量级驱动，接口已预留，整体替换 | — |

---

## 6. 风险与开放问题

- **大数量 symbol 性能**：当前仍是 per-quad mesh / draw call；锚点遮挡 pass 先保证语义正确，后续量级上来再做 atlas、instancing、屏幕裁剪和碰撞 / 聚合。
- **canvas 覆盖 vs 烘焙颜色**：本期定 coverage-only + uniform tint（WYSIWYG + 改色不重建）；Symbol 后合成 pass 直接使用 `resolveDisplayColor` 的目标显示色。
- **描边 / 背景实现**：单 canvas 双通道覆盖率 vs 双 quad 叠加 vs 背景层——S2 实现时定，倾向单 canvas 双通道（少 quad）。
- **图标纹理生命周期**：异步加载 + 多实体共享缓存 + dispose 时机（引用计数 vs 简单 dispose），避免泄漏或释放中纹理。
- **像素大小与 DPI**：canvas 按设备 pixelRatio 绘制保证锐利；pixel size 在 VS 里需结合 drawing buffer 尺寸（非 CSS 尺寸）转 NDC，与 [syncResolution](../../src/entities/EntityManager.ts#L88) 的 resolution 口径一致。
- **WebGPU**：自写 ShaderMaterial 不依赖 onBeforeCompile，但 OIT 材质替换依赖现有 WebGL 管线；WebGPU 支持随 OIT 一起后续立项。
- **地球尺度抖动**：symbol 锚点是单点，Float32 在地球尺度可能抖；若复现，对锚点 position 走 EncodedCartesian3 高 / 低拆分（同 ground-clamp §1.5 细节 1）。

---

## 7. 参考

**Mapbox GL JS / maplibre-gl**：

- `symbol` layer：icon + text 共用 quad 管线与着色器
- SDF 字形图集 + harfbuzz 整形 + 碰撞检测

**Cesium 1.136**：

- `BillboardGraphics` / `BillboardCollection`、`LabelGraphics` / `LabelCollection`
- `fillColor` / `outlineColor` / `outlineWidth` / `backgroundColor` / `style`
- `heightReference` CPU 采样（见 [ground-clamp.md](./ground-clamp.md) §1.4）

**tellux**：

- [Entity.ts](../../src/entities/Entity.ts) — 组合分发、position / show / dispose
- [PointGraphic.ts](../../src/entities/PointGraphic.ts) — 点锚定 + 屏幕空间像素大小范式
- [EntityGraphics.ts](../../src/entities/EntityGraphics.ts) — `*Graphics` 运行时句柄范式
- [EntityRenderManager.ts](../../src/entities/EntityRenderManager.ts) — OIT pass、`patchFragmentShader` 材质注入
- [invertToneMapping.ts](../../src/entities/invertToneMapping.ts) — `resolveDisplayColor` 后合成显示色解析
- [EntityPicker.ts](../../src/sampling/EntityPicker.ts) — 拾取（raycast + 屏幕空间 tolerance）
- [types/entities.ts](../../src/types/entities.ts) — `EntityOptions` / `*Options`
- [ground-clamp.md](./ground-clamp.md) — `clamp` 字段语义、单点 HeightSampler 采样
