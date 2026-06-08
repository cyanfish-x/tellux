# sampleHeightMostDetailed 实现链路

本文档记录 `Viewer.sampleHeightMostDetailed` 的当前实现逻辑，重点说明 `terrain` 模式如何直接按 quantized-mesh terrain 的最高可用层级采样，以及其他模式如何通过采样专用 tileset 和 raycast 兜底。

相关源码：

- `src/Viewer.ts`
- `src/sampling/HeightSampler.ts`
- `src/sampling/QuantizedMeshTerrainSampler.ts`
- `src/tiles/TilesetManager.ts`
- `src/TerrainFetchPlugin.ts`

## API 入口

公开入口是 `Viewer.sampleHeightMostDetailed(positions, options)`。

`Viewer` 本身不直接执行采样逻辑，而是转发到 `HeightSampler.sampleHeightMostDetailed`。输入点格式为 `[longitude, latitude]`，返回值与输入顺序一致：命中时返回 `[longitude, latitude, height]`，未命中时返回 `undefined`。

关键选项：

- `options.source`: 采样数据源，支持 `'all'`、`'terrain'`、`'tileset'`。
- `options.minimumHeight` / `options.maximumHeight`: raycast 兜底路径的高度范围。
- `options.resolution`: raycast 兜底路径中采样相机参与瓦片误差计算时使用的像素分辨率。
- `options.maxFrames`: raycast 兜底路径中单个 batch 最多等待的采样更新帧数。

## 总体分流

`sampleHeightMostDetailed` 现在有两条主要链路：

1. `source: 'terrain'` 优先走 `QuantizedMeshTerrainSampler`。
2. `source: 'tileset'`、`source: 'all'`，或 terrain 直采失败时，走采样专用 `TilesRenderer` + `LoadRegionPlugin` + raycast 链路。

terrain 直采不创建离屏相机，不创建采样 tileset，也不会调用 `TilesRenderer.update()`。它直接读取 terrain 服务的 `layer.json` 和目标 `.terrain` 文件，然后在 quantized-mesh 三角网中插值高度。

## Terrain 直采链路

`source: 'terrain'` 且当前 viewer 启用了 terrain 时，`HeightSampler` 会调用 `QuantizedMeshTerrainSampler.sampleMostDetailed`。

流程：

1. 归一化 terrain URL。如果传入的是 `layer.json`，转换为 terrain 根目录；如果传入根目录但缺少 `/`，补齐尾部斜杠。
2. 加载并缓存 `layer.json`。
3. 读取 `projection`、`available`、`metadataAvailability`、`maxzoom` 和 `tiles` 模板。
4. 对每个采样点，把经纬度转换到 terrain projection 的 normalized 坐标。
5. 从当前已知 availability 中找到覆盖该点的最深瓦片。
6. 如果该瓦片按 `metadataAvailability` 规则可能携带更深 availability，则加载该 `.terrain`，解析 metadata 扩展，合并新的 `available` 信息。
7. 重复第 5-6 步，直到到达 `maxzoom`，或没有更深 availability。
8. 按最终最高可用瓦片分组，同一个瓦片只请求一次。
9. 解析 quantized-mesh vertex/index buffer。
10. 在 UV 平面中找到覆盖采样点的三角形，用重心坐标插值高度。

这个链路更接近 Cesium 的 `sampleTerrainMostDetailed`：最高细节由 terrain availability 决定，而不是由相机视角、SSE 或当前场景 active tiles 决定。

## URL 与 gzip 处理

直采链路会复用 Tellux terrain 加载的一些约定：

- terrain URL 上的 query 参数会继承到 `layer.json` 和 `.terrain` 请求。
- `.terrain` 请求会带 `Accept: application/vnd.quantized-mesh,application/octet-stream;q=0.9;extensions=octvertexnormals-watermask-metadata`。
- 如果 `.terrain` 返回 gzip 字节但服务端没有设置 `Content-Encoding: gzip`，会用 `DecompressionStream('gzip')` 做兜底解压。

## Quantized-Mesh 插值

`.terrain` 文件解析内容包括：

- header 中的 `minHeight`、`maxHeight`
- 解码后的 `u`、`v`、`height`
- 解码后的 triangle indices
- metadata 扩展中的 `available`

高度插值逻辑：

