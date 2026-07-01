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

异步工厂方法，创建 Viewer 并等待 renderer 初始化完成。WebGPU renderer 必须异步初始化，外部手动渲染循环场景也推荐用它。返回 `Promise<Viewer>`。

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

renderer 初始化完成的就绪 Promise。`Viewer.create(...)` 会内部 `await` 它；使用 `new Viewer(...)` + WebGPU 或外部手动渲染循环时，建议先 `await viewer.ready` 再操作。

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
```

### `off(type, listener)`

移除 Viewer 事件监听函数。

### `cartographicToVector3(input, target?)`

将经纬高转换为底层 Three.js 世界坐标。

### `cartographicToMatrix4(input, options?, target?)`

将经纬高和当地姿态转换为 Three.js 对象矩阵。

### `addModel(options)`

加载 glTF / GLB 模型并按经纬高加入场景。

### `flyToTarget(target, options?)`

平滑飞行到目标，并让相机最终看向目标点。

### `setTerrain(terrain)`

运行时切换 Cesium quantized-mesh 地形。传入 `null` 可回到无地形模式。

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

### `pick3DTilesFeature(position)`

拾取屏幕位置对应的已加载 3D Tiles feature。只检查当前已加载的 3D Tiles 内容，不回退椭球表面，也不额外请求更精细瓦片；未命中返回 `null`。返回的 `Picked3DTilesFeature` 包含 `layerId`、`tileset`、`object`、`point`、`faceIndex`、`featureId`、`properties` 和 `cartographic` 字段。

```ts
const feature = viewer.pick3DTilesFeature({ x: 400, y: 300 })
if (feature) {
  console.log(feature.properties)
}
```

### `pickEntity(position, options?)`

拾取屏幕位置对应的最佳实体。点和线实体支持 `options.tolerance` 屏幕空间容差，单位为 CSS 像素；默认 `0`。面实体和体实体仍使用精确 raycaster 拾取。未命中时返回 `null`。

```ts
const entityHit = viewer.pickEntity({ x: 400, y: 300 }, { tolerance: 6 })
```

### `pickEntities(position, options?)`

拾取屏幕位置对应的实体列表，按距离从近到远排序。点和线实体支持 `options.tolerance` 屏幕空间容差；同一个实体如果多个图形同时命中，只返回该实体的最佳命中结果。未命中时返回空数组。

```ts
const entityHits = viewer.pickEntities({ x: 400, y: 300 }, { tolerance: 6 })
```

### `sampleHeight(position, options?)`

沿当地地表法线向下采样指定经纬度在当前已加载内容上的表面高度。同步、轻量，不请求视角外瓦片；未命中返回 `undefined`。`position` 支持元组 `[经度, 纬度, 高度?]` 或 `{ longitude, latitude, height }`。`options.source` 可选 `'all'`（默认）、`'terrain'`、`'tileset'`。

```ts
const height = viewer.sampleHeight([121.4737, 31.2304], { source: 'terrain' })
```

### `sampleHeightMostDetailed(positions, options?)`

异步、高精度、批量采样多个经纬度的地表高度。返回 `Promise<SampleHeightMostDetailedResult[]>`，与输入数组一一对应，未命中项为 `undefined`。会主动加载所需层级瓦片：地形模式按 quantized-mesh availability 加载最高层级并插值；3D Tiles / 混合模式在主场景临时添加局部加载区域，采样完成后该区域保留在主场景缓存中。

当 `useDefaultRenderLoop` 为 `false` 时，调用方必须继续调用 `render()` 推进采样，否则会超时返回 `undefined`。`options` 支持 `source`、`resolution`（默认 `256`）、`maxFrames`（默认 `120`）和 `debug`。

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
