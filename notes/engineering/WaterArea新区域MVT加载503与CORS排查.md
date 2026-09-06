# Water Area 新区域 MVT 加载：503 被表现为 CORS 错误

> 2026-09-06 浏览器实测记录。适用于当时本地 WebGPU Water Area 案例与 OSM Shortbread 数据源。已定位一次失败链路，尚未实施请求调度或数据源修复；不代表服务持续故障，也不代表所有 CORS 错误都由 503 引起。

## 结论与边界

移动相机进入新区域后，OSM 矢量瓦片服务的 Varnish 响应出现 **503、HTML 错误页、缺少 `Access-Control-Allow-Origin`**，同期 Worker 控制台报告 CORS 拦截。浏览器中的 `fetch` 只向业务代码暴露 `TypeError: Failed to fetch`，不能据此读到真实 HTTP 状态。

已确认的是“上游失败响应缺少跨域头，浏览器报告 CORS”的链路。**为什么上游返回 503 仍未知**：本次没有服务端日志，不能认定是限流、瓦片生成超时或某个 CDN 节点故障。成功响应带 `Access-Control-Allow-Origin: *`，因此不能把本次问题描述成服务固定禁止 localhost 跨域。

另有已测得的重复 `fetch` 调用，以及源码确认的 Worker 缓存隔离；它们可能增加请求压力，但没有对照实验证明它们导致了 503。

## 复现条件与容易漏掉的验证

- 环境：Windows，Codex 内置浏览器，`http://localhost:5173/water-area.html`，WebGPU；本地 `3d-tiles-renderer` 安装版本核对为 `0.4.28`。
- 数据源：`https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt`。
- 进入页面，等待初始地形与水面出现；滚轮拉远后连续拖动相机，进入此前未加载的区域，等待新瓦片请求结束。实测部分失败等待约 16～32 秒才显现，不能移动后立即读一次日志就判定通过。
- 本次失败 URL 包括 `11/271/626.mvt`、`11/271/627.mvt`、`10/143/335.mvt`、`10/143/336.mvt`。具体 URL 与复现概率随视角、缓存和服务状态变化，不是固定坏瓦片清单。

初始视角渲染正常、开关正常或刷新正常，**均不能覆盖新区域数据加载**。先前回归只覆盖这些路径，遗漏了本次问题。事后单独请求某块瓦片得到 200，也不能推翻此前浏览器中的失败；本次确实观察到同一瓦片后续恢复成功。

## 关键证据

2026-09-06 12:36:41～12:36:45（Asia/Shanghai），浏览器 CDP `Network.responseReceivedExtraInfo` 捕获到以下失败响应特征，`Log.entryAdded` 同期记录 `source: worker` 的 CORS 错误，指向 `10/143/335.mvt` 和 `10/143/336.mvt`：

```text
statusCode: 503
server: Varnish
content-type: text/html; charset=utf-8
content-length: 447
x-cache: MISS
x-served-by: cache-itm1220075-ITM
retry-after: 0
access-control-allow-origin: 缺失
```

同期成功响应是 `200`、`application/vnd.mapbox-vector-tile`，带 `access-control-allow-origin: *`。本次未保存完整 HAR，也未取得 503 HTML 正文或每条 Worker 请求的完整 requestId 对照；上述记录保留实测范围，不外推为所有失败的逐条归因。

临时在 `WaterAreaTileSource.get` 的真实 `fetch` 前后记录 URL、阶段、状态、耗时和异常，得到这一轮样本：

- 143 个不同 URL，1511 次 `fetch` 调用，11 次 `Failed to fetch`。
- 同一 URL 最多调用 32 次。
- **调用次数不等于实际出网次数**：部分成功请求仅耗时数毫秒，可由浏览器缓存满足；本次未测得网络下载放大倍数。

原始本机日志位于 `.frontend-debug/logs.jsonl`，不作为仓库长期依赖；上述摘要在沉淀时重新统计核对。临时探针已清除，日志服务已停止，源码恢复到加探针之前。本记录本身不表示故障已修复。

## 调试方法与源码线索

最初主页面 console 日志接口没有展示 Worker 的错误，主页面请求列表也未完整反映 MVT 加载。不要将“工具返回空错误列表”理解为所有线程无错。此次通过 CDP `Log.enable` / `Log.entryAdded` 取得 Worker CORS 消息，通过 `Network.responseReceivedExtraInfo` 取得浏览器对脚本隐藏的错误响应头；探针补充了 Worker 内实际执行的请求结果。

- [Worker Pool](../../examples/water-area/worker/pool.ts)：`maxWorkers: 8`。
- [MVT 请求、缓存与栅格化](../../examples/water-area/worker/tasks/computeWaterAreaTileImage.ts)：每个 Worker 的模块各自创建 `WaterAreaTileCache`，`maxCacheCount` 默认配置为 4，`inflight` 只在该缓存实例内合并；没有跨 Worker 的请求合并。此处直接 `fetch(url)`，这一层没有显式超时和退避重试。
- [案例数据与材质背景](<../research/three-geospatial WebGPU Water Area案例调研.md>)：MVT 生成水域 mask；网络失败不能当作“该区域无水”的分类结果。

## 后续建议与最小验证

以下是待评估建议，不是已采纳架构或已完成修改：

1. 评估跨 Worker 共享请求、在途去重与有界缓存；固定相同移动轨迹，对比改动前后的调用次数、实际出网次数、并发峰值与错误率。不能仅扩大缓存就宣称解决上游 503。
2. 对可重试失败增加有限退避重试、超时和并发限制；避免无上限重发，也不将失败缓存为纯陆地。跨域失败在脚本侧无法读取 503，需要区分“可见 HTTP 错误”与“网络/CORS 不透明失败”。
3. 若要求稳定服务，评估可配置数据源或带缓存的同源网关。代理能暴露真实上游状态、控制缓存与重试，不能保证上游可用；`mode: 'no-cors'` 返回不可读响应，不能用于解析 MVT。

验收至少覆盖初始视角、新区域加载、失败后恢复，并同时检查 Worker 与页面日志。当前结论依赖外部服务当时状态；重开已缓存页面不算重新验证该故障。
