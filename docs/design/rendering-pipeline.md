# Tellux 渲染管线

> 状态：**基于 2026-07-02 代码现状的整理文档**
> 范围：完整描述 Viewer 初始化、每帧渲染流程、各渲染子系统及其交互关系。

---

## 1. 总体架构

Tellux 的渲染管线以 **Three.js WebGL/WebGPU** 为底层渲染原语，在 `Viewer` 类中整合了以下关键外部库和自研子系统：

```
┌──────────────────────────────────────────────────────────────┐
│                        Viewer.renderFrame()                  │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Clock  │  │Controls  │  │Tilesets  │  │ Atmosphere   │  │
│  │  tick   │  │ update   │  │ update   │  │ update       │  │
│  └─────────┘  └──────────┘  └──────────┘  └──────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              PostProcessingManager                    │    │
│  │  Normal → (Cloud+)Atmosphere → LensFlare → SMAA →   │    │
│  │  Dithering                                            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              EntityRenderManager (OIT)                 │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │         rendererAdapter.render(scene, camera)          │    │
│  │            WebGL: setEffects 通道                      │    │
│  │            WebGPU: renderPipeline / delegate           │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

核心依赖关系：

| 层 | 实现 | 说明 |
|---|---|---|
| GIS 数据调度 | `3d-tiles-renderer` | 3D Tiles 解析、瓦片加载/卸载、地球椭球、影像叠加 |
| 大气 & 云 | `@takram/three-atmosphere` / `@takram/three-clouds` | AerialPerspective、体积云、天空、星光 |
| 后处理框架 | `postprocessing` (EffectPass / NormalPass) | SMAA、Dithering、LensFlare 等效果链 |
| 渲染原语 | `three` (WebGLRenderer / WebGPURenderer) | 底层 draw call、shader 编译、几何上传 |
| **自研** | `src/rendering/*`、`src/entities/*`、`src/materials/*` | 渲染管线编排、RTC 实例化、OIT 实体、材质模式 |

---

## 2. Viewer 初始化流程

`Viewer` 构造函数按以下顺序建立整个渲染管线：

### 2.1 渲染器创建

```
Viewer(options)
  ├─ resolveViewerResolutionScale → devicePixelRatio (cap 2)
  ├─ resolveViewerSceneOptions → 全量场景默认值合并
  ├─ RendererAdapter.create(options)
  │   ├─ type: 'webgl' → WebGLRendererAdapter (含 setEffects 能力)
  │   └─ type: 'webgpu' → WebGPURendererAdapter (需异步 init)
  └─ 设置 toneMapping = AgXToneMapping, exposure = 10
```

关键点：
- **WebGL** 路径：`ThreeRendererWithEffects` — Three.js WebGLRenderer 加上 `setEffects()` 方法，由 `postprocessing` 库的 `EffectComposer` 等价机制驱动。同步创建，无需等待。
- **WebGPU** 路径：`WebGPURenderer` — 异步 `init()`。无 `setEffects` 能力（`supportsWebGLEffects = false`），后处理在 RenderPipeline TSL 图中完成。

### 2.2 场景图构建

```
threeScene (THREE.Scene)
├─ fallbackAmbientLight (THREE.AmbientLight)     // 夜间兜底环境光
├─ sunLightSource (SunDirectionalLight)           // 太阳方向光（light-source 模式）
├─ skyLightSource (SkyLightProbe)                 // 天空光探针（light-source 模式）
├─ moonLightSource (SunDirectionalLight)          // 月光（light-source 模式）
├─ nightAmbientLightSource (THREE.AmbientLight)   // 夜间环境光（light-source 模式）
├─ stars (THREE.Points<StarsMaterial>)            // 星空粒子
├─ surfaceTileset.group                           // 地表/裸球
├─ terrainTileset.group (if terrain)              // 地形
├─ sceneTilesets[].group                          // 独立 3D Tiles 场景
├─ tellux-entities (THREE.Group)                  // 实体根节点
└─ gltf-models (THREE.Group)                      // glTF 模型
```

### 2.3 子系统创建顺序

```
1. threeCamera (PerspectiveCamera)
2. rendererAdapter → renderer, ready
3. Scene (settings + state appliers)
4. AtmosphereManager (WebGL) / WebGPUAtmosphereManager (WebGPU)
   ├─ patchAerialPerspectiveShader → 注入 Tellux uniforms
   ├─ patchCloudsNightLighting → 注入夜间光照 uniforms
   ├─ patchStarsRendering → 注入星星渲染 patches
   └─ loadTextures() → 异步加载预计算大气 LUT + 云纹理
5. Clock → 监听太阳方向更新
6. TilesetManager → 地表 + 地形 + 场景 3D Tiles
7. PostProcessingManager (仅 WebGL)
   ├─ NormalPass → 为大气效果提供 normal buffer
   ├─ 可选云+大气 / 纯大气 pass
   ├─ LensFlareEffect
   ├─ SMAAEffect
   └─ DitheringEffect
8. EntityManager + EntityRenderManager (OIT)
9. ModelManager (glTF 加载)
10. ViewerRenderLoop (requestAnimationFrame 驱动)
```

---

## 3. 每帧渲染循环

`renderFrame(deltaTime, time)` 按以下顺序执行：

### 3.1 帧前准备

```
1. clearFrameBuffer()                    // 清空 color + depth + stencil
2. clock.tick(deltaTime)                 // 推进时钟 → 触发 sunDirection 更新
3. postProcessing.setDeltaTime(deltaTime)// 传递 dt 到所有 effect adapter
4. resize()                              // 同步渲染器/camera 尺寸到容器
5. controls.update()                     // 更新 GlobeControls（惯性、阻尼）
6. widgets.update(deltaTime, time)       // 更新调试面板 / 时间线
```

### 3.2 场景更新

```
7. syncFallbackAmbientLight()            // 从相机高度计算兜底环境光强度
8. postProcessing.updateForCameraHeight()// 判断是否渲染云（>27km 关闭）
9. tilesets.update()                     // 3D Tiles 瓦片加载/卸载 + LoD
10. atmosphere.setAtmosphereVisible()    // WebGPU: 控制大气可见性
11. atmosphere.updateLightSources()      // 同步相机位置到光源 target
12. models.update(deltaTime)             // glTF 动画推进
13. entitiesManager.update(deltaTime)    // 实体位置/状态更新
```

### 3.3 渲染提交

```
14. entityRenderManager.beginFrame()     // OIT 模式: 隐藏主场景透明实体
15. rendererAdapter.render(scene, camera)
    ├─ WebGL: renderer.render() → setEffects 通道执行后处理
    └─ WebGPU: renderDelegate() → RenderPipeline.render()
```

---

## 4. RendererAdapter 双层抽象

[src/rendering/RendererAdapter.ts](../src/rendering/RendererAdapter.ts) 提供了 WebGL 和 WebGPU 的统一接口：

```ts
interface TelluxRendererAdapter {
  readonly type: 'webgl' | 'webgpu'
  readonly renderer: TelluxRenderer
  readonly supportsWebGLEffects: boolean   // WebGPU = false
  readonly ready: Promise<void>             // WebGPU 异步 init
  render(scene, camera): void
  setAnimationLoop(callback): void
  setRenderDelegate(delegate | null): void  // WebGPU 专用
  // ... size/pixelRatio/clear 等
}
```

### WebGL 路径

- `THREE.WebGLRenderer` + `outputBufferType: HalfFloatType`
- `supportsWebGLEffects = true` — 后处理由 `postprocessing` 库的 `EffectPass` 链完成
- `setEffects()` 挂载在 renderer 上，每帧依次执行 Normal → Cloud+Atmosphere → ... → Dithering

### WebGPU 路径

- `THREE.WebGPURenderer` + 异步 `init()`
- `supportsWebGLEffects = false` — 无 `setEffects` 机制
- 通过 `renderDelegate` 回调接管渲染，内部使用 `RenderPipeline` + TSL 节点图
- 大气效果由 `WebGPUAtmosphereManager` 在 TSL 图中内联（`aerialPerspective + sky`）

---

## 5. Tileset 管线

[src/tiles/TilesetManager.ts](../src/tiles/TilesetManager.ts) 管理三类 3D Tiles：

### 5.1 地表（Surface Tileset）

`SurfaceTilesetFactory` 创建无几何底图，使用 `GeneratedSurfacePlugin` 生成 WGS84 椭球表面：

```
SurfaceTilesetFactory.create(layers)
  ├─ GeneratedSurfacePlugin(shape: 'ellipsoid')       // 生成椭球网格
  ├─ ImageryOverlayPlugin                              // 影像叠加
  ├─ SurfaceMaterialPlugin                             // basic/standard 材质模式
  ├─ TilesFadePlugin                                   // 瓦片淡入淡出
  └─ UpdateOnChangePlugin                              // 变更自动重渲染
```

- 当无地形时，地表 tileset 显示（`group.visible = true`）
- 当地形启用时，地表 tileset 隐藏（`group.visible = false`），地形 tileset 接管

### 5.2 地形（Terrain Tileset）

`TerrainTilesetFactory` 创建 Cesium quantized-mesh 地形：

```
TerrainTilesetFactory.create(terrainOptions, layers)
  ├─ CesiumIonAuthPlugin / URL 数据源
  ├─ GeneratedSurfacePlugin（无 imagery 时的 fallback 裸球）
  ├─ ImageryOverlayPlugin
  ├─ SurfaceMaterialPlugin
  └─ 公共插件（Fade + UpdateOnChange）
```

- 运行时 `setTerrain()` 可热切换地形/无地形模式
- 切换时重建 terrain tileset 并同步 surface visibility

### 5.3 场景 3D Tiles（独立场景）

通过 `load3DTileset()` 加载的建筑、点云等独立 3D Tiles：

```
load3DTileset(options)
  ├─ type: 'url' → 直接 URL
  └─ type: 'cesium-ion' → CesiumIonAuthPlugin
  ├─ GLTFExtensionsPlugin (dracoLoader + materialsUnlitCompatibility)
  ├─ TileCreasedNormalsPlugin (可选)
  ├─ TilesFadePlugin
  ├─ UpdateOnChangePlugin
  └─ SceneTilesetMaterialPlugin (basic/standard)
      └─ 或 TileUnlitMaterialPlugin (unlit 模式)
```

### 5.4 影像叠加管线

`ImageryOverlayFactory` 将 `LayerManager` 中的影像图层转换为 `ImageOverlay`：

```
LayerManager (影像图层)
  ├─ XYZImagerySource → TilesRenderer ImageOverlay
  ├─ WMSImagerySource → TilesRenderer ImageOverlay
  ├─ GeoJSONImagerySource → GeoJSON overlay
  └─ MVTImagerySource → MVT overlay
```

- 每帧 `tilesets.update()` 驱动 3d-tiles-renderer 内部的瓦片加载/卸载
- 影像图层 order 变化、visibility 变化、style 变化都触发增量 overlay 更新

---

## 6. 大气与天空管线

### 6.1 WebGL 路径：AtmosphereManager

[src/rendering/AtmosphereManager.ts](../src/rendering/AtmosphereManager.ts) 是核心编排器：

**初始化阶段：**

```
AtmosphereManager(renderer, camera)
  ├─ AerialPerspectiveEffect(camera)
  │   └─ patchAerialPerspectiveShader() → 注入 10 个 Tellux uniform
  ├─ StarsMaterial + StarsGeometry
  │   └─ patchStarsRendering() → 注入星光点遮罩 + 日夜混合
  ├─ SunDirectionalLight (初始不可见)
  ├─ SkyLightProbe (初始不可见)
  ├─ MoonDirectionalLight (初始不可见)
  ├─ AmbientLight(nightColor, 0) (初始不可见)
  ├─ CloudsEffect(camera)
  │   └─ patchCloudsNightLighting() → 注入夜间云光照
  ├─ PrecomputedTexturesGenerator → 预计算大气散射 LUT
  └─ PMREMGenerator + RoomEnvironment → 材质环境贴图
```

**纹理异步加载：**
```
loadTextures()
  ├─ texturesGenerator.update() → transmittance/inscatter/irradiance 纹理
  ├─ loadStarsData() → 星表 buffer → StarsGeometry
  ├─ loadCloudTexture('localWeather') → 局部天气纹理
  ├─ loadCloudTexture('turbulence') → 湍流纹理
  ├─ loadData3DTexture('shape') → 云形状 3D 纹理 (128³)
  ├─ loadData3DTexture('shapeDetail') → 云细节 3D 纹理 (32³)
  └─ loadSTBNTexture('stbn') → 随机噪声纹理
```

**每帧更新：**
```
updateSunDirection(currentTime)
  ├─ getSunDirectionECEF / getMoonDirectionECEF → 计算日/月方向
  ├─ 同步到 aerialPerspectiveEffect / cloudsEffect / starsMaterial
  ├─ 同步到 sunLightSource / skyLightSource / moonLightSource
  ├─ updateNightLights() → 计算夜间光照强度（基于日/月角度、相机高度）
  └─ 更新所有 post-process / clouds / stars 的夜间 uniform

updateLightSources()
  ├─ 相机世界位置 → sunLightSource/moonLightSource target
  ├─ worldToECEFMatrix 同步到所有 light source
  └─ updateNightLights()
```

### 6.2 WebGPU 路径：WebGPUAtmosphereManager

[src/rendering/WebGPUAtmosphereManager.ts](../src/rendering/WebGPUAtmosphereManager.ts) 使用 TSL (Three.js Shading Language)：

```
WebGPUAtmosphereManager(rendererAdapter, renderer, scene, camera)
  ├─ AtmosphereContext → 大气参数
  ├─ registerAtmosphereLightNode() → 注册自定义光源类型
  ├─ scenePass = pass(scene, camera) → TSL 场景 pass
  ├─ skyNode = sky() → TSL 天空节点
  ├─ aerialPerspectiveNode = aerialPerspective(scenePass, depth, null)
  │   └─ skyNode 挂载到 aerialPerspective
  ├─ outputNode = context(aerialPerspective, { getAtmosphere })
  └─ RenderPipeline(renderer, outputNode) → 替代默认渲染
```

- 无独立后处理 pass — 大气效果内联到渲染管线中
- 无 `setEffects` — 通过 `setRenderDelegate` 完全接管渲染
- 功能子集：无体积云、无 LensFlare/SMAA/Dithering
- 无夜间复杂光照（仅支持 moonScattering toggle）

### 6.3 星空渲染

`stars` 是 `THREE.Points<StarsMaterial>`：
- `frustumCulled = false` — 始终渲染（天空穹顶）
- `StarsMaterial` 使用预计算星表 buffer 生成 `StarsGeometry`
- Tellux patch 添加：点精灵软遮罩、暗星剔除、日夜混合因子（`telluxStarsDayLightFactor`）
- 星星强度 = `baseIntensity × starsAltitudeFactor × (1 + nightFactor × 2.5)`

---

## 7. 云渲染管线

`CloudsEffect` 是 Takram 体积云的后处理效果，运行在云 material 的内部 compute/render pass 上：

```
CloudsEffect
├─ 输入纹理: shape (128³), shapeDetail (32³), localWeather, turbulence, stbn
├─ 云层配置: 2 层 (offset [0, 250], height scale [1, 1.846])
├─ 阴影: cascadeCount=2, mapSize=512, splitMode='practical'
├─ 日夜混合: 通过 patch 注入的 5 个 uniform (moonIntensity, ambientIntensity, color, moonDirection, dayLightFactor)
└─ 大气合成: 云 atmosphereOverlay/Shadow/ShadowLength 喂给 AerialPerspective
```

**云可见性条件：**
- `scene.atmosphere.show === true`
- `scene.clouds.show === true`
- `cameraHeight !== null && cameraHeight < 27000m`

**EffectPass 组合：**
- 有云 + 有大气：`EffectPass(camera, cloudsEffect, aerialPerspectiveEffect)` — 云先渲染，大气合成叠加
- 无云 + 有大气：`EffectPass(camera, aerialPerspectiveEffect)` — 仅大气
- 无大气：跳过整个 atmosphere pass

---

## 8. 光照管线

### 8.1 两种光照模式

| 模式 | 光源 | 机制 | 适用场景 |
|---|---|---|---|
| `post-process`（默认） | 无 Three.js 光源 | 大气散射在 `AerialPerspectiveEffect` fragment shader 中直接累加 radiance | GIS/地形/影像 — 物理准确 |
| `light-source` | SunDirectionalLight + SkyLightProbe + Moon + Ambient | 标准 Three.js 光源照亮场景中所有 MeshStandardMaterial | glTF 模型、非 PBR 几何（ez-tree 等） |

### 8.2 Post-Process 模式详解

在 `post-process` 模式下：
- `aerialPerspectiveEffect.sunLight = true` → 大气 shader 在 `#if defined(SUN_LIGHT)` 分支计算直射光
- `aerialPerspectiveEffect.skyLight = true` → 大气 shader 在 `#if defined(SKY_LIGHT)` 分支计算天空散射光
- `sunLightSource/skyLightSource.visible = false` → 无 Three.js 光源
- 地表材质使用 `MeshBasicMaterial`（`toneMapped = false`），因为后处理 pass 已经做了完整的大气光照
- 场景 3D Tiles 材质也切换为 `basic` — 它们的 radiance 由大气后处理 pass 着色

**例外：`postProcessMaterialLights`** — 当模型需要环境贴图照明时，可以同时启用：
- `scene.environment = RoomEnvironment`（PMREM 生成）
- `scene.environmentIntensity = 1.35`
- 实体的光源强度乘上 `POST_PROCESS_MATERIAL_NIGHT_MOON_BOOST (2.2)` 和 `AMBIENT_BOOST (4)`

### 8.3 Light-Source 模式详解

- `sunLightSource/skyLightSource.visible = true`
- 地表材质切换为 `MeshStandardMaterial`（`toneMapped = true`）
- 场景 3D Tiles 材质也切换为 `standard`
- `aerialPerspectiveEffect.sunLight/skyLight = false` — 大气后处理只做散射/透射，不做直接光照

### 8.4 夜间光照

夜间光照在两种模式下都工作，由 `updateNightLights()` 计算：

```
nightFactor = 1 - smoothstep(sunAltitude, nightEnd, dayStart)
moonFactor = smoothstep(moonAltitude, 0, 0.08) × moonPhaseFactor

postProcessMoonIntensity = moonIntensity × nightFactor × moonFactor  (→ post-process)
postProcessAmbientIntensity = ambientIntensity × nightFactor          (→ post-process)

lightSourceMoonIntensity = postProcessMoon × boost (如果 materialLights)
lightSourceAmbientIntensity = postProcessAmbient × boost

nightSkyIntensity = (ambient × 0.07 + moon × 0.02) × altitudeFactor
nightSkyMoonGlowIntensity = moon × 0.45 × altitudeFactor
```

**高度衰减：**
- 夜空强度在 80km-600km 高度区间线性衰减
- 星星在 80km-600km 高度区间从 0 渐显到 1

### 8.5 兜底环境光

`fallbackAmbientLight` 是 `THREE.AmbientLight`，在无大气或高空时提供最低可见度：

```
intensity = baseIntensity × (1 - smoothstep(0, 100000, cameraHeight))
```

- 低空（< 80km）：大气后处理覆盖，兜底光基本不亮
- 高空（> 100km）：大气衰减，兜底光逐渐亮起
- 无大气模式（`atmosphere.show = false`）：直接使用 baseIntensity

---

## 9. 后处理管线

[src/rendering/PostProcessingManager.ts](../src/rendering/PostProcessingManager.ts) 管理 effect pass 链。仅在 WebGL 模式下存在。

### 9.1 Effect Pass 链

```
setEffects 顺序（不可交换, 因为需要 swap buffer 链）:

1. NormalPass(scene, camera)
   └─ 输出 RGBA HalfFloat normal 纹理 → 喂给 aerialPerspectiveEffect.normalBuffer

2. [可选] EntityRenderManager (OIT composite)
   └─ 仅在 weighted-oit 模式下且存在透明实体时

3. [条件] EffectPass(camera, cloudsEffect, aerialPerspectiveEffect)
   └─ 有云 + 有大气时：云渲染 → 大气合成云 overlay/shadow

4. [条件] EffectPass(camera, aerialPerspectiveEffect)
   └─ 有大气无云时：仅大气

5. [可选] EffectPass(camera, LensFlareEffect)
   └─ lensFlare.enabled = true

6. [可选] EffectPass(camera, SMAAEffect)
   └─ smaa.enabled = true

7. [可选] EffectPass(camera, DitheringEffect)
   └─ dithering.enabled = true
```

### 9.2 EffectPassAdapter

每个 `EffectPass` 通过 `EffectPassAdapter` 适配为 Three.js `Effect` 接口：

- **懒初始化**：首次 `render()` 才调用 `pass.initialize()`
- **depth texture 传递**：将 readBuffer 的 depthTexture 传给需要 depth 的 pass（如大气需要深度做散射积分）
- **camera settings 同步**：每帧将 camera near/far 同步到 pass 的 fullscreenMaterial
- **deltaTime 传递**：用于时间相关的效果（云动画）

### 9.3 WebGPU 无后处理

WebGPU 模式下 `supportsWebGLEffects = false`，`PostProcessingManager` 不会被创建。大气效果完全在 `WebGPUAtmosphereManager` 的 TSL 节点图中完成，无 LensFlare / SMAA / Dithering。

---

## 10. 实体渲染管线

[src/entities/EntityRenderManager.ts](../src/entities/EntityRenderManager.ts)

### 10.1 实体场景组织

```
threeScene
└─ tellux-entities (THREE.Group)
   ├─ entity-1 (THREE.Object3D)  // 点、线、面 graphic
   ├─ entity-2
   └─ ...
```

### 10.2 透明度模式

| 模式 | 实现 | 说明 |
|---|---|---|
| `sorted` | Three.js 默认 | 按距离排序渲染透明对象 |
| `weighted-oit` | 自研 OIT | Weighted Blended Order-Independent Transparency |
| `auto` | 自动选择 | WebGL → weighted-oit, WebGPU → sorted (fallback) |

### 10.3 Weighted OIT 渲染流程

当启用 weighted-oit 时，`EntityRenderManager` 作为后处理 pass 插入 chain：

**beginFrame()：**
1. 恢复上一帧的 visibility（清理 `mainSceneHiddenObjects`）
2. 如果是 OIT 模式：遍历 `tellux-entities` 子树，隐藏所有透明实体（从主场景渲染中排除）

**render() → 作为 setEffects chain 中的 pass：**
```
1. 恢复主场景 visibility（防止上一帧异常退出导致残留）
2. 如果无透明实体或 depth texture 不可用 → 退回 sorted（needsSwap=false）
3. ensureTargets(width, height) → 创建/调整 accumulation + revealage render targets
4. renderEntities(accumulationTarget, 'accumulation')
   ├─ 替换透明实体材质为 accumulation shader (blend: One, One)
   ├─ 渲染到 HalfFloat RT（背景色 0, 0, 0, 0）
   └─ 还原原始材质
5. renderEntities(revealageTarget, 'revealage')
   ├─ 替换透明实体材质为 revealage shader (blend: Zero, OneMinusSrcAlpha)
   ├─ 渲染到 HalfFloat RT（背景色 1, 1, 1, 1）
   └─ 还原原始材质
6. renderComposite(writeBuffer, readBuffer, accumulation, revealage)
   ├─ 全屏 quad: mix(base.rgb, accumulation.rgb / accumulation.a, 1 - revealage.a)
   └─ 写入 writeBuffer
```

**OIT Shader 注入（onBeforeCompile）：**
```glsl
// 注入到每个透明实体的 fragment shader
uniform sampler2D telluxSceneDepth;
uniform vec2 telluxResolution;

void telluxDepthDiscard() {
  // 如果片元在场景不透明几何之后，丢弃
  if (gl_FragCoord.z > texture2D(telluxSceneDepth, uv).x + 1e-6) discard;
}

void telluxOitOutput() {
  telluxDepthDiscard();
  // accumulation: gl_FragColor = vec4(rgb * alpha, alpha)
  // revealage:    gl_FragColor = vec4(1, 1, 1, alpha)
}
```

---

## 11. RTC（Relative to Center）管线

[src/rendering/applyRTCInstancing.ts](../src/rendering/applyRTCInstancing.ts) + [src/rendering/RTCAutoUniforms.ts](../src/rendering/RTCAutoUniforms.ts)

### 11.1 问题

地球尺度下，ECEF 坐标可达 10⁷ 量级。Three.js 使用 32-bit float `modelViewMatrix`，直接放入 ECEF 平移会导致顶点抖动（~1m 级误差）。

### 11.2 方案：Cesium 风格 RTC

参考 Cesium `RTC_CENTER`，将实例的 ECEF 平移编码为高/低两个 `vec3`，在 shader 中重建：

```
ECEF 平移 = positionHigh + positionLow
RTE 位置  = (positionHigh - cameraHigh) + (positionLow - cameraLow) + localPosition
```

### 11.3 实现细节

**数据准备（CPU）：**
```ts
// setRTCMatrixAt(mesh, index, fullEcefMatrix):
//   1. fullEcefMatrix 包含完整 ECEF 平移 + 旋转 + 缩放
//   2. 从平移列提取 ECEF position → encodeCartesian3 (高/低 float 拆分)
//   3. positionHigh/Low InstancedBufferAttribute 写入编码值
//   4. instanceMatrix 平移列清零（仅保留旋转 + 缩放）
```

**Shader 注入（onBeforeCompile）：**
```glsl
// RTCAutoUniforms 提供:
uniform vec3 u_cameraHigh;       // 相机 ECEF 位置高位
uniform vec3 u_cameraLow;        // 相机 ECEF 位置低位
uniform mat4 u_viewMatrixRTE;    // view 矩阵去掉平移列（仅旋转）
uniform mat4 u_projectionMatrix; // 投影矩阵

attribute vec3 positionHigh;     // 实例 ECEF 高位
attribute vec3 positionLow;      // 实例 ECEF 低位

// 替换内置 <project_vertex>:
vec4 mvPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition; // 仅旋转+缩放
#endif
vec3 rtcHighDiff = positionHigh - u_cameraHigh;
vec3 rtcLowDiff = positionLow - u_cameraLow;
vec3 worldPosRTE = rtcHighDiff + rtcLowDiff + mvPosition.xyz;
mvPosition = u_viewMatrixRTE * vec4(worldPosRTE, 1.0);
gl_Position = u_projectionMatrix * mvPosition;
```

### 11.4 与 ez-tree 的 shader patch 冲突

ez-tree 风摆 shader 也改写 `<project_vertex>`，且整段替换 include（删除 instancing 块）。Tellux 的 `applyRTCInstancing` 对此做了双分支处理：

- **标准材质（include 占位符仍在）：** 直接替换 `#include <project_vertex>` 为 RTC 版本（含 instancing 块）
- **ez-tree 叶子材质（已经被替换为字面 shader）：** 用正则匹配 `mvPosition = modelViewMatrix * mvPosition; gl_Position = projectionMatrix * mvPosition;`，先补 instancing 块，再做 RTE 替换

**风险：** 字符串级 patch 链依赖 ez-tree 输出格式不变，升级可能静默失效。长期方案是 PositionPipeline 协议（见 [engine-ownership-and-dependency-strategy.md](./engine-ownership-and-dependency-strategy.md) §1）。

### 11.5 包围盒修正

RTC 清零了 `instanceMatrix` 平移，导致 `computeBoundingBox/Sphere` 把所有实例聚到原点。`applyRTCInstancing` 注入修正版 `computeBoundingBox/Sphere`：
- `computeBoundingBox`：逐个实例从 `positionHigh + positionLow` 还原 ECEF 位置，平移局部包围盒
- `computeBoundingSphere`：基于修正后的包围盒计算球心 + 最远实例距离

### 11.6 RTCAutoUniforms 生命周期

```
每个 RTC InstancedMesh:
  onBeforeRender → rtcUniforms.update()
    ├─ camera.updateMatrixWorld()
    ├─ encodeCartesian3(camera.position) → u_cameraHigh/Low
    ├─ u_viewMatrixRTE = camera.matrixWorldInverse, 平移列清零
    └─ u_projectionMatrix = camera.projectionMatrix (PerspectiveCamera)
```

多个 mesh 共享同一份 `RTCAutoUniforms`，Three.js 在 uniform 去重时合并上传。

---

## 12. 材质系统

[src/materials/materialMode.ts](../src/materials/materialMode.ts)

### 12.1 材质模式策略

| 场景 | 大气模式 | 地表材质 | 场景 Tileset 材质 | glTF 模型材质 |
|---|---|---|---|---|
| 默认 (post-process) | post-process | `MeshBasicMaterial` (toneMapped=false) | `basic` | `basic` |
| light-source | light-source | `MeshStandardMaterial` (toneMapped=true) | `standard` | `standard` |
| unlit | 任意 | — | `unlit` (保持原始材质) | — |

**原因：** post-process 模式下，大气散射在 AerialPerspectiveEffect 的 fragment shader 中直接累加 radiance。如果材质也是 `MeshStandardMaterial`，会叠加两次光照（标准光照 + 后处理光照），导致过曝。因此 post-process 模式统一用 `MeshBasicMaterial`，其颜色直接作为 albedo 输入给大气后处理。

### 12.2 运行时模式切换

`surfaceMaterialMode` 变化时：
```
scene.surface.materialMode 改变
  → onSurfaceMaterialModeChange 回调
  → Viewer.syncSurfaceMaterialMode()
  → TilesetManager.setSurfaceMaterial(mode, options)
  → TilesetManager.setSceneTilesetMaterialMode(mode)
  → ModelManager.setMaterialMode(mode)
```

---

## 13. Shader Patch 策略

Tellux 不修改 Takram 等第三方库源码，而是在运行时通过 shader patch 注入自定义 uniform 和逻辑。

### 13.1 AerialPerspectiveEffect Patches

[src/rendering/AtmosphereShaderPatches.ts:116-245](../src/rendering/AtmosphereShaderPatches.ts)

注入的 uniform/逻辑（全部带 `tellux` 前缀避免冲突）：

| Uniform | 用途 |
|---|---|
| `telluxInscatterIntensity` | 散射强度控制 |
| `telluxInscatterHorizonBlend` | 地平线散射混合开关 |
| `telluxInscatterHorizonRange` | 地平线散射角度范围 |
| `telluxPostProcessNightMoonIntensity` | 后处理夜间月光强度 |
| `telluxPostProcessNightAmbientIntensity` | 后处理夜间环境光强度 |
| `telluxPostProcessNightColor` | 夜间光颜色 |
| `telluxPostProcessNightSkyIntensity` | 夜空散射强度 |
| `telluxPostProcessNightMoonGlowIntensity` | 月晕强度 |
| `telluxPostProcessDayLightFactor` | 日夜过渡因子 |

**Patch 注入点（正则替换）：**
1. uniform 声明 → 在 `uniform float albedoScale;` 后追加
2. 天空 radiance → 在 `getSkyRadiance(...)` 后追加 `× dayLightFactor`
3. 夜空 → 在 `outputColor.a = 1.0; #else // SKY` 前注入地平线辉光 + 月晕
4. 地面夜间光照 → 在 `#endif // defined(SUN_LIGHT)` 后注入 moon/ambient diffuse
5. 散射遮罩 → 替换 `radiance = radiance + inscatter;` 为带 inscatterIntensity × horizonMask × dayLightFactor 的版本

### 13.2 CloudsEffect Patches

[src/rendering/AtmosphereShaderPatches.ts:247-348](../src/rendering/AtmosphereShaderPatches.ts)

| Uniform | 用途 |
|---|---|
| `telluxCloudsNightMoonIntensity` | 云夜间月光强度 |
| `telluxCloudsNightAmbientIntensity` | 云夜间环境光强度 |
| `telluxCloudsNightColor` | 云夜间光颜色 |
| `telluxCloudsNightMoonDirection` | 云夜间月光方向 |
| `telluxCloudsDayLightFactor` | 云日夜过渡因子 |

**Patch 注入点：**
1. 地面光照（sun + sky irradiance）× dayLightFactor
2. 云体积光照（sun + sky irradiance）× dayLightFactor
3. Haze 光照 × dayLightFactor
4. Aerial perspective 合成 × dayLightFactor
5. 夜间云光照注入（moon diffuse + moon phase + ambient）

### 13.3 StarsMaterial Patches

[src/rendering/AtmosphereShaderPatches.ts:49-114](../src/rendering/AtmosphereShaderPatches.ts)

| 注入 | 用途 |
|---|---|
| `telluxStarsDayLightFactor` | 星星日夜过渡 |
| 点精灵软遮罩 | `smoothstep(0.18, 1.0, radius)` — 让星星呈现圆形软边缘 |
| 暗星剔除 | `smoothstep(0.006, 0.035, brightness)` — 剔除不可见暗星 |
| 背景色混合 | 白天: `radiance × dayLightFactor`；夜间: `mix(white, transmittance, dayLightFactor) × starColor` |

### 13.4 失败检测

每个 patch 函数在替换失败时输出 `console.warn`，标记 `material.needsUpdate = true`（确保原始 shader 仍然被重新编译）。这提供了最低限度的静默失效检测。

---

## 14. WebGL vs WebGPU 对比

| 能力 | WebGL | WebGPU |
|---|---|---|
| 大气散射 | AerialPerspectiveEffect (后处理) | AerialPerspectiveNode (TSL 内联) |
| 体积云 | CloudsEffect (后处理) | ❌ 不支持 |
| 后处理 chain | Normal → Cloud+Atmo → Atmo → LensFlare → SMAA → Dithering | 无独立后处理 |
| 星空 | StarsMaterial + patch | ❌ 不支持 (showStars = false) |
| 夜间光照 | 完整 (moon + ambient + color + transition) | 仅 moonScattering toggle |
| 光照模式 | post-process / light-source | post-process / light-source |
| OIT 实体 | sorted / weighted-oit | 仅 sorted |
| RTC 实例化 | onBeforeCompile 注入 | ⚠️ onBeforeCompile 不可用 |
| Tone mapping | AgX (Three.js built-in) | AgX (Three.js built-in) |
| 初始化 | 同步 | 异步 init() |

---

## 15. 关键数据流总结

```
用户配置 (ViewerOptions)
  │
  ├─ Scene (settings) ──→ SceneStateAppliers ──→ AtmosphereManager.applyAtmosphereState()
  │                                               └─→ CloudsEffect / AerialPerspectiveEffect / lights
  │
  ├─ Clock.currentTime ──→ AtmosphereManager.updateSunDirection()
  │                         └─→ sunDirection / moonDirection → 所有子效果
  │
  ├─ LayerManager ──→ TilesetManager ──→ ImageryOverlayFactory
  │                    │                  └─→ SurfaceTileset / TerrainTileset
  │                    └─→ 3d-tiles-renderer (TilesRenderer.update)
  │
  ├─ EntityManager ──→ EntityRenderManager ──→ OIT pass (在后处理 chain 中)
  │
  └─ ModelManager ──→ glTF 加载 → 场景图中的模型节点
```

---

## 16. 关联文档

- 引擎能力边界：[engine-ownership-and-dependency-strategy.md](./engine-ownership-and-dependency-strategy.md)
- 贴地 Entity 实现：[ground-clamp.md](./ground-clamp.md)
- 坑点记录：ez-tree 风摆与 RTC 争抢 project_vertex
- 坑点记录：WebGPU 下 onBeforeCompile 机制失效