1. 根据瓦片经纬度 bounds，把采样点转换成瓦片局部 UV。
2. 遍历 terrain surface triangles。
3. 在 UV 平面中计算重心坐标。
4. 命中三角形后，对三个顶点的 normalized height 做重心插值。
5. 用 `minHeight + (maxHeight - minHeight) * normalizedHeight` 转成米。

直采不会生成 Three.js 几何，也不会包含 terrain skirt，因此不会命中裙边。

## 直采缓存与批量性能

`QuantizedMeshTerrainSampler` 维护两个缓存：

- `layerCache`: 按 terrain 根 URL 缓存 `layer.json` 和已经合并的 availability。
- `tileCache`: 按 `terrainRoot|level/x/y` 缓存解析后的 `.terrain`。

批量采样会先按最终瓦片分组，因此同一瓦片内的多个点只产生一次网络请求和一次 quantized-mesh 解析。对 `instanced-horses` 这类大量点落在少量地形瓦片内的场景，主要收益来自跳过隐藏 `TilesRenderer` traversal、跳过 Three.js raycast、跳过几何构建和重用同瓦片解析结果。

## Raycast 兜底链路

当 `source` 不是纯 terrain，或 terrain 直采抛错时，会进入原有采样 tileset 链路。

`TilesetManager.createHeightSamplingTilesets(source)` 会为 most-detailed 采样创建独立 tileset，而不是直接复用主场景 tileset。这样可以避免采样相机改变主视角的瓦片加载状态，也可以让采样 tileset 使用更激进的参数。

采样 tileset 的关键配置：

- `displayActiveTiles = true`
- `loadAncestors = true`
- `loadSiblings = false`
- `errorTarget = 0`
- 限制下载、解析和节点处理队列并发

采样 tileset 会被池化复用。terrain 配置、图层配置或 3D Tiles 图层变化时，池会失效并释放旧 tileset。

## 兜底任务与射线

兜底链路会为每个输入点生成一个 `HeightSamplingTask`：

- 原始输入下标，用于恢复返回顺序。
- 经纬度位置。
- 地表零高程点。
- 当地地表法线方向。
- 从 `maximumHeight` 处沿当地法线向下的 `THREE.Ray`。
- 对应的 `THREE.Raycaster`。

射线构造逻辑是：

1. 用 ellipsoid 把经纬度转换到地球表面零高程点。
2. 计算该点的当地法线。
3. 从表面点沿法线抬升 `maximumHeight` 得到 ray origin。
4. ray direction 取当地法线反方向。
5. raycaster 的 far 取 `maximumHeight - minimumHeight`。

## Batch 与异步更新

兜底链路会按纬度、经度排序，再按 batch size 和经纬度跨度拆分任务。

`sampleHeightMostDetailed` 不会自己开同步 while 循环，也不会渲染离屏帧。它把 job 放进 `HeightSampler` 队列后，由 `Viewer.render()` 在主场景渲染后通过 `setTimeout(..., 0)` 安排采样 pass，再调用 `heightSampler.updateMostDetailedSampling()`。

这个设计保证当前帧的 WebGL 绘制先完成。采样 pass 默认只推进有限数量的 batch，避免一次性处理过多瓦片更新。

## 采样相机与 LoadRegionPlugin

兜底链路的每个 batch 会创建一个 `THREE.OrthographicCamera`。相机只用于参与 `3d-tiles-renderer` 的视锥判断和 screen-space error 计算，不会用于 `renderer.render(scene, camera)`。

每个采样 task 还会给每个采样 tileset 添加一个临时 `RayRegion`：

- `ray`: 采样 ray 转换到 tileset local frame 后的射线。
- `errorTarget = 0`。
- `mask = true`。

`RayRegion` 会让 `3d-tiles-renderer` 在采样 ray 穿过的区域继续加载和细化瓦片，并抑制 region 外瓦片参与加载。

## 兜底最高细节判断

兜底链路不把“请求队列空了”直接等同于最高细节。队列空只能说明当前没有正在下载、解析或处理的任务，不能证明目标 ray 上没有更深层可用瓦片。

batch 每次更新时会检查：

