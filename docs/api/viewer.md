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

统一的场景模拟时钟。当前内置消费者是太阳、月亮、大气和 Timeline；应用可以通过事件将实体、轨迹或其他业务状态接入同一时间源。

初始化时，`currentTime` 支持 `Date | string | number`：

```ts
const viewer = new Viewer(container, {
  clock: {
    currentTime: new Date('2026-09-01T08:00:00Z'),
    shouldAnimate: true,
    multiplier: 3600
  },
  widgets: {
    timeline: true
  }
})
```

运行时 `currentTime` 只接受有效的 `Date`。读取和赋值都会复制对象，因此原地修改返回值不会绕过 Clock 的状态通知：

```ts
viewer.clock.currentTime = new Date()
viewer.clock.shouldAnimate = false
viewer.clock.multiplier = -60 // 负倍率表示倒放

viewer.clock.on('change', (event) => {
  console.log(event.reason, event.currentTime)
})
```

`tick(deltaSeconds)` 接受非负有限秒数，并返回当前时间副本。Viewer 默认在渲染循环中自动调用它；使用 Viewer 时不要再从应用侧重复推进。

启用 Timeline 时，控件按浏览器本地时区显示日期和时刻，以 `+8`、`-5` 等 UTC 偏移量标识时区，并以本地自然日作为默认范围；`Clock.currentTime` 仍然表示与时区无关的绝对时间点。

Timeline 启用后，若未提供 Clock 配置，时间默认从当前真实时间开始以 `1×` 持续流动；如需初始暂停，显式设置 `clock.shouldAnimate: false`。

### `overlays`

类型：`LayerManager`

表面叠加图层管理器（影像 / WMS / WMTS / MVT / GeoJSON）。提供 `add()`、`get()`、`list()`、`remove()`。

### `tilesets`

类型：`SceneTilesetCollection`

独立场景 3D Tiles 集合。提供 `add()`、`get()`、`list()`、`remove()`。不要与 {@link globe} 混淆：后者是裸球 / 地形表面。

### `models`

类型：`ModelManager`

glTF 模型集合。`add(options)` 加载 glTF / GLB 并按经纬高放入场景。返回的 `ModelLayer.ready` 在加载失败或加载完成前移除模型时拒绝；需要感知错误时应显式 `await` 或 `catch`。Tellux 会在内部观察该拒绝，因此只使用句柄而不等待 `ready` 时不会产生未处理 Promise 拒绝。

`lighting: 'local'` 保留点光和自发光，不被大气日夜因子当地表处理；省略时 `materialMode: 'preserve'` 默认为 `local`，`auto` 默认为 `globe`。

### `terrain`

类型：`Terrain`

地形门面。`set(options)` 切换 Cesium quantized-mesh / Ion / 天地图地形；`clear()` 回到无地形模式。URL 地形必须带 `type: 'url'`。

### `globe`

类型：`Globe`

地球表面（裸球或当前地形）。`show` 控制可见性且在切换地形后保持；`ellipsoid` 用于经纬高换算；`raw` 是底层 `TilesRenderer`。不要写 `globe.raw.group.visible`。

### `postProcess`

类型：`PostProcessSettings`

顶层后处理运行时设置（曝光、Bloom、TAA、SMAA 等）。与 `ViewerOptions.postProcess` 同构。色调映射曝光走 `viewer.postProcess.toneMappingExposure`，不要直接改 `renderer.raw.toneMappingExposure`。

### `highlighter`

类型：`HighlightManager`

统一高亮门面：`set` / `clear` / `setHover`，以及 `outline` / `overlay` 样式。初始化配置是 `ViewerOptions.highlighter`。

### `hism`

类型：`HismManager`

HISM 实例化图层管理器。提供 `add()`、`get()`、`list()`、`remove()`、`pick()`、`getRuntimeStats()` 以及 `rtcUniforms`（自定义材质接入 RTC 时使用）。

### `entities`

类型：`EntityManager`

点 / 线 / 面实体集合。

### `controls`

类型：`ViewerControls`

地球交互控制器。公开类型已收窄；完整上游 API 在 `controls.raw`（与 `controls` 同一实例）。

### `renderer`

类型：`ViewerRenderer`

渲染器门面。`type` 为 `'webgl' | 'webgpu'`；`resolutionScale` 是像素比；原生 Three.js renderer 是 `renderer.raw`。不要调用 `renderer.raw.setPixelRatio()`。

### `ready`

类型：`Promise<void>`

renderer 初始化完成的就绪 Promise。`Viewer.create(...)` 会内部 `await` 它并在失败时自动销毁 Viewer。使用 `new Viewer(...)` + WebGPU 或外部手动渲染循环时，建议先 `await viewer.ready` 再操作；若 Promise 拒绝，调用方仍需执行 `viewer.destroy()`。

### `useDefaultRenderLoop`

类型：`boolean`（可读写）

Tellux 是否接管动画循环。默认 `true`。设为 `false` 后需自行调用 `viewer.render()` 推进渲染；此时 `sampleHeightMostDetailed` 等依赖每帧更新的任务也需要调用方手动推进。

## 方法

### `on(type, listener)`

注册 Viewer 事件监听函数。

```ts
viewer.on('click', (event) => {
  console.log(event.cartographic)
})
```

### `off(type, listener)`

移除 Viewer 事件监听函数。

### `cartographicToVector3(input, target?)`

将经纬高转换为底层 Three.js 世界坐标。

### `cartographicToMatrix4(input, options?, target?)`

将经纬高和当地姿态转换为 Three.js 对象矩阵。

### `flyToTarget(target, options?)`

平滑飞行到目标，并让相机最终看向目标点。

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

### `sampleHeight(point, options?)` / `sampleHeight(points, options?)`

沿当地地表法线向下采样指定经纬度在当前已加载内容上的表面高度。同步、轻量，不请求视角外瓦片；未命中返回 `undefined`。高度 `0` 是命中，用 `=== undefined` 判断 miss。`point` 为 `LonLatLike`：`{ longitude, latitude }` 或 `[经度, 纬度]`。传入数组时返回与输入等长的 `(number | undefined)[]`，逐元素与单点调用相等。`options.source` 可选 `'all'`（默认）、`'terrain'`、`'tileset'`。

```ts
const height = viewer.sampleHeight([121.4737, 31.2304], { source: 'terrain' })
```

### `sampleHeightMostDetailed(point, options?)` / `sampleHeightMostDetailed(points, options?)`

异步、高精度采样地表高度。单点返回 `Promise<number | undefined>`；批量返回与输入数组一一对应的 `Promise<(number | undefined)[]>`。未命中项为 `undefined`。会主动加载所需层级瓦片：地形模式按 quantized-mesh availability 加载最高层级并插值；3D Tiles / 混合模式在主场景临时添加局部加载区域，采样完成后该区域保留在主场景缓存中。

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

`viewer.models` 只公开 `add` / `get` / `list` / `remove`。动画推进、材质模式同步和销毁由 Viewer 管理。`ModelManager`、`Globe`、`Terrain`、`SceneTilesetCollection`、`ViewerRenderer` 为 Viewer 创建的门面，构造器不公开；类导出用于类型与实例识别。
