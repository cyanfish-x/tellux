# Viewer API

`Viewer` 是 Tellux 的主要公开类。

```ts
const viewer = new tellux.Viewer(container, options)
const viewerById = new tellux.Viewer('viewer', options)

// 异步工厂，等待 renderer 初始化完成（WebGPU 推荐）
const viewer = await tellux.Viewer.create(container, options)
```

## 构造参数

### `static create(container, options)`

异步工厂方法，创建 Viewer 并等待 renderer 初始化完成。WebGPU renderer 必须异步初始化，外部手动渲染循环场景也推荐用它。初始化失败时，已创建的 canvas、监听器、manager 和 GPU 资源会自动销毁。返回 `Promise<Viewer>`。

```ts
const viewer = await tellux.Viewer.create(container, {
  renderer: { type: 'webgpu' }
})
```

### `container`

类型：`HTMLElement | string`

接收 WebGL canvas 的容器元素，或容器元素的 `id`。传入字符串时会通过 `document.getElementById(...)` 查找元素；容器需要有有效宽高。

### `options`

类型：`ViewerOptions`

用于配置地形、影像图层、相机、场景效果、渲染循环和资源路径。

## 属性

### `scene`

类型：`Scene`

场景控制项和底层 Three.js 场景入口。

### `camera`

类型：`Camera`

带 Cesium 风格视角辅助方法的相机控制项。

### `clock`

类型：`Clock`

用于太阳方向和时间推进的场景时钟。

### `layers`

类型：`LayerManager`

影像图层管理器。

### `terrain`

类型：`TerrainRuntime`

地形运行时 facade。`terrain.set(options)` 切换地形，`terrain.options` 返回当前只读配置快照，`terrain.observeTiles(...)` 观察流式瓦片，`terrain.addMaterialDecorator(...)` 注册受控材质装饰器。旧的 `viewer.setTerrain(...)` 仍是 `viewer.terrain.set(...)` 的兼容别名。

### `hism`

类型：`HismManager`

HISM 实例化图层管理器。提供 `add()`、`get()`、`list()`、`remove()`、`pick()`、`getRuntimeStats()` 以及 `rtcUniforms`（自定义材质接入 RTC 时使用）。等价于 `viewer.addHismLayer()` 等 Viewer 级方法的底层入口。

### `tileset`

底层 3D Tiles renderer。启用地形时返回地形渲染器，否则返回基础裸球渲染器。

### `controls`

类型：`GlobeControls`

地球交互控制器，负责鼠标拖拽、滚轮缩放和平移等场景交互。

### `renderer`

类型：`TelluxRenderer`（`TelluxWebGLRenderer | TelluxWebGPURenderer`）

底层 Three.js renderer 实例。`renderer.type`（`renderer` 配置）决定具体类型，默认为 `webgl`。

### `ready`

类型：`Promise<void>`

renderer 初始化完成的就绪 Promise。`Viewer.create(...)` 会内部 `await` 它并在失败时自动销毁 Viewer。使用 `new Viewer(...)` + WebGPU 或外部手动渲染循环时，建议先 `await viewer.ready` 再操作；若 Promise 拒绝，调用方仍需执行 `viewer.destroy()`。

### `useDefaultRenderLoop`

类型：`boolean`（可读写）

Tellux 是否接管动画循环。默认 `true`。设为 `false` 后需自行调用 `viewer.render()` 推进渲染；此时 `sampleHeightMostDetailed` 等依赖每帧更新的任务也需要调用方手动推进。

### `resolutionScale`

类型：`number`（可读写）

渲染器像素比，默认通常为设备像素比。降低可提升性能。

### `toneMappingExposure`

类型：`number`（可读写）

渲染器色调映射曝光值。对应 `renderer.toneMappingExposure`，可运行时调整。

## 方法

### `on(type, listener)`

注册 Viewer 事件监听函数。

```ts
viewer.on('click', (event) => {
  console.log(event.cartographic)
})

viewer.on('preRender', ({ deltaTime, time }) => {
  // Tellux 已完成本帧地形/模型/实体更新，尚未提交最终 render。
  updateCustomEffect(deltaTime, time)
})
```

`preRender` 在默认循环和手动 `viewer.render()` 中具有相同顺序。监听器按注册顺序执行、相同函数去重；`on` / `off` 返回 Viewer 以支持链式调用，重复 `off` 同一函数是安全的。监听器异常向上传播。需要逐帧接入的扩展应使用此事件，不要另建 `requestAnimationFrame`。

### `off(type, listener)`

移除 Viewer 事件监听函数。

### `cartographicToVector3(input, target?)`

将经纬高转换为底层 Three.js 世界坐标。

### `cartographicToMatrix4(input, options?, target?)`

将经纬高和当地姿态转换为 Three.js 对象矩阵。

### `addModel(options)`