- root 是否存在。
- `isLoading`、`loadProgress`、`stats` 是否仍有队列任务。
- `downloadQueue`、`parseQueue`、`processNodeQueue` 是否 running。
- `loadingTiles` 是否仍有内容。
- 是否有可渲染瓦片。
- batch 内每条采样 ray 是否都达到 most-detailed。

`isHeightSamplingBatchMostDetailed` 会从 root tile 开始递归检查与采样 ray 相交的 tile 分支。如果相交分支的 tile 尚未初始化 traversal、内容尚未加载完成、子节点尚未 preprocess，都会继续等待。只有达到误差目标、达到 `maxDepth`、没有子节点，或所有相交子分支都 ready 时，该 ray 才认为 ready。

## 兜底高度求交

batch 完成后，兜底链路会对每个 task 执行 raycast。

优先路径是遍历采样 tileset 的 `activeTiles`：

1. 先用 tile bounding volume 和采样 ray 做快速相交过滤。
2. 对相交 active tile 的 `engineData.scene` 做 Three.js raycast。
3. 过滤 quantized-mesh terrain 的 skirt，只接受 surface group。
4. 把 hit point 从 world frame 转到 tileset local frame。
5. 用 tileset ellipsoid 转成 cartographic height。

命中选择规则：

- 对 quantized-mesh terrain，父级 fallback 和子级精细瓦片可能同时 active，因此优先选择 tile depth 更深的命中。
- 同一 depth 下按 ray distance 选择最近命中。
- 非 terrain 命中保持按 ray distance 最近优先。

如果 active tile 路径没有命中，会 fallback 到 `TilesRenderer.raycast()`。

## Fallback 行为

terrain 直采失败时，`HeightSampler` 会打印 warning，并回到采样 tileset 兜底链路。

如果没有创建采样专用 tileset，例如当前没有 terrain 或对应 source 没有可用图层，实现会退回到 `sampleHeightFromLoadedTiles`。这个 fallback 只使用当前已经加载在主场景中的 tileset，不会额外请求视角外瓦片，因此不保证 most-detailed。

如果兜底 batch 超过 `maxFrames` 仍未达到 ready，也会完成当前 batch 并采样已有结果。此时返回值可能是当前加载状态下的最佳结果，而不是严格最高细节。

## 与 Cesium 思路的关系

Cesium 中存在两类相关能力：

- `sampleTerrainMostDetailed`: 基于 terrain availability 计算指定经纬度的最大可用层级，再请求该层级进行高度插值。
- `Scene.sampleHeightMostDetailed`: 通过 most-detailed pick pass 驱动 3D Tiles 细化，等 pass ready 后再做拾取。

Tellux 当前实现也对应这两类：

- `source: 'terrain'`: 使用 direct quantized-mesh 采样，更接近 `sampleTerrainMostDetailed`。
- `source: 'tileset'` / `source: 'all'`: 使用采样 tileset、LoadRegion 和 raycast，更接近 scene pick pass。

## 排查要点

如果 terrain 模式返回高度不准确，优先检查：

- 是否使用 `{ source: 'terrain' }`。
- terrain `layer.json` 是否包含完整 `available`，或 `.terrain` metadata 是否包含更深层 availability。
- `metadataAvailability` 是否与服务端 metadata 实际发布方式一致。
- terrain projection 是否为当前支持的 `EPSG:4326`、`CRS:84` 或 `EPSG:3857`。
- `.terrain` 请求是否实际返回 quantized-mesh，而不是鉴权失败 HTML 或错误 JSON。

如果兜底 raycast 模式返回高度不准确，优先检查：

- `maximumHeight` / `minimumHeight` 是否覆盖目标地表高度。
- 采样 batch 是否因 `maxFrames` 太小提前结束。
- `RayRegion` 是否正确转换到了 tileset local frame。
- active tile 命中是否优先选择了更深层 terrain tile。
- terrain skirt 是否被过滤，避免命中瓦片裙边。

如果主线程出现卡顿，优先检查：

- 是否重新引入了 `renderer.render(scene, sampleCamera)`。
- `maxPasses` 是否过大。
- batch size 是否过大。
- 兜底链路的 `maxTilesProcessed`、下载队列、解析队列并发是否过高。
- direct terrain 采样是否首次请求了大量不同最高层级瓦片；同瓦片重复采样会复用缓存，但大量离散点仍会产生大量 `.terrain` 请求和解析。
