# sampleHeightMostDetailed 实现链路

本文档记录 `Viewer.sampleHeightMostDetailed` 的当前实现逻辑，重点说明它如何驱动采样专用瓦片加载、如何判断目标区域已经达到最高细节，以及最终如何从瓦片几何中取高度。

相关源码：

- `src/Viewer.ts`
- `src/sampling/HeightSampler.ts`
- `src/tiles/TilesetManager.ts`

## API 入口

公开入口是 `Viewer.sampleHeightMostDetailed(positions, options)`。

`Viewer` 本身不直接执行采样逻辑，而是转发到 `HeightSampler.sampleHeightMostDetailed`。这样可以把 viewer 主渲染、鼠标拾取、模型管理和高度采样状态机分开。

输入参数：

- `positions`: 经纬度数组，格式为 `[longitude, latitude]`。
- `options.source`: 采样数据源，支持 `'all'`、`'terrain'`、`'tileset'`。
- `options.minimumHeight`: 沿当地法线向下采样的最低高度。
- `options.maximumHeight`: 沿当地法线向下采样的最高高度。
- `options.resolution`: 采样相机参与瓦片误差计算时使用的像素分辨率。
- `options.maxFrames`: 单个 batch 最多等待的采样更新帧数。

返回值是与输入顺序一致的数组。命中时返回 `[longitude, latitude, height]`，未命中时返回 `undefined`。

## 总体流程

`sampleHeightMostDetailed` 的流程可以概括为：

1. 创建采样专用 tileset。
2. 为每个采样点构造沿当地地表法线向下的射线。
3. 按空间范围和数量把采样点拆成 batch。
4. 在 `Viewer.render` 后用异步采样 pass 增量推进 batch。
5. 为 batch 配置离屏采样相机和 `LoadRegionPlugin` 的 ray region。
6. 循环调用采样 tileset 的 `update()`，直到目标 ray 上的瓦片达到最细可用层级，或超过 `maxFrames`。
7. 对 active tiles 做射线求交，取最终高度。
8. 清理临时 region、相机和采样 tileset。

当前实现不会在采样 pass 中调用 `renderer.render()`，因此不会用离屏 WebGL 渲染阻塞主渲染流程。采样相机只用于驱动 `3d-tiles-renderer` 的视锥、SSE 和瓦片调度。

## 采样专用 Tileset

`TilesetManager.createHeightSamplingTilesets(source)` 会为 most-detailed 采样创建独立 tileset，而不是直接复用主场景中的 tileset。

这样做有几个目的：

- 避免采样请求改变主视角的瓦片加载状态。
- 允许采样 tileset 使用更激进的加载参数，例如 `errorTarget = 0`。
- 避免采样相机和主相机互相影响。
- 采样结束后可以整体 dispose 临时资源。

不同 source 的行为：

- `terrain`: 只创建地形采样 tileset。
- `tileset`: 为可见 3D Tiles 图层创建采样 tileset。
- `all`: 同时包含可见 3D Tiles 图层和地形。

采样 tileset 的关键配置：

- `displayActiveTiles = true`
- `loadAncestors = true`
- `loadSiblings = false`
- `errorTarget = 0`
- 限制下载、解析和节点处理队列并发，降低对主线程和网络的冲击。

`loadAncestors = true` 可以在子瓦片加载前保留父瓦片作为 fallback，但这也意味着最终射线求交时父子瓦片可能同时 active，命中选择必须额外处理。

## 采样任务与射线

每个输入点会生成一个 `HeightSamplingTask`。

任务中保存：

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

这个方向和鼠标拾取不同：鼠标拾取来自屏幕相机，地形高度采样则固定沿当地地表法线向下。

## Batch 拆分

批量采样会先按纬度、经度排序，再按两个条件拆 batch：

- 每个 batch 最多 `DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_BATCH_SIZE` 个点。
- batch 经纬度跨度不超过 `DEFAULT_SAMPLE_HEIGHT_MOST_DETAILED_MAX_BATCH_SPAN_DEGREES`。

