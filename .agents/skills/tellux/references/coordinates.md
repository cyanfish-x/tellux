# 坐标系与自定义对象

把外部 Three.js 对象（marker、标签、自定义几何）按经纬度放到地球上的方法。

## 坐标约定速记

| 量 | 单位 |
| --- | --- |
| 纬度 / 经度 | 度 |
| 高度 | 米（WGS84 椭球海拔） |
| heading / pitch / roll | 度，相对当地东北天（ENU） |
| 太阳/月亮角半径 | 弧度 |

经纬高输入两种形式可混用：

```ts
// 元组：[经度, 纬度, 高度]  —— 注意顺序与 GeoJSON 一致
const tuple: [number, number, number] = [121.4737, 31.2304, 50]

// 对象
const object = { longitude: 121.4737, latitude: 31.2304, height: 50 }
```

底层 Three.js 场景用 **ECEF 世界坐标系**（原点地心，单位米），通常不需直接接触。

## 经纬高 → 世界坐标

`cartographicToVector3(input)` 返回 ECEF 世界坐标（米），`THREE.Vector3`：

```ts
const position = viewer.cartographicToVector3([121.4737, 31.2304, 50])
```

## 经纬高 → 对象矩阵（最常用）

`cartographicToMatrix4(input, options?)` 返回适合 Three.js 对象的 4×4 矩阵，可直接赋给 `Object3D.matrix`。该矩阵的当地框架：**`+Y` 指向当地上方，`+Z` 指向对象前方**（贴合 glTF 朝向习惯）。

```ts
const matrix = viewer.cartographicToMatrix4(
  { longitude: 121.4737, latitude: 31.2304, height: 50 },
  { heading: 45, pitch: 0, roll: 0 }
)

object.matrixAutoUpdate = false      // 必须关，否则下一帧被 position/rotation 覆盖
object.matrix.copy(matrix)
```

## 放置 glTF 模型

直接用 `addModel`，内部已处理矩阵和 Draco：

```ts
const model = viewer.addModel({
  type: 'gltf',
  url: '/models/wind-turbine.glb',
  coordinates: { longitude: 121.4737, latitude: 31.2304, height: 0 },
  heading: 180,
  scale: 1
})
```

贴合地形时先查高度：`const h = viewer.sampleHeight([121.4737, 31.2304]); coordinates.height = h ?? 0`。

## 放置自定义 Three.js 对象

```ts
import * as THREE from 'three'

const marker = new THREE.Mesh(
  new THREE.SphereGeometry(50),
  new THREE.MeshBasicMaterial({ color: 0xff3333 })
)
marker.matrixAutoUpdate = false
marker.matrix.copy(viewer.cartographicToMatrix4([121.4737, 31.2304, 100]))
viewer.scene.threeScene.add(marker)   // 加到这里参与 Tellux 渲染
```

> **尺度单位是米**。地球半径约 637 万米，半径 50 的球在地表尺度只是一个点，要看得见需放大或贴近查看。

## 世界坐标 → 经纬高（反向）

通常通过拾取接口完成（见 interaction.md）：

- 屏幕点 → 经纬高：`viewer.pickCartographic({ x, y })`
- 屏幕点 → feature（含经纬高）：`viewer.pick({ x, y }, { layers: ['tilesFeature'] })`
