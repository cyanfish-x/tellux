# Spark 纹理上传绕过 Three.js 状态缓存

适用范围：2026-09-06，Tellux 高斯案例，Three.js 0.184.0、Spark 2.1.0 ESM、3d-tiles-renderer 0.4.28、GaussianSplatPlugin 0.1.14，WebGL。用户在本次会话确认底图错乱与 ion 加载均已修复。对应提交：`233e099`。

## 结论与证据

底图瓦片出现上下错接，不是 ArcGIS URL 中 x/y 顺序写反。模板为 `/tile/{z}/{y}/{x}`，与 level/row/column 一致；XYZImageSource 按名称替换参数，tiling.flipY=true 表示北侧起算行号。不要因图像错缝就交换模板参数。

Spark 的排序纹理、LOD 索引和分页索引三处上传直接执行 `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)`。Three.js r184 的 `WebGLState.pixelStorei` 缓存最近值：原缓存为 true，Spark 原生写入 false 后缓存仍为 true，后续 Canvas 纹理请求 true 时 Three.js 跳过了写入，实际仍为 false，造成上下翻转失效。

证据分别覆盖不同层次：

- 上游源码：Spark `dist/spark.module.js` 的三个 `UNPACK_FLIP_Y_WEBGL` 写入点；Three.js `src/renderers/webgl/WebGLState.js` 的 `pixelStorei`；`WebGLTextures.js` 的纹理上传。
- 页面探针：包裹 `renderer.state.pixelStorei`，执行后读取 `gl.getParameter`，真实复现中连续记录 `{ requested: true, actual: false }`。原始日志位于本地 `.frontend-debug/logs.jsonl`，probe_id 为 H2；日志是临时产物，不作为未来唯一证据，关键数值已保留在此。
- 可重复测试：[sparkPixelStore.test.ts](../../examples/gaussian-splat/sparkPixelStore.test.ts)使用真实 Three.js WebGLState 和模拟 GL 状态，复现缓存失配，并逐一执行已安装 Spark 中的三个写入语句，验证后续 true 请求实际生效；另验证 ArcGIS URL 替换与行号方向。
- 视觉验收：2026-09-06 用户在本次会话确认“上面两个问题已修复”。未据此宣称其他平台、WebGPU 或其他 Spark 版本已验证。

## 修复与容易误判的缓存层

[pnpm patch](../../patches/@sparkjsdev__spark@2.1.0.patch)把三个写入改成 `renderer.state.pixelStorei(...)`，使真实 GL 状态与 Three.js 缓存同步。补丁由 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) 和 lockfile 固定，覆盖本项目使用的 ESM 入口；不修改地理坐标、UV、全局曝光或所有纹理的 flipY。

首次安装补丁后用户仍看到错乱。检查发现 `node_modules/.vite/deps` 的旧预构建仍包含原生 `gl.pixelStorei`，页面也仍记录失配。执行 `pnpm exec vite optimize --force --config examples/vite.config.ts` 后，新的依赖 chunk 已包含状态接口写入；用户硬刷新后确认修复。若页面提示旧依赖 504，再重启已有开发服务。不能只检查 node_modules 包源就声称浏览器已运行新实现。

## 升级后的最小复核

升级 Spark / Three.js 时检查上游是否改走缓存接口或恢复状态，再运行上述测试；上游修复后评估移除补丁，不把 2.1.0 的缺陷永久推广到新版本。仍需实际页面检查高斯排序后缩放地球时的瓦片接缝。

ImageBitmap 的预翻转、Canvas 的上传翻转、XYZ 行号方向是不同层次。该根因不证明所有错缝都由 Spark 引起，也不解释高斯颜色偏白；颜色需独立追踪解码、透明混合及最终曝光/色调映射。临时探针和日志服务已清理。
