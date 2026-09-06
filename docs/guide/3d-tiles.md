# 3D Tiles

Tellux 支持加载独立的 3D Tiles 场景数据。该能力适合倾斜摄影、建筑群、点云和其他 3D Tiles 内容。

## 从 tileset.json 加载

```ts
const layer = viewer.tilesets.add({
  id: 'city',
  source: {
    type: 'url',
    url: 'https://example.com/tileset.json'
  }
})
```

摄影测量等街景模型通常需要更细的 LOD，并配合 `creasedNormals` 改善后处理光照：

```ts
const layer = viewer.tilesets.add({
  id: 'hk',
  source: {
    type: 'url',
    url: '/3dtiles/hk/tileset.json'
  },
  creasedNormals: true,
  tileLoading: {
    errorTarget: 4,
    loadSiblings: true
  }
})
```

`tileLoading.errorTarget` 是目标屏幕空间误差（像素），越小越细，默认 `16`。`loadSiblings` 可在相机移动时减少瓦片空洞，默认 `true`。

在浏览器 Network 面板里，3D Tiles 加载过程中常会出现大量状态为 `canceled` 的 `.b3dm` 请求。这通常是 LOD 细化时引擎主动中止不再需要的粗瓦片或兄弟瓦片下载，**不代表服务器错误或数据缺失**。只要最终画面能稳定显示细节，并且没有持续的 `404` / `CORS error`，就可以视为正常行为。

## 从 Cesium Ion 加载

```ts
const layer = viewer.tilesets.add({
  id: 'ion-tileset',
  source: {
    type: 'cesium-ion',
    assetId: 123456,
    apiToken: cesiumIonToken
  }
})
```

Cesium Ion 上的 Melbourne Point Cloud（asset `43978`）这类资源使用 legacy `pnts` 点云瓦片，且常带 Draco 压缩。Tellux 默认的 `/draco/` 完整 decoder 可以解码这类数据。

点云通过 Cesium 形 `pointCloudShading` 控制着色（实现跟 Tellux 大气管线，**不是**像素级复刻 Cesium）：

```ts
const layer = viewer.tilesets.add({
  source: {
    type: 'cesium-ion',
    apiToken,
    assetId: 43978
  },
  pointCloudShading: {
    attenuation: true,
    geometricErrorScale: 1,
    maximumAttenuation: 8,
    eyeDomeLighting: true,
    normalShading: true
  }
})

// 运行时
layer.pointCloudShading.eyeDomeLighting = false
```

| 字段 | Tellux 默认 | 说明 |
|------|-------------|------|
| `attenuation` | `false` | 按瓦片 `geometricError` 调屏幕点大小 |
| `eyeDomeLighting` | `false`（Cesium 文档常为 `true`） | 独立 mask + 深度 EDL；**仅 WebGL** |
| `normalShading` | `true` | 有几何 `normal` 时接受场景光照；无法线时始终 unlit，`false` 可强制 unlit |
| `baseResolution` | — | 瓦片缺少有效 `geometricError` 时的 attenuation 回退值 |
| `backFaceCulling` | — | 类型预留，当前 no-op |

Melbourne asset `43978` 的抽样 `pnts` 只声明 `POSITION` / `RGB`，没有 `NORMAL`；Cesium 对这类数据也不会重建法线，而是使用 unlit 材质。Tellux 采用相同语义：无法线点保留原始顶点色，不接受太阳、昼夜或大气辐照，也不让空气透视再次洗色；WebGL 全屏 AgX output pass 下会自动做显示色逆变换，避免 Viewer 曝光把点色冲白。该变换属于颜色管理，不会注入光照或改写点数据；体积感仍由可选的 attenuation 和深度 EDL 提供。完整示例见 [`point-cloud-3d-tiles.html`](../../point-cloud-3d-tiles.html)。

## 定位到 3D Tiles

`flyToTarget` 可以接收 3D Tiles renderer、Three.js 对象或经纬高点位。

```ts
viewer.flyToTarget(layer.tileset, {
  heading: 30,
  pitch: -35,
  distance: 1200,
  duration: 1.6
})
```

## 高斯泼溅案例

案例的“保留数据颜色”用于补偿 Tellux 最终曝光 / AgX 对高斯显示色的影响，默认开启；关闭可与原始输出路径对比。它不调整全局曝光，透明混合区域仍可能与其他渲染器不同。

[高斯泼溅案例](../../gaussian-splat-3d-tiles.html)提供 SvirnasAlyt、Elevator、Cesium ion / Redmond 和 Spark / Butterfly 四种预设。切换预设后自动加载，也可编辑 URL 或 ion 的 Asset ID / Token 后重试。

- 两个 GitHub 预设使用固定提交中的高斯 3D Tiles，按相机需要加载瓦片。
- 官方资产 `4547222` 的 Token 留空时使用 CesiumJS 公开评估 token，无需自己的 token，与[官方教程](https://cesium.com/learn/cesiumjs-learn/3d-guassian-splat-tilesets-lods/)一致。显式填写 token 优先；其他资产留空时使用 `VITE_CESIUM_ION_TOKEN`。评估 token 不用于生产应用。
- Spark 单文件不经过 TilesRenderer；蝴蝶被放置到展示锚点，缩放至约 12 米，不代表真实地理位置。可替换为 Spark 支持的单文件 URL。
- 保留自定义 tileset URL，可通过 `VITE_GAUSSIAN_SPLAT_3D_TILESET_URL` 设置默认值。

面板提供定位、移除、高斯与地球显示开关；3D Tiles 模式还提供细节误差，数值越低，加载量通常越大。该案例在示例侧接入 GaussianSplatPlugin / Spark，使用 WebGL，不是 `viewer.tilesets` 的内置高斯 API。

## 移除图层

```ts
layer.remove()

// 或按 id 移除
viewer.remove3DTileset('city')
```