这样做是为了让一个 batch 内的点尽量空间接近，采样相机可以覆盖较小区域，`LoadRegionPlugin` 也不会同时拉取过于分散的瓦片。

## 采样更新调度

`sampleHeightMostDetailed` 不会自己开一个同步 while 循环，也不会自己渲染离屏帧。

它把 job 放进 `HeightSampler` 的队列后，由 `Viewer.render()` 在主场景渲染后调用 `scheduleHeightSamplingUpdate()`。该方法用 `setTimeout(..., 0)` 安排一次异步采样 pass，再调用 `heightSampler.updateMostDetailedSampling()`。

这个设计有两个效果：

- 主场景 render 先完成，采样更新不阻塞当前帧的 WebGL 绘制。
- 每次采样 pass 默认只推进有限数量的 batch，避免一次性处理过多瓦片更新。

如果 `Viewer.useDefaultRenderLoop` 为 `false`，调用方需要继续调用 `viewer.render()` 推进 pending sampling job。

## 采样相机

每个 batch 会创建一个 `THREE.OrthographicCamera`。

采样相机的位置和方向：

- batch 内所有采样点的地表位置求平均，作为观察中心。
- batch 内所有当地法线求平均，作为 up 方向参考。
- 相机放在中心点沿平均法线抬升 `maximumHeight` 的位置。
- 相机朝向地表。

相机视锥范围：

- 把 batch 内采样点转换到相机局部空间。
- 用这些点生成二维 bounds。
- 加 padding 后设置 orthographic camera 的 left/right/top/bottom。

相机用途：

- 注册到采样 tileset：`tileset.setCamera(camera)`。
- 设置分辨率：`tileset.setResolution(camera, resolution, resolution)`。
- 参与 `3d-tiles-renderer` 的视锥判断和 screen-space error 计算。

相机不会用于 `renderer.render(scene, camera)`。

## LoadRegionPlugin

每个采样 task 都会给每个采样 tileset 添加一个临时 `RayRegion`。

配置：

- `ray`: 采样 ray 转换到 tileset local frame 后的射线。
- `errorTarget = 0`。
- `mask = true`。

`RayRegion` 的作用是让 `3d-tiles-renderer` 在采样 ray 穿过的局部区域继续加载和细化瓦片。`mask = true` 会抑制 region 外的瓦片参与加载，减少不相关瓦片请求。

采样结束时，batch 会移除所有临时 region，并从 tileset 删除采样相机。

## 最高细节判断

当前实现不把“请求队列空了”直接等同于最高细节。队列空只能说明当前没有正在下载、解析或处理的任务，不能证明目标采样点没有更深层可用瓦片。

batch 每次更新时会检查：

- 采样 tileset root 是否存在。
- `isLoading`、`loadProgress`、`stats` 是否仍有队列任务。
- `downloadQueue`、`parseQueue`、`processNodeQueue` 是否 running。
- `loadingTiles` 是否仍有内容。
- 是否有可渲染瓦片。
- batch 内每条采样 ray 是否都达到 most-detailed。

`isHeightSamplingBatchMostDetailed` 会对每个 task 的 ray 执行目标链路检查：

1. 把采样 ray 转换到 tileset local frame。
2. 从 root tile 开始递归检查 ray 是否穿过 tile bounding volume。
3. 如果 tile 尚未初始化 traversal，或者内容尚未加载完成，则未完成。
4. 如果 tile 已满足误差目标、达到 `maxDepth`，或没有子节点，则认为该分支 ready。
5. 如果子节点还未 preprocess 出 traversal，则未完成。
6. 递归检查与 ray 相交的子节点。

batch 需要连续稳定若干帧满足 ready 条件才会完成。这样可以避免某一帧刚好队列为空或 traversal 状态尚未稳定时提前采样。

## 高度求交与结果选择

batch 完成后，`HeightSampler` 会对每个 task 执行 raycast。

优先路径是遍历采样 tileset 的 `activeTiles`：

