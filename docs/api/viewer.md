# Viewer API

`Viewer` 是 Tellux 的主要公开类。

```ts
const viewer = new tellux.Viewer(container, options)
```

## 构造参数

### `container`

类型：`HTMLElement`

接收 WebGL canvas 的容器元素。容器需要有有效宽高。

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

获取屏幕位置对应的经纬高坐标。

### `sampleHeight(position, options?)`

采样指定经纬度在当前已加载内容上的表面高度。

### `sampleHeightMostDetailed(positions, options?)`

以更高精度异步采样经纬度数组的表面高度。

### `render(time?)`

渲染一帧，并返回以秒为单位的帧间隔。

### `resize()`

将渲染器和相机尺寸同步到容器尺寸。

### `destroy()`

释放 WebGL 资源、事件监听器、控制器和已加载纹理。
