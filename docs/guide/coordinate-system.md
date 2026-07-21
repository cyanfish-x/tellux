# 坐标系与自定义对象

GIS 应用经常需要把外部的 Three.js 对象（marker、标签、自定义几何、glTF 模型）按经纬度放到地球上。本章说明 Tellux 的坐标约定，以及把经纬高转换为 Three.js 坐标和矩阵的方法。

## 坐标约定

Tellux 在对外 API 中统一使用以下约定：

| 量 | 单位 / 约定 |
| --- | --- |
| 纬度 `latitude` | 度，`-90`（南极）到 `+90`（北极）。 |
| 经度 `longitude` | 度，`-180` 到 `+180`。 |
| 高度 `height` | 米，相对 WGS84 椭球面（海拔）。 |
| heading / pitch / roll | 度，相对当地东北天（ENU）坐标系。 |

经纬高的输入有两种形式，可以混用：

```ts
// 元组：顺序是 [经度, 纬度, 高度]
const tuple: [number, number, number] = [121.4737, 31.2304, 50]

// 对象
const object = { longitude: 121.4737, latitude: 31.2304, height: 50 }
```

::: warning 元组顺序是 [经度, 纬度]
元组输入遵循 GeoJSON 习惯，**第一个元素是经度、第二个是纬度**，与对象形式的 `{ longitude, latitude }` 字段名顺序相反，使用时注意区分。
:::

底层 Three.js 场景使用 **ECEF 世界坐标系**（原点在地心，单位米），通常不需要直接接触。

## 经纬高 → 世界坐标

`viewer.cartographicToVector3(input)` 把经纬高转换成底层 Three.js 世界坐标（ECEF，米），返回 `THREE.Vector3`：

```ts
const position = viewer.cartographicToVector3([121.4737, 31.2304, 50])
// position 是 ECEF 世界坐标，单位米
```

适合需要自己构造几何顶点、或在世界空间定位一个点的场景。

## 经纬高 → 对象矩阵

`viewer.cartographicToMatrix4(input, options?)` 把经纬高和当地姿态转换成一个**适合 Three.js 对象的 4×4 矩阵**，可以直接赋给 `Object3D.matrix`：

```ts
const matrix = viewer.cartographicToMatrix4(
  { longitude: 121.4737, latitude: 31.2304, height: 50 },
  { heading: 45, pitch: 0, roll: 0 }
)

object.matrixAutoUpdate = false
object.matrix.copy(matrix)
```

该矩阵使用**当地坐标框架**：

- `+Y` 指向当地上方（远离地心）
- `+Z` 指向对象前方

这个约定贴合 glTF 模型的朝向习惯，适合放置 glTF 模型、marker、标签锚点等需要贴合地球曲面的对象。

::: tip 关闭 matrixAutoUpdate
用矩阵直接定位时，记得把对象的 `matrixAutoUpdate` 设为 `false`，否则 Three.js 会在下一帧用 `position / rotation / scale` 覆盖你设置的矩阵。
:::

## 放置 glTF 模型

如果只是要加载一个 glTF / GLB 模型放到经纬度上，不必手动算矩阵，直接用 `viewer.addModel`：

```ts
const model = viewer.addModel({
  type: 'gltf',
  url: '/models/wind-turbine.glb',
  coordinates: {
    longitude: 121.4737,
    latitude: 31.2304,
    height: 0
  },
  heading: 180,        // 朝南
  scale: 1
})
```

`addModel` 内部已经处理了矩阵计算、光照模式下的材质适配和 Draco 解码。模型高度未指定时默认为 `0`（贴椭球面）；需要让模型贴合地形时，先用 `sampleHeight` 查询当地高度再传入。

## 放置自定义 Three.js 对象

放置自己构造的对象（如 `Mesh`、`Sprite`、`CSS2DObject` 标签）时，用 `cartographicToMatrix4`：

```ts
import * as THREE from 'three'

// 在经纬度处放一个红色小球
const marker = new THREE.Mesh(
  new THREE.SphereGeometry(50),
  new THREE.MeshBasicMaterial({ color: 0xff3333 })
)
marker.matrixAutoUpdate = false
marker.matrix.copy(
  viewer.cartographicToMatrix4([121.4737, 31.2304, 100])
)
viewer.scene.threeScene.add(marker)
```

`viewer.scene.threeScene` 是底层 Three.js `Scene`，自定义对象加到这里会参与 Tellux 的渲染。

::: tip 尺度单位是米
底层场景单位是米。地球半径约 637 万米，所以 marker 几何的尺寸要按"真实米"来理解——半径 `50` 的球在地球尺度上只是一个点，要看得见需要放大或贴近地表查看。
:::

## 世界坐标 → 经纬高

反向查询（把一个世界坐标点转回经纬高）通常通过拾取接口完成：

- 屏幕点 → 经纬高：`viewer.pickCartographic(position)`
- 屏幕点 → 3D Tiles feature（含经纬高）：`viewer.pick(position, { layers: ['tilesFeature'] })`，再读 `feature.cartographic`

详见「交互与拾取」。