1. 对每个 active tile 的 `engineData.scene` 做 Three.js raycast。
2. 过滤 quantized-mesh terrain 的 skirt，只接受 surface group。
3. 把 hit point 从 world frame 转到 tileset local frame。
4. 用 tileset ellipsoid 转成 cartographic height。

命中选择规则：

- 对 quantized-mesh terrain，父级 fallback 和子级精细瓦片可能同时 active；因此优先选择 tile depth 更深的命中。
- 同一 depth 下按 ray distance 选择最近命中。
- 非 terrain 命中保持按 ray distance 最近优先。

如果 active tile 路径没有命中，会 fallback 到 `TilesRenderer.raycast()`。

这个深度优先策略是地形采样准确性的关键之一。因为 `loadAncestors = true` 会保留父瓦片作为子瓦片加载期间的 fallback，如果只按距离取最近命中，低级父瓦片可能抢在更高精度子瓦片前返回，导致高度偏差。

## Fallback 行为

如果没有创建采样专用 tileset，例如当前没有 terrain 或对应 source 没有可用图层，实现会退回到 `sampleHeightFromLoadedTiles`。

这个 fallback 只使用当前已经加载在主场景中的 tileset，不会额外请求视角外瓦片。因此它不保证 most-detailed，只保证在现有加载内容中做一次 raycast。

如果 batch 超过 `maxFrames` 仍未达到 ready，也会完成当前 batch 并采样已有结果。此时返回值可能是当前加载状态下的最佳结果，而不是严格最高细节。

## 与 Cesium 思路的关系

Cesium 中存在两类相关能力：

- `sampleTerrainMostDetailed`: 基于 terrain availability 计算指定经纬度的最大可用层级，再请求该层级进行高度插值。
- `Scene.sampleHeightMostDetailed`: 通过 most-detailed pick pass 驱动 3D Tiles 细化，等 pass ready 后再做拾取。

Tellux 当前实现更接近第二类：通过采样相机、`LoadRegionPlugin` 和采样专用 tileset 驱动 `3d-tiles-renderer` traversal，然后用 raycast 获取几何高度。

它没有直接解析 quantized-mesh availability 并做三角形插值。因此它依赖 `3d-tiles-renderer` 的 tile traversal、active tiles 和 quantized-mesh 插件生成的几何。

## 排查要点

如果 `sampleHeightMostDetailed` 返回高度不准确，优先检查：

- 采样 source 是否正确，例如只采地形时应使用 `{ source: 'terrain' }`。
- `maximumHeight` / `minimumHeight` 是否覆盖目标地表高度。
- 采样 batch 是否因 `maxFrames` 太小提前结束。
- `isTilesetLoading` 是否完整覆盖 download、parse、processNode 三个队列。
- `RayRegion` 是否正确转换到了 tileset local frame。
- `LoadRegionPlugin` 是否注册到采样 tileset，而不是主场景 tileset。
- `mask` 是否导致 batch 内较分散采样点互相裁剪；如果采样点分散，需要调小 batch 范围或拆分 batch。
- active tile 命中是否优先选择了更深层 terrain tile。
- terrain skirt 是否被过滤，避免命中瓦片裙边。

如果主线程出现卡顿，优先检查：

- 是否重新引入了 `renderer.render(scene, sampleCamera)`。
- `maxPasses` 是否过大。
- batch size 是否过大。
- `maxTilesProcessed`、下载队列、解析队列并发是否过高。

## 已知限制

- 当前 most-detailed 判断是基于 `3d-tiles-renderer` traversal 状态，不是 Cesium terrain availability 的直接最大层级查询。
- 如果 terrain 服务 metadata 不完整，或 quantized-mesh 插件无法发现更深 availability，采样无法凭空知道更高层级存在。
- 超过 `maxFrames` 后会返回当前最佳加载结果，不保证严格最高细节。
- 对非常分散的大批量采样，batch 相机和 region 数量会影响加载效率，需要通过 batch size 和 span 控制。