加载 glTF / GLB 模型并按经纬高加入场景。返回的 `ModelLayer.ready` 在加载失败或加载完成前移除模型时拒绝；需要感知错误时应显式 `await` 或 `catch`。Tellux 会在内部观察该拒绝，因此只使用句柄而不等待 `ready` 时不会产生未处理 Promise 拒绝。

### `flyToTarget(target, options?)`

平滑飞行到目标，并让相机最终看向目标点。

### `setTerrain(terrain)`

运行时切换 Cesium quantized-mesh 地形。传入 `null` 可回到无地形模式。它是 `viewer.terrain.set(terrain)` 的兼容别名。

### `load3DTileset(options)`

加载独立的 3D Tiles 场景数据。

### `get3DTileset(id)`

根据 id 获取已加载的 3D Tiles renderer。

### `remove3DTileset(id)`

根据 id 移除已加载的 3D Tiles 图层。

### `pickCartographic(position)`

获取屏幕位置对应的经纬高坐标。优先命中已加载的 3D Tiles，未命中时回退到 WGS84 椭球表面；两者都未命中返回 `null`。只使用当前已加载的内容，不额外请求瓦片。

```ts
const coord = viewer.pickCartographic({ x: 400, y: 300 })
```

### `pick(position, options?)` / `pickAll(position, options?)`

统一对象拾取。`pick` 返回全局最近的 `ViewerPickResult`；`pickAll` 对每个逻辑对象只返回一次，并返回跨层全局排序、由近到远的全部命中。默认 `layers` 为 `['entity', 'hismInstance', 'tilesFeature']`；传入 `root` 且未指定 `layers` 时只测 `object` 层。无 HISM 图层时自动跳过 `hismInstance`。

```ts
const hit = viewer.pick({ x: 400, y: 300 })
if (hit?.type === 'tilesFeature') console.log(hit.feature.properties)

const modelHit = viewer.pick(pos, { root: model.root })
const hismHit = viewer.pick(pos, { layers: ['hismInstance'] })
const firstTenHits = viewer.pickAll(pos, { limit: 10 })
```

`options` 支持 `layers`、`root`、`recursive`、`tolerance`（点/线实体屏幕容差，CSS 像素）和 `limit`（全局排序后截取的最大结果数，默认不限制）。`limit` 不会减少各层内部射线遍历；高频调用仍应收窄 `layers` 并节流。

### `addHismLayer(options)`

添加 HISM 实例化图层，用于大规模静态 mesh（森林、岩石场等）。返回 `HismLayer` 句柄，支持 `show` 与 `remove()`。配置见 [HISM 指南](../guide/hism.md)。

### `getHismLayer(id)` / `removeHismLayer(id)` / `getHismRuntimeStats()`

按 id 获取或移除 HISM 图层；`getHismRuntimeStats()` 返回全局可见实例数、簇数、draw calls 与各 LOD 分布。

### `sampleHeight(position, options?)`

沿当地地表法线向下采样指定经纬度在当前已加载内容上的表面高度。同步、轻量，不请求视角外瓦片；未命中返回 `undefined`。`position` 支持元组 `[经度, 纬度, 高度?]` 或 `{ longitude, latitude, height }`。`options.source` 可选 `'all'`（默认）、`'terrain'`、`'tileset'`。

```ts
const height = viewer.sampleHeight([121.4737, 31.2304], { source: 'terrain' })
```

### `sampleHeightMostDetailed(positions, options?)`

异步、高精度、批量采样多个经纬度的地表高度。返回 `Promise<SampleHeightMostDetailedResult[]>`，与输入数组一一对应，未命中项为 `undefined`。会主动加载所需层级瓦片：地形模式按 quantized-mesh availability 加载最高层级并插值；3D Tiles / 混合模式在主场景临时添加局部加载区域，采样完成后该区域保留在主场景缓存中。

当 `useDefaultRenderLoop` 为 `false` 时，调用方必须继续调用 `render()` 推进采样，否则会超时返回 `undefined`。`options` 支持 `source`、`resolution`（默认 `256`）、`maxFrames`（默认 `120`）和 `debug`。

terrain 切换、参与采样的图层结构变化或 `destroy()` 会取消未完成任务，并以 `AbortError` 拒绝 Promise；取消时不会返回部分结果。terrain 直采缓存采用有界 LRU（默认 2 个 layer resource、64 个 decoded tile），失败项可重试，切换 terrain 会清理旧缓存。

```ts
const results = await viewer.sampleHeightMostDetailed([
  [121.4737, 31.2304],
  [116.4074, 39.9042]
])
```

### `render(time?)`

渲染一帧，并返回以秒为单位的帧间隔。

### `resize()`

将渲染器和相机尺寸同步到容器尺寸。

### `destroy()`

释放 WebGL 资源、事件监听器、控制器和已加载纹理。
