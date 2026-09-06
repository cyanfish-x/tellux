# three-geospatial WebGPU Water Area 案例调研

> 状态：固定上游提交的研究与分阶段案例记录。落地状态见文末同名章节；测试数量、产物大小和未完成验收均保留原实验边界，2026-09-06 整理没有重新运行。早期推荐阶段不构成公共 API 承诺。

## 文档信息

- 调研日期：2026-08-22
- 上游仓库：[`takram-design-engineering/three-geospatial`](https://github.com/takram-design-engineering/three-geospatial)
- 调研基准提交：[`b012ad06d858fc035d88aacfd73f092f93c994e4`](https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4)
- 在线案例：[Atmosphere / 3D Tiles Renderer Integration / Water Area](https://takram-design-engineering.github.io/three-geospatial-webgpu/?path=/story/atmosphere-3d-tiles-renderer-integration--water-area)
- 上游实现目录：[`storybook-webgpu/src/plugins/waterArea`](https://github.com/takram-design-engineering/three-geospatial/tree/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea)
- Tellux 调研分支：`feat-water`
- 文档性质：第三方案例调研与 Tellux 接入建议，不代表公共 API 已定稿

## 结论

这个案例实现的是“水域识别 + 3D Tiles 材质重着色”，不是独立水面网格，也不是海浪模拟。

它的核心思路是：

1. 从 OpenStreetMap Shortbread 矢量瓦片中提取海洋、湖泊等水域。
2. 在 Web Worker 中将矢量要素栅格化为黑白水域 mask。
3. 通过 `3d-tiles-renderer` 的 `ImageOverlayPlugin` 把 mask 纹理和对应 UV 绑定到每个 3D Tiles Mesh。
4. 使用 `MeshPhysicalNodeMaterial` 采样 mask，在同一套瓦片几何上分别呈现陆地材质和水面材质。
5. 让水面材质继续参与 WebGPU 大气、太阳光和色调映射管线。

整体链路如下：

```text
OpenStreetMap Shortbread MVT
              │
              ▼
Web Worker：解析必要图层、过滤要素、栅格化
              │
              ▼
128 × 128 单通道水域 mask
黑色 = 陆地 / 遮挡物，白色 = 水域
              │
              ▼
WaterAreaTilesOverlay + WaterAreaOverlayPlugin
为瓦片 Mesh 提供 layer_uv_0 与 mask 纹理
              │
              ▼
WaterAreaNodeMaterial
按 mask 混合颜色、粗糙度、镜面强度和法线
              │
              ▼
WebGPU AtmosphereLight + Aerial Perspective + Tone Mapping
```

这个方案适合大范围摄影测量 3D Tiles、城市级水域和全球远景水域表现。它不能直接替代局部高质量 Ocean、GPU 波浪、反射、折射、泡沫和岸线水动力模拟。

## 上游案例装配方式

Story 复用了 `3DTilesRenderer-LightSourceLighting`，并额外传入：

- `materialHandler: () => new WaterAreaNodeMaterial()`：替换瓦片 Mesh 材质。
- `WaterAreaOverlayPlugin`：负责把水域 mask overlay 绑定到瓦片。
- `new WaterAreaTilesOverlay()`：提供实际的水域 mask 数据。
- `enableTileSplitting: false`：不因 overlay 边界进一步拆分瓦片几何。

上游装配代码：

```tsx
export const WaterArea = createStory(LightSourceLightingStory, {
  props: {
    longitude: -112.2525,
    latitude: 69.3782,
    heading: 69,
    pitch: -38,
    distance: 100000,
    materialHandler: () => new WaterAreaNodeMaterial(),
    globeChildren: (
      <TilesPlugin
        plugin={WaterAreaOverlayPlugin}
        args={{
          overlays: [new WaterAreaTilesOverlay()],
          enableTileSplitting: false
        }}
      />
    )
  },
  args: {
    toneMappingExposure: 5,
    dayOfYear: 170,
    timeOfDay: 2.7
  }
})
```

源码：[`3DTilesRenderer.stories.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/atmosphere/3DTilesRenderer.stories.tsx#L88-L118)

底层场景加载的是 Google Photorealistic 3D Tiles：

- 有 Google Maps API key 时使用 `GoogleCloudAuthPlugin`。
- 否则通过 Cesium Ion asset `2275207` 加载 Google Photorealistic Tiles。
- 此外注册 GLTF 扩展、材质替换、折痕法线、压缩、LOD fade 和按需更新等插件。

源码：[`Globe.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/components/Globe.tsx#L70-L113)

## 水域 mask 数据链路

### 数据源

案例使用 OpenStreetMap Shortbread MVT：

```text
https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt
```

关键配置：

- 数据最大层级：`14`。
- 输出 mask：`128 × 128`。
- 内部绘制坐标空间：`256 × 256`。
- Water Area overlay 默认可请求到层级 `20`，高层级由 `protomaps-leaflet` 的 `View` 处理父级数据复用和过缩放。

Shortbread 是面向 OpenStreetMap 数据的矢量瓦片 schema。若 Tellux 示例或库能力使用该数据，必须展示 OpenStreetMap attribution；公共库不应无提示地内置并依赖这个在线服务地址。

### 图层和绘制规则

Worker 只解析生成水域 mask 所必需的图层：

| Shortbread 图层 | mask 颜色 | 用途 |
| --- | --- | --- |
| `ocean` | 白色 | 海洋区域 |
| `water_polygons` | 白色 | 湖泊、河面等水体；排除 `kind === 'glacier'` |
| `bridges` | 黑色 | 从水域中扣除桥梁面 |
| `pier_polygons` | 黑色 | 从水域中扣除码头面 |
| `dam_polygons` | 黑色 | 从水域中扣除水坝面 |
| `street_polygons` | 黑色 | 仅扣除 `bridge === true` 的桥面道路 |
| `streets` | 黑色 | 仅扣除桥梁线，并按道路等级调整宽度 |

这样做可以避免水域 mask 覆盖桥梁、码头和水坝，使这些结构继续使用陆地材质。

源码：[`computeWaterAreaTileImage.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/worker/tasks/computeWaterAreaTileImage.ts#L20-L96)

### Worker 解析和栅格化

Worker 使用：

- `@mapbox/vector-tile` 解析 MVT。
- `pbf` 解析 Protobuf。
- `protomaps-leaflet` 的 `PolygonSymbolizer`、`LineSymbolizer` 和 `paint` 栅格化要素。
- `OffscreenCanvas` 在 Worker 中生成 mask。
- `transferToImageBitmap()` 生成可转移的 `ImageBitmap`，减少主线程复制。

上游为性能做了几项专项处理：

1. 只解析需要的图层，不遍历无关 MVT 图层。
2. 自己实现 zigzag varint 位运算，替换较慢的算术分支。
3. 计算 geometry 的同时统计 bbox 和顶点数。
4. 使用有限容量缓存，并合并相同瓦片的并发请求。
5. 支持任务取消，瓦片请求被 abort 时取消 Worker 任务。

### 纯色瓦片快速路径

案例会先判断瓦片是否为：

- 纯陆地：没有 `ocean` 和有效的 `water_polygons`。
- 纯水域：只有一个覆盖完整瓦片的海洋矩形，且没有桥梁、码头、水坝等遮挡物。

纯陆地和纯水域不会创建新的 128 × 128 `ImageBitmap`，而是复用两个 4 × 4 纯色纹理：

- 黑色纹理：陆地。
- 白色纹理：水域。

只有岸线等混合瓦片才执行完整栅格化。这能减少内存、纹理上传和垃圾回收成本。

源码：[`computeWaterAreaTileImage.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/worker/tasks/computeWaterAreaTileImage.ts#L274-L327)

## ImageSource 与 Overlay

### WaterAreaImageSource

`WaterAreaImageSource` 继承 `XYZImageSource`，但不通过 URL 下载图片。它把 `[x, y, z]` 交给 Worker，得到：

- 复用的黑色/白色纹理；或
- 岸线混合 `ImageBitmap` 纹理。

纹理设置为：

- `RedFormat`：只使用红色通道作为 mask。
- `generateMipmaps = false`。
- `needsUpdate = true`。

共享的纯色纹理不会随单个瓦片释放，普通混合纹理则交给父类处理资源释放。

源码：[`WaterAreaImageSource.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaImageSource.ts#L31-L86)

### WaterAreaTilesOverlay

`WaterAreaTilesOverlay` 继承 `XYZTilesOverlay`。父类要求 `url`，因此传入空字符串占位，然后把 `imageSource` 替换为 `WaterAreaImageSource`。

源码：[`WaterAreaImageOverlay.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaImageOverlay.ts)

### WaterAreaOverlayPlugin

`WaterAreaOverlayPlugin` 继承 `ImageOverlayPlugin`，固定 overlay resolution 为 `128`，并覆盖 `_wrapMaterials()`：

1. 遍历 tile scene 中的 Mesh。
2. 调用 `wrapWaterAreaNodeMaterial()`。
3. 将返回的 `layerMaps` / `layerInfo` 参数登记到 `meshParams`。
4. 后续复用 `ImageOverlayPlugin` 的瓦片、overlay、UV 和纹理生命周期。

源码：[`WaterAreaOverlayPlugin.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaOverlayPlugin.ts)

### NodeMaterial 包装

`wrapWaterAreaNodeMaterial()` 使用 Symbol 将 overlay 参数同时存放在 material 和 mesh 上。

TSL 节点通过 `onObjectUpdate` 获取当前 Mesh 对应的第一张 overlay 纹理，然后使用 `layer_uv_0` 采样红色通道：

```ts
const layerUV = attribute('layer_uv_0', 'vec3').toVarying('layerUV0')

export const waterAreaMask = Fn(() => {
  const uv = layerMapFlipY.select(layerUV.xy.flipY(), layerUV.xy).uniformFlow()
  return layerMap.sample(uv).r
})().toVar('waterAreaMask')
```

源码：[`wrapWaterAreaNodeMaterial.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/wrapWaterAreaNodeMaterial.ts#L22-L39)

## WebGPU ImageBitmap 翻转处理

案例在 TSL 采样时判断 overlay texture 的 image 是否为 `ImageBitmap`：

```ts
self.value = params?.layerMaps.value[0]?.image instanceof ImageBitmap
```

若是 `ImageBitmap`，就在 shader 采样前对 UV 执行 `flipY()`。

这是为了规避 Three.js WebGPU 对 `ImageBitmap` 与 `flipY` 的处理差异。Tellux 已经在以下文档和实现中处理过同类问题：

- `notes/engineering/WebGPU影像ImageBitmap二次翻转坑点.md`
- `src/tiles/WebGPUTerrainOverlayPlugin.ts`

Tellux 实现时应统一这类纹理方向约定，避免 Water Area 再建立第三套互相冲突的翻转规则。

## WaterAreaNodeMaterial

### 材质类型

水域案例使用 `MeshPhysicalNodeMaterial`，主要参数为：

```ts
ior = 1.33
metalness = 0
```

### mask 控制的材质属性

| 属性 | 陆地 mask = 0 | 水域 mask = 1 |
| --- | --- | --- |
| Base Color | 原始 `materialColor` | 向 `#020514` 混合 80% |
| Roughness | `1` | `0.35` |
| Specular Intensity | `0` | `1` |
| Normal | 原始 `normalView` | WGS84 椭球法线 |
| Cast Shadow | 正常 | discard，不投射阴影 |

源码：[`WaterAreaNodeMaterial.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaNodeMaterial.ts#L50-L74)

### 椭球法线

材质根据当前片元的 ECEF 位置和大气上下文中的椭球半径计算椭球法线，再转换到 view space。

目的不是改变几何，而是让水面高光遵循平滑的地球表面法线，避免摄影测量几何上的噪声、波纹、船只或重建误差破坏大范围水面反光。

需要特别注意：

- 上游虽然定义了 `ellipsoidPositionECEF`，但当前没有把它用于 `positionNode`。
- 水面顶点仍然是原 3D Tiles 几何，没有被压到椭球或统一水位面。
- 这个案例只“压平视觉法线”，没有“压平水面几何”。

## 与 WebGPU 大气的集成

案例使用 `@takram/three-atmosphere/webgpu`：

- 创建 `AtmosphereContext`。
- 将 `getAtmosphere()` 注册到 renderer context。
- 使用 `AtmosphereLight` / `AtmosphereLightNode` 提供太阳直射光和天空间接光。
- 使用 `aerialPerspective` 处理大气透射和散射。
- 之后执行 tone mapping、TAA 和 dithering。

`WaterAreaNodeMaterial` 通过 `getAtmosphereContext()` 获取 ECEF/View 变换矩阵和椭球参数，因此不是一个脱离场景上下文的普通 PBR 材质。

源码：[`3DTilesRenderer-LightSourceLighting.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/atmosphere/3DTilesRenderer-LightSourceLighting.tsx#L67-L144)

## 固定提交的上游案例能力边界

### 已实现

- 基于真实矢量数据识别海洋、湖泊和面状水体。
- 桥梁、码头、水坝等遮挡物扣除。
- 摄影测量 3D Tiles 上的水域材质替换。
- WebGPU / TSL `MeshPhysicalNodeMaterial`。
- 水面颜色、粗糙度、镜面强度、IOR 和法线调整。
- 与 Takram WebGPU 大气和光源式照明集成。
- Worker 栅格化、取消请求、并发合并和有限缓存。
- 纯陆地 / 纯水域纹理快速路径。

### 未实现

- 波浪、涟漪和流动动画。
- 动态法线贴图或程序化波谱。
- 屏幕空间反射、平面反射或环境倒影捕获。
- 水体透明、折射和水下可见性。
- 水深、浅水颜色和岸线渐变。
- 泡沫、浪花和潮汐。
- 顶点位移、统一水位面或真实几何压平。
- 水域与 terrain bathymetry 的耦合。
- 与局部 GPUOcean 水动力模拟的直接集成。

因此：

```text
Water Area 解决：哪里是水、该区域采用什么基础材质
Ocean 模拟解决：水如何运动、如何反射、如何形成浪和泡沫
```

两者可以长期组合，但不应在第一个 Water Area MVP 中强行合并。

## 上游实现的工程风险

### 依赖 3d-tiles-renderer 内部接口

上游案例使用了以下非稳定边界：

- 从 `3d-tiles-renderer/src/.../XYZImageSource.js` 导入源码实现。
- 覆盖 `ImageOverlayPlugin._wrapMaterials()`。
- 直接访问 `ImageOverlayPlugin.meshParams`。
- 假定 `layerMaps`、`layerInfo` 和 `layer_uv_0` 的内部结构。

这些用法对 Storybook 实验案例可以接受，但不适合不加隔离地成为 Tellux 公共 API 实现。

原调研时 Tellux 安装的 `3d-tiles-renderer` 是 `0.4.28`，上游调研提交使用 `0.4.24`。当时相关内部结构仍然存在，但 patch/minor 升级仍可能破坏它们。

建议：

1. 将所有上游内部接口访问限制在单个 adapter/plugin 文件中。
2. 不让公共 API 暴露 `ImageOverlayPlugin`、`XYZImageSource` 等底层类型。
3. 为当前安装版本编写插件注册、tile model processing、纹理绑定和 dispose 测试。
4. 升级 `3d-tiles-renderer` 时，将 Water Area 兼容性纳入回归检查。

### 数据 schema 耦合

当前绘制规则与 Shortbread 图层名和属性强耦合。换成 OpenMapTiles、自建 MVT 或业务水域数据后，图层名和属性可能完全不同。

Tellux 不应把 Shortbread 规则固化到 Water Area 核心域。建议将其设计为 source adapter：

```text
WaterAreaMaskSource
├── ShortbreadWaterAreaMaskSource
├── CustomMVTWaterAreaMaskSource
└── 未来 GeoJSON / PMTiles / 离线 mask source
```

### 在线服务和 attribution

公共库不应默认硬编码 `vector.openstreetmap.org`：

- 服务可用性和请求策略不由 Tellux 控制。
- 用户可能需要内网、自托管、商业或离线数据源。
- OpenStreetMap 数据需要 attribution。
- 示例必须明确数据来源，不应把示例服务误描述成 Tellux 自带数据。

## Tellux 案例边界与舍弃的方向

2026-09-06 静态核对 `examples/water-area/createWaterAreaDemo.ts`、`WaterAreaOptics.ts` 与 `WaterAreaOpticsEffect.ts`：Water Area 已有案例实现，optics 仅公开天空 environment，未保留平面反射和 Canvas 反射预览。没有独立水面几何与真实水位时，不能把共享瓦片几何当作平面反射水面。

- 普通 imagery 显示图像，water mask 控制材质；直接赋给 `material.map` 会覆盖摄影测量底图，不能代替独立 mask 输入。
- Worker 负责数据解析、过滤、缓存与栅格化；瓦片 adapter 负责 UV、纹理和模型生命周期；材质负责水陆 PBR 混合，控制器负责用户态和释放。不要让某个对象同时拥有这几层。
- Shortbread 是示例 schema，服务 URL 与 attribution 属于应用配置；不构成公共库固定依赖的在线数据服务。
- 案例修改特定 3D Tiles 材质，不是全局 Ocean，不拥有独立渲染循环。动态法线接入现有 Viewer 绘制路径。
- 原公共 API 草案尚未被采纳，且使用 0.2 写法；已从当前记录删除。将来产品化仍需确认后端、surface/terrain 范围、数据源注入和未启用句柄的语义，不能照草案承诺 `layer.waterArea`。

## Tellux 案例落地状态（更新于 2026-08-23）

当前已完成 Sandcastle 案例级实现，尚未进入 `src/` 或公共 API：

- 独立入口：`examples/water-area.html`、`examples/water-area.ts`。
- 案例装配：`examples/water-area/createWaterAreaDemo.ts`。
- 遮罩链路：`WaterAreaTilesOverlay`、`WaterAreaImageSource`、`WaterAreaOverlayPlugin`。
- WebGPU 材质：`WaterAreaMaterialPlugin`、`WaterAreaNodeMaterial`、`wrapWaterAreaNodeMaterial`。
- 效果控制：`WaterAreaDemo.show` 通过所有水域材质共享的 TSL uniform 即时控制水色、波纹和镜面贡献；隐藏效果时保留 3D Tiles、Worker 和 Mask 缓存，不重建 shader 或 tileset。
- 外观状态：案例级 `WaterAreaAppearance` 统一管理 `show`、`color`、`colorMix`、`roughness`、`waveStrength`、`waveScale`、`waveSpeed` 和 `waveDirection`；初始化 `appearance` 与运行时 `demo.appearance` 同构，所有已加载和后加载材质共享同一组 uniforms。
- 波纹坐标：默认以创建案例时的实际相机经纬度建立 ECEF/ENU frame，调用者仍可通过 `waveOrigin` 明确覆盖；锚点每帧在 CPU 双精度下转换到 view space，再与 Three.js `highPrecision` 生成的 `positionView` 做小量级相减，避免在 shader 中直接对约 6,000 km 的 ECEF 坐标做高频运算。
- 动态法线：案例默认固定复用 Three.js r184 Water2 的两张 512 × 512 法线贴图，并对齐 Valve / Water2 的核心流动逻辑：同一 ENU 基础 UV、同一主流向、A/B 相位恒差半周期、三角形权重交叉淡入，从而隐藏周期 reset；不再把两张贴图作为不同方向的宏观/细节层。资源以 `NoColorSpace`、RepeatWrapping、mipmap、三线性与各向异性过滤配置，并由 `WaterAreaEffect` 成对释放。原整数频率生成纹理只保留为测试/直接构造后备；流动相位由共享的 TSL render-group uniform 每次 render 推进并回绕在小范围内，运行时修改速度不会造成相位跳变，也不新增 `requestAnimationFrame`、材质遍历或独立渲染循环。
- 天空环境：所有水域瓦片材质共享一个 Takram `SkyEnvironmentNode`；它依据当前 AtmosphereContext 生成 64 像素半浮点 cubemap / PMREM，并只通过水域 mask 接入水面镜面辐射。案例不写入全局 `scene.environmentNode`，也不重复添加 Three `EnvironmentNode` 的漫反射 irradiance——后者继续由现有 `AtmosphereLight` 负责，因此不会重复天光或改变其他 PBR 地形、模型和 3D Tiles 的环境光边界。环境贴图保持线性 HDR，继续由 Tellux 唯一 WebGPU 输出链执行 AgX 和输出色彩空间转换。
- 场景反射：已移除基于单个 WGS84 局部切平面的 `ReflectorNode`、反射相机、离屏目标和 Canvas 调试预览。Water Area 继续定位为 3D Tiles 水域遮罩与材质重着色；在没有独立水面几何和真实水位前，不提供平面场景反射。
- 流向边界：Water2 的 flow map 是可选输入；当前案例没有河道/海流矢量场，使用它的固定 `flowDirection` 分支。该版本解决的是统一流向与周期复位连续性，不等于已经支持沿弯曲河道变化的空间流场。
- 资源合规：两张贴图的固定上游路径、Three.js MIT 许可证链接和 SHA-256 记录在 `examples/water-area/assets/NOTICE.md`；上游未为图片单独列出来源声明，严格商业发行前应补齐独立授权或替换为自有/CC0 资源。
- 远景过滤：双相位合成后的整体法线扰动按 view-space 距离衰减，纹理使用 repeat、线性过滤和 mipmap，降低远景高频闪烁风险。
- PBR 边界：继续使用 `MeshPhysicalNodeMaterial` 的 `ior = 1.33`、roughness 与 AtmosphereLight 产生太阳高光；动态环境通过专用 `WaterAreaEnvironmentNode` 只写入 PBR radiance，不修改陆地材质，也不接管 Viewer 主渲染循环。
- Worker 链路：固定 `maxWorkers: 8`、`queueStrategy: 'lifo'`、module Worker；MVT 下载、选择性解析和 `OffscreenCanvas` 栅格化均在 Worker 内执行。
- 示例面板：环境 Token 存在时默认加载；保留 Token 输入框作为运行时覆盖入口，修改后按 Enter 重新加载；现已使用通用 Leva 面板 helper（见 examples 架构），支持水色、颜色混合、粗糙度、波纹参数以及天空环境开关和强度即时调整，Token 重载后保留当前 appearance 与 optics。Sandcastle 封面使用用户提供的水域渲染截图 `https://picture.cyanfish.site/20260823222559818.png`。
- Sandcastle：源码命中任一 Water Area runtime binding 时，runner 才动态加载 `sandcastleBindings.ts`；案例 helper、默认参数、归一化函数和默认 ENU 锚点成组注入，普通 runner 初始依赖图不包含水域实现。
- 依赖：`workerpool`、`protomaps-leaflet`、`@mapbox/point-geometry` 暂时仅作为案例开发依赖。
- 构建预算：水域 Worker 独立限制为 256 KiB raw / 80 KiB gzip；当前产物约 165 KiB raw。

与上游的兼容性调整：Tellux 当前固定的 `@takram/three-atmosphere@0.19.1` 没有上游新版本的 `matrixViewToECEF` / `matrixECEFToView`，案例使用 `matrixWorldToECEF × cameraWorldMatrix` 和 `cameraViewMatrix × matrixECEFToWorld` 得到等价的视图空间 / ECEF 变换。

原落地记录的验证结果（本次未重跑）：

- Water Area 聚焦测试：9 个测试文件、29 个测试通过，覆盖水陆分类、Worker Pool、材质替换、共享外观 / optics 状态、Valve 双相位流动、法线纹理、ENU frame 和共享天空环境资源释放。
- 全量 `vitest`：67 个测试文件、248 个测试通过。
- `pnpm type-check` 通过。
- 水域案例严格 TypeScript 检查通过。
- `pnpm build:examples` 通过，水域独立页面、动态能力 chunk 和 Worker 产物均已生成且满足预算。

尚未完成浏览器视觉验收和 WebGPU 性能采样。自动化验证不能证明动态法线与天空环境高光在真实 GPU 上没有接缝、shader 编译 warning、远景闪烁或参数观感问题；在固定镜头、近景、相机运动和 60 秒 P95 帧时间验收通过前，不应把案例标记为已完成公共能力，也不应开始设计稳定公开 API。

### 阶段 1.1：原天空环境验证范围

- 保持 Sandcastle / Example 案例级边界，不进入 `src/` 或公开 `Viewer` API。
- 所有水域材质共享一个 Takram SkyEnvironment，并只向水域片元的 PBR radiance 路径注入。
- 运行时开关通过共享 uniform 生效，不重建 tileset。
- 不在这一阶段接入场景反射、透明折射、OIT 或水下雾。

## 原推荐实施阶段（不作为当前待办）

### 阶段 1：Sandcastle / Example 技术验证

目标：在不承诺公共 API 的情况下，验证上游路径能否在 Tellux WebGPU 3D Tiles 中稳定工作。

范围：

- WebGPU-only。
- Viewer 统一开启 Three.js `WebGPURenderer.highPrecision`，避免 ECEF 大数坐标在水面高光中表现为可见抖动；实例化与骨骼对象仍遵循独立精度方案。
- 一个固定地区和固定 3D Tiles 数据源。
- 一个明确配置的 Shortbread MVT 水域数据源。
- 支持共享的 show、color、colorMix、roughness 和 Valve 双相位 normal wave 参数。
- 波纹使用固定 ENU 米制坐标和共享 TSL render-group 相位，仅改变片元法线，不做顶点位移。
- 不做额外反射 Pass、折射、泡沫、水线和独立水面 Mesh。
- 不新增独立 render loop。

### 阶段 2：内部边界收口

目标：从案例代码提取可维护模块。

- `WaterAreaMaskSource`
- `WaterAreaMaskWorker`
- `SceneTilesetWaterAreaPlugin`
- `WaterAreaNodeMaterial`
- `WaterAreaController`

同时为 `3d-tiles-renderer` 内部接口添加集中 adapter 和兼容性测试。

### 阶段 3：公共 API

目标：通过真实示例和性能验证后，再确定 `Load3DTilesetOptions.waterArea` 与 `TilesetLayer.waterArea`。

需要同步：

- 中英双语 TypeScript JSDoc。
- `docs/` 用户指南和能力边界。
- Sandcastle 示例与参数面板。
- 依赖、attribution 和自托管数据说明。
- `dist` 声明和包产物。

## 验收建议

### 视觉

- 海洋、湖泊和河面与底图/摄影测量位置基本一致。
- 桥梁、码头和水坝不被水材质覆盖。
- 岸线没有明显上下翻转、镜像、瓦片错缝或整块漂移。
- 水面高光连续，不被摄影测量噪声法线切碎。
- LOD 切换时不出现明显黑块、白块和 mask 滞留。
- 切换 show 或材质参数后，已加载和新加载瓦片表现一致。

### 生命周期

- 快速移动相机时 Worker 任务可以取消。
- tile dispose 后普通 mask texture 能释放。
- 共享纯色纹理不会被单个 tile 销毁。
- tileset remove 后 plugin、worker、cache、纹理和材质引用全部释放。
- Viewer destroy 后不残留 Worker、事件监听器或请求。

### 性能

- mask 栅格化不阻塞主线程。
- 缓存有明确上限，不随浏览范围无限增长。
- 同一瓦片并发请求能合并。
- 纯陆地和纯水域走快速路径。
- 统计额外网络、Worker CPU、GPU texture、draw call 和 frame time 成本。

### 浏览器回归

- 无持续 console error / warning。
- WebGPU `ImageBitmap` 方向正确。
- 页面只有 Viewer 管理的单一 canvas 和渲染循环。
- OpenStreetMap attribution 可见。
- 不支持 WebGPU 时行为明确，不出现半初始化状态。

## 参考源码

- Water Area Story：[`3DTilesRenderer.stories.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/atmosphere/3DTilesRenderer.stories.tsx#L88-L118)
- 3D Tiles Globe 装配：[`Globe.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/components/Globe.tsx)
- WebGPU 光源和大气：[`3DTilesRenderer-LightSourceLighting.tsx`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/atmosphere/3DTilesRenderer-LightSourceLighting.tsx)
- Overlay：[`WaterAreaImageOverlay.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaImageOverlay.ts)
- ImageSource：[`WaterAreaImageSource.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaImageSource.ts)
- Overlay Plugin：[`WaterAreaOverlayPlugin.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaOverlayPlugin.ts)
- NodeMaterial 包装：[`wrapWaterAreaNodeMaterial.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/wrapWaterAreaNodeMaterial.ts)
- 水域材质：[`WaterAreaNodeMaterial.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/plugins/waterArea/WaterAreaNodeMaterial.ts)
- Worker 任务：[`computeWaterAreaTileImage.ts`](https://github.com/takram-design-engineering/three-geospatial/blob/b012ad06d858fc035d88aacfd73f092f93c994e4/storybook-webgpu/src/worker/tasks/computeWaterAreaTileImage.ts)

## Tellux 关联文件

- `package.json`
- `src/types/terrain.ts`
- `src/types/tiles.ts`
- `src/tiles/TilesetManager.ts`
- `src/tiles/TilesetModelPlugins.ts`
- `src/tiles/ImageryOverlayFactory.ts`
- `src/tiles/WebGPUTerrainOverlayPlugin.ts`
- `src/rendering/WebGPUAtmosphereManager.ts`
- `notes/engineering/WebGPU影像ImageBitmap二次翻转坑点.md`
- `notes/research/3d-tiles-renderer接入边界.md`
