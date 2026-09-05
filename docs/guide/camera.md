# 相机控制

Tellux 的相机采用 Cesium 风格的视角模型，用 **经纬高 + heading / pitch / roll** 描述姿态，并提供飞行定位、瞬时切换和视角读取能力。

## 视角模型

所有相机视角都由六个参数描述：

| 参数 | 单位 | 说明 |
| --- | --- | --- |
| `latitude` | 度 | 相机所在纬度。 |
| `longitude` | 度 | 相机所在经度。 |
| `height` | 米 | 相机距椭球表面的高度（海拔）。 |
| `heading` | 度 | 航向角，相对当地正北顺时针，`0` 朝北、`90` 朝东。 |
| `pitch` | 度 | 俯仰角，`0` 水平、`-90` 垂直俯视地面、`+90` 仰视天空。 |
| `roll` | 度 | 翻滚角，通常为 `0`。 |

`heading`、`pitch`、`roll` 都是相对**当地东北天（ENU）坐标系**的，会随相机所在经纬度自动旋转到正确的当地姿态。

## 初始视角

在 `ViewerOptions.camera` 中设置初始视角：

```ts
const viewer = new tellux.Viewer(container, {
  camera: {
      destination: {
        longitude: 121.4737,
        latitude: 31.2304,
        height: 1200,
      },
      orientation: {
        heading: 0,
        pitch: -25,
        roll: 0,
      },
    }
})
```

## 飞行定位

`viewer.camera.flyTo(options)` 平滑飞行到一个新的相机位置和姿态。新飞行会自动取消尚未完成的旧飞行。

```ts
viewer.camera.flyTo({
  destination: {
    latitude: 39.9042,
    longitude: 116.4074,
    height: 1500
  },
  orientation: {
    heading: 45,
    pitch: -30,
    roll: 0
  },
  duration: 2,
  complete: () => {
    console.log('飞行完成')
  },
  cancel: () => {
    console.log('飞行被取消')
  }
})
```

`flyTo` 的关键参数：

| 参数 | 说明 |
| --- | --- |
| `destination` | 相机最终位置，必填。`height` 省略时沿用当前相机高度。 |
| `orientation` | 相机最终姿态，可选。 |
| `duration` | 飞行持续时间（秒）。省略时按起止视角距离自动估算。 |
| `maximumHeight` | 飞行最高高度（米）。设置后飞行路径会先升高再降落，形成弧线，避免长距离飞行贴地穿行。 |
| `easingFunction` | 控制时间插值的缓动函数，默认 `easeInOutCubic`。 |
| `complete` | 飞行完成回调。 |
| `cancel` | 飞行被新飞行、`setView` 或用户交互打断时的回调。 |

`flyTo` 返回 `void`，飞行结果通过 `complete` / `cancel` 回调感知。

### 飞向目标对象

如果想让相机最终**看向某个对象**（而不是停在某个点位），用 `viewer.flyToTarget(target, options)`。它支持三种目标：

```ts
// 飞向经纬高点位
viewer.flyToTarget(
  { latitude: 31.2304, longitude: 121.4737, height: 0 },
  { distance: 800, pitch: -30, duration: 2 }
)

// 飞向 3D Tiles 图层（自动用包围体中心）
viewer.flyToTarget(layer.tileset, {
  distance: 1200,
  heading: 30,
  pitch: -35,
  duration: 1.6
})

// 飞向自定义 Three.js 对象（用包围体中心）
viewer.flyToTarget(customObject3D, { distance: 500 })
```

`flyToTarget` 的偏移参数定义的是**相机相对目标**的姿态：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `distance` | `max(包围体半径 × 2.8, 500)` | 相机到目标点的距离（米）。 |
| `heading` | `0` | 相机看向目标时的航向角（度）。 |
| `pitch` | `-30` | 相机看向目标时的俯仰角（度）。 |
| `roll` | `0` | 相机看向目标时的翻滚角（度）。 |

对于 `TilesRenderer` 目标，如果根 tileset 还未加载，`flyToTarget` 会在 `load-root-tileset` 事件后自动执行飞行，无需手动等待。

## 瞬时切换视角

`viewer.camera.setView(options)` 立即设置视角，不带动画，并会取消进行中的飞行：

```ts
viewer.camera.setView({
  destination: {
    latitude: 39.9042,
    longitude: 116.4074,
    height: 2000
  },
  orientation: {
    heading: 0,
    pitch: -45
  }
})
```

`setView` 的 `destination` 省略高度时沿用当前相机高度。

## 取消飞行

主动取消进行中的飞行，并触发其 `cancel` 回调：

```ts
viewer.camera.cancelFlight()
```

用户交互（拖拽、滚轮）默认也会打断飞行。

## 读取当前视角

```ts
// 当前相机相对椭球表面的海拔高度（米）
const height = viewer.camera.getCurrentHeight()

// 当前完整视角（`destination` + `orientation`）
const state = viewer.camera.getState()
```

`getState()` 返回的对象可以直接回传给 `setView` 或 `flyTo`，便于保存和恢复视角。

## 底层 Three.js 相机

如需接入自定义渲染管线或 raycaster，可通过 `viewer.camera.raw` 拿到底层 `THREE.PerspectiveCamera`：

```ts
const threeCamera = viewer.camera.raw
```

通常不需要直接操作它，Tellux 的控制器、飞行和采样都已经在内部维护它的位置和朝向。
